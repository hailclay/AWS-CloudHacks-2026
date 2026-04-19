'use strict'

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, PutCommand, DeleteCommand, GetCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb')
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { requireAuth } = require('../../lib/auth')
const { ok, err, handleError } = require('../../lib/response')
const { randomUUID } = require('crypto')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const s3 = new S3Client({})
const TABLE = process.env.POSTS_TABLE
const BUCKET = process.env.TRAILS_BUCKET

async function handler(event) {
  try {
    const user = await requireAuth(event)
    const userId = user.sub
    const method = event.requestContext?.http?.method || event.httpMethod
    const postId = event.pathParameters?.id
    const trailId = event.pathParameters?.trailId
    const rawPath = event.rawPath || ''

    if (method === 'POST' && rawPath === '/posts') {
      const body = JSON.parse(event.body || '{}')
      if (!body.trailId) return err('trailId is required', 400)
      if (!body.caption) return err('caption is required', 400)
      if (body.caption.length > 280) return err('caption must be 280 characters or fewer', 400)
      if (body.wildlifeTag && body.wildlifeTag.length > 100) return err('wildlifeTag must be 100 characters or fewer', 400)

      const newPostId = randomUUID()
      let photoUploadUrl = null
      let photoKey = null

      if (body.hasPhoto) {
        photoKey = `posts/${newPostId}.jpg`
        photoUploadUrl = await getSignedUrl(
          s3,
          new PutObjectCommand({ Bucket: BUCKET, Key: photoKey, ContentType: 'image/jpeg' }),
          { expiresIn: 300 }
        )
      }

      const post = {
        postId: newPostId,
        userId,
        userDisplayName: user.name || user.nickname || 'Hiker',
        trailId: body.trailId,
        eventId: body.eventId || null,
        caption: body.caption,
        wildlifeTag: body.wildlifeTag || null,
        photoKey,
        photoUploaded: false,
        createdAt: new Date().toISOString(),
      }

      await dynamo.send(new PutCommand({ TableName: TABLE, Item: post }))
      return ok({ post, photoUploadUrl }, 201)
    }

    if (method === 'GET' && rawPath === '/feed') {
      const result = await dynamo.send(new ScanCommand({ TableName: TABLE }))
      const sorted = (result.Items || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      return ok(sorted)
    }

    if (method === 'GET' && trailId) {
      const result = await dynamo.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'TrailPostsIndex',
        KeyConditionExpression: 'trailId = :trailId',
        ExpressionAttributeValues: { ':trailId': trailId },
        Limit: 10,
        ScanIndexForward: false,
      }))
      return ok(result.Items || [])
    }

    if (method === 'DELETE' && postId) {
      const result = await dynamo.send(new GetCommand({ TableName: TABLE, Key: { postId } }))
      if (!result.Item) return err('Post not found', 404)
      if (result.Item.userId !== userId) return err('You can only delete your own posts', 403)
      if (result.Item.photoKey) {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: result.Item.photoKey }))
      }
      await dynamo.send(new DeleteCommand({ TableName: TABLE, Key: { postId } }))
      return ok({ deleted: true })
    }

    return err('Method not allowed', 405)
  } catch (error) {
    return handleError(error)
  }
}

module.exports = { handler }
