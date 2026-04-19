'use strict'

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb')
const { requireAuth } = require('../../lib/auth')
const { ok, err, handleError } = require('../../lib/response')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const TABLE = process.env.RATINGS_TABLE
const VALID_TIERS = ['S', 'A', 'B', 'C', 'D']

async function handler(event) {
  try {
    const user = await requireAuth(event)
    const userId = user.sub
    const method = event.requestContext?.http?.method || event.httpMethod
    const trailId = event.pathParameters?.trailId

    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}')
      if (!body.trailId) return err('trailId is required', 400)
      if (!VALID_TIERS.includes(body.tier)) return err(`tier must be one of: ${VALID_TIERS.join(', ')}`, 400)
      if (body.review && body.review.length > 500) return err('review must be 500 characters or fewer', 400)

      const item = {
        userId,
        trailId: body.trailId,
        tier: body.tier,
        review: body.review || null,
        createdAt: new Date().toISOString(),
      }
      await dynamo.send(new PutCommand({ TableName: TABLE, Item: item }))
      return ok(item, 201)
    }

    if (method === 'GET' && trailId) {
      const result = await dynamo.send(
        new QueryCommand({
          TableName: TABLE,
          IndexName: 'TrailRatingsIndex',
          KeyConditionExpression: 'trailId = :trailId',
          ExpressionAttributeValues: { ':trailId': trailId },
        })
      )
      const tierCounts = { S: 0, A: 0, B: 0, C: 0, D: 0 }
      for (const item of result.Items) tierCounts[item.tier] = (tierCounts[item.tier] || 0) + 1
      const communityTier = Object.entries(tierCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null
      return ok({ ratings: result.Items, tierCounts, communityTier, totalRatings: result.Items.length })
    }

    if (method === 'DELETE' && trailId) {
      await dynamo.send(new DeleteCommand({ TableName: TABLE, Key: { userId, trailId } }))
      return ok({ deleted: true })
    }

    return err('Method not allowed', 405)
  } catch (error) {
    return handleError(error)
  }
}

module.exports = { handler }
