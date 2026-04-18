/**
 * Ratings handler
 * Routes: POST /ratings, GET /ratings/{trailId}, DELETE /ratings/{trailId}
 *
 * The tier system (S/A/B/C/D) is inspired by Beli's restaurant ratings.
 * Each user gets one rating per trail — submitting again overwrites the old one.
 *
 * DynamoDB access pattern:
 *   Table: TrailMatch-Ratings
 *   PK: userId, SK: trailId  ← composite key enforces one-per-user-per-trail
 *   GSI: TrailRatingsIndex (PK: trailId) ← lets us query all ratings for a trail
 *
 * Why a GSI (Global Secondary Index)?
 *   DynamoDB can only query by the table's primary key natively.
 *   To answer "give me all ratings for trail X", we'd normally have to scan
 *   the entire table — slow and expensive. A GSI creates a second index
 *   with trailId as the key, so that query becomes fast.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb'
import { requireAuth } from '../../lib/auth.js'
import { ok, err, handleError } from '../../lib/response.js'

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const TABLE = process.env.RATINGS_TABLE
const VALID_TIERS = ['S', 'A', 'B', 'C', 'D']

export async function handler(event) {
  try {
    const user = await requireAuth(event)
    const userId = user.sub
    const method = event.requestContext?.http?.method || event.httpMethod
    const trailId = event.pathParameters?.trailId

    // -----------------------------------------------------------------------
    // POST /ratings — submit or update a rating
    // -----------------------------------------------------------------------
    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}')

      if (!body.trailId) return err('trailId is required', 400)
      if (!VALID_TIERS.includes(body.tier)) {
        return err(`tier must be one of: ${VALID_TIERS.join(', ')}`, 400)
      }
      if (body.review && body.review.length > 500) {
        return err('review must be 500 characters or fewer', 400)
      }

      const item = {
        userId,
        trailId: body.trailId,
        tier: body.tier,
        review: body.review || null,
        createdAt: new Date().toISOString(),
      }

      // PutCommand with the composite key (userId + trailId) automatically
      // overwrites any existing rating — no need for a separate update path.
      await dynamo.send(new PutCommand({ TableName: TABLE, Item: item }))
      return ok(item, 201)
    }

    // -----------------------------------------------------------------------
    // GET /ratings/{trailId} — all ratings for a trail (for Trail Detail page)
    // -----------------------------------------------------------------------
    if (method === 'GET' && trailId) {
      const result = await dynamo.send(
        new QueryCommand({
          TableName: TABLE,
          IndexName: 'TrailRatingsIndex',
          KeyConditionExpression: 'trailId = :trailId',
          ExpressionAttributeValues: { ':trailId': trailId },
        })
      )

      // Aggregate ratings into tier counts for the community summary display
      const tierCounts = { S: 0, A: 0, B: 0, C: 0, D: 0 }
      for (const item of result.Items) {
        tierCounts[item.tier] = (tierCounts[item.tier] || 0) + 1
      }

      // Community tier = the tier with the most votes
      const communityTier = Object.entries(tierCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || null

      return ok({
        ratings: result.Items,
        tierCounts,
        communityTier,
        totalRatings: result.Items.length,
      })
    }

    // -----------------------------------------------------------------------
    // DELETE /ratings/{trailId} — remove the calling user's rating
    // -----------------------------------------------------------------------
    if (method === 'DELETE' && trailId) {
      // Users can only delete their own ratings — the composite key (userId + trailId)
      // ensures this naturally: you can only delete the item where PK = your userId.
      await dynamo.send(
        new DeleteCommand({
          TableName: TABLE,
          Key: { userId, trailId },
        })
      )
      return ok({ deleted: true })
    }

    return err('Method not allowed', 405)
  } catch (error) {
    return handleError(error)
  }
}
