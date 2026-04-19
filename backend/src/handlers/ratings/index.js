'use strict'

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand, BatchGetCommand } = require('@aws-sdk/lib-dynamodb')
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { requireAuth } = require('../../lib/auth')
const { ok, err, handleError } = require('../../lib/response')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const s3 = new S3Client({})
const TABLE = process.env.RATINGS_TABLE
const USERS_TABLE = process.env.USERS_TABLE
const BUCKET = process.env.TRAILS_BUCKET
const VALID_TIERS = ['S', 'A', 'B', 'C', 'D']

function photoUrl(key) {
  return key ? `https://${BUCKET}.s3.amazonaws.com/${key}` : null
}

async function handler(event) {
  try {
    const user = await requireAuth(event)
    const userId = user.sub
    const method = event.requestContext?.http?.method || event.httpMethod
    const rawPath = event.rawPath || ''

    // POST /ratings/upload-url
    if (method === 'POST' && rawPath.endsWith('/ratings/upload-url')) {
      const body = JSON.parse(event.body || '{}')
      if (!body.trailId) return err('trailId is required', 400)
      const ext = body.contentType === 'image/png' ? 'png' : 'jpg'
      const photoKey = `ratings/${userId}/${encodeURIComponent(body.trailId)}.${ext}`
      const uploadUrl = await getSignedUrl(
        s3,
        new PutObjectCommand({ Bucket: BUCKET, Key: photoKey, ContentType: body.contentType || 'image/jpeg' }),
        { expiresIn: 300 }
      )
      return ok({ uploadUrl, photoKey })
    }

    // POST /ratings
    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}')
      if (!body.trailId) return err('trailId is required', 400)
      if (!VALID_TIERS.includes(body.tier)) return err(`tier must be one of: ${VALID_TIERS.join(', ')}`, 400)
      if (body.review && body.review.length > 500) return err('review must be 500 characters or fewer', 400)

      const item = {
        userId,
        trailId: body.trailId,
        trailName: body.trailName || null,
        tier: body.tier,
        review: body.review || null,
        photoKey: body.photoKey || null,
        createdAt: new Date().toISOString(),
      }
      await dynamo.send(new PutCommand({ TableName: TABLE, Item: item }))

      const emailPrefix = (user.email || '').split('@')[0] || 'hiker'
      const displayName = user.name || user.nickname || emailPrefix
      await dynamo.send(new PutCommand({
        TableName: USERS_TABLE,
        Item: { userId, displayName, picture: user.picture || null, updatedAt: new Date().toISOString() },
      }))

      return ok(item, 201)
    }

    // GET /ratings/user/:userId
    if (method === 'GET' && rawPath.includes('/ratings/user/')) {
      const targetUserId = event.pathParameters?.userId
      if (!targetUserId) return err('userId is required', 400)

      const result = await dynamo.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'UserRatingsIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': targetUserId },
      }))

      const sorted = (result.Items || [])
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(item => ({ ...item, photoUrl: photoUrl(item.photoKey) }))
      return ok(sorted)
    }

    // GET /ratings/:trailId — community ratings + individual reviews with display names
    const trailId = event.pathParameters?.trailId
    if (method === 'GET' && trailId) {
      const result = await dynamo.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'TrailRatingsIndex',
        KeyConditionExpression: 'trailId = :trailId',
        ExpressionAttributeValues: { ':trailId': trailId },
      }))

      const items = result.Items || []

      // Batch-fetch display names from UsersTable
      let userMap = {}
      if (items.length > 0) {
        const keys = [...new Set(items.map(i => i.userId))].map(uid => ({ userId: uid }))
        const batchResult = await dynamo.send(new BatchGetCommand({
          RequestItems: { [USERS_TABLE]: { Keys: keys } },
        }))
        for (const u of (batchResult.Responses?.[USERS_TABLE] || [])) {
          userMap[u.userId] = u
        }
      }

      const tierCounts = { S: 0, A: 0, B: 0, C: 0, D: 0 }
      const reviews = items.map(item => {
        tierCounts[item.tier] = (tierCounts[item.tier] || 0) + 1
        const u = userMap[item.userId]
        return {
          userId: item.userId,
          displayName: u?.displayName || 'Hiker',
          tier: item.tier,
          review: item.review || null,
          photoUrl: photoUrl(item.photoKey),
          createdAt: item.createdAt,
        }
      }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      const communityTier = Object.entries(tierCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null
      return ok({ ratings: items, reviews, tierCounts, communityTier, totalRatings: items.length })
    }

    // DELETE /ratings/:trailId
    if (method === 'DELETE' && trailId) {
      const existing = await dynamo.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'UserRatingsIndex',
        KeyConditionExpression: 'userId = :userId',
        FilterExpression: 'trailId = :trailId',
        ExpressionAttributeValues: { ':userId': userId, ':trailId': trailId },
      }))
      const item = existing.Items?.[0]
      if (item?.photoKey) {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: item.photoKey })).catch(() => {})
      }
      await dynamo.send(new DeleteCommand({ TableName: TABLE, Key: { userId, trailId } }))
      return ok({ deleted: true })
    }

    return err('Method not allowed', 405)
  } catch (error) {
    return handleError(error)
  }
}

module.exports = { handler }
