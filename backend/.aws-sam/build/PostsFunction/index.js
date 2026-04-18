/**
 * Posts handler
 * Routes: POST /posts, GET /feed, GET /posts/trail/{trailId}, DELETE /posts/{id}
 *
 * Posts are the social content layer — photos, captions, wildlife sightings.
 * Photos are NOT uploaded through Lambda. Instead:
 *
 *   1. Frontend calls POST /posts with metadata (no photo yet)
 *   2. Lambda creates the post record and returns a pre-signed S3 URL
 *   3. Frontend uploads the photo directly to S3 using that URL
 *   4. Frontend calls PATCH /posts/{id}/confirm to mark the photo as uploaded
 *
 * Why this pattern?
 *   Sending a 10MB photo through Lambda would be slow (Lambda has a 6MB
 *   payload limit anyway) and expensive. Pre-signed URLs let the browser
 *   upload directly to S3 at full speed, bypassing Lambda entirely.
 *   This is the standard AWS pattern for file uploads.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { requireAuth } from '../../lib/auth.js'
import { ok, err, handleError } from '../../lib/response.js'
import { randomUUID } from 'crypto'

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const s3 = new S3Client({})
const TABLE = process.env.POSTS_TABLE
const BUCKET = process.env.TRAILS_BUCKET

export async function handler(event) {
  try {
    const user = await requireAuth(event)
    const userId = user.sub
    const method = event.requestContext?.http?.method || event.httpMethod
    const postId = event.pathParameters?.id
    const trailId = event.pathParameters?.trailId
    const rawPath = event.rawPath || ''

    // -----------------------------------------------------------------------
    // POST /posts — create a new post
    // -----------------------------------------------------------------------
    if (method === 'POST' && rawPath === '/posts') {
      const body = JSON.parse(event.body || '{}')

      if (!body.trailId) return err('trailId is required', 400)
      if (!body.caption) return err('caption is required', 400)
      if (body.caption.length > 280) return err('caption must be 280 characters or fewer', 400)
      if (body.wildlifeTag && body.wildlifeTag.length > 100) {
        return err('wildlifeTag must be 100 characters or fewer', 400)
      }

      const newPostId = randomUUID()
      let photoUploadUrl = null
      let photoKey = null

      // If the user wants to attach a photo, generate a pre-signed upload URL.
      // The frontend will PUT the image file directly to this URL.
      if (body.hasPhoto) {
        photoKey = `posts/${newPostId}.jpg`
        photoUploadUrl = await getSignedUrl(
          s3,
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: photoKey,
            ContentType: 'image/jpeg',
            // Limit file size to 10MB at the S3 level
            ContentLengthRange: [1, 10 * 1024 * 1024],
          }),
          { expiresIn: 300 } // URL expires in 5 minutes
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
        // photoUrl will be the public CDN URL once uploaded.
        // For now we store the S3 key; the frontend constructs the URL.
        photoKey: photoKey,
        photoUploaded: false, // Set to true after direct S3 upload completes
        createdAt: new Date().toISOString(),
      }

      await dynamo.send(new PutCommand({ TableName: TABLE, Item: post }))

      // Return both the post record and the upload URL (if applicable)
      return ok({ post, photoUploadUrl }, 201)
    }

    // -----------------------------------------------------------------------
    // GET /feed — global social feed
    // -----------------------------------------------------------------------
    if (method === 'GET' && rawPath === '/feed') {
      // Scan all posts, sort by createdAt descending (newest first).
      // In production: use a GSI on createdAt, or a dedicated feed service.
      const result = await dynamo.send(new ScanCommand({ TableName: TABLE }))
      const sorted = (result.Items || []).sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      )
      return ok(sorted)
    }

    // -----------------------------------------------------------------------
    // GET /posts/trail/{trailId} — posts for a specific trail
    // -----------------------------------------------------------------------
    if (method === 'GET' && trailId) {
      const result = await dynamo.send(
        new QueryCommand({
          TableName: TABLE,
          IndexName: 'TrailPostsIndex',
          KeyConditionExpression: 'trailId = :trailId',
          ExpressionAttributeValues: { ':trailId': trailId },
          // Limit to 10 most recent for the Trail Detail page
          Limit: 10,
          ScanIndexForward: false, // Descending order
        })
      )
      return ok(result.Items || [])
    }

    // -----------------------------------------------------------------------
    // DELETE /posts/{id} — delete a post (owner only)
    // -----------------------------------------------------------------------
    if (method === 'DELETE' && postId) {
      const result = await dynamo.send(
        new GetCommand({ TableName: TABLE, Key: { postId } })
      )
      if (!result.Item) return err('Post not found', 404)

      // Authorization: users can only delete their own posts
      if (result.Item.userId !== userId) {
        return err('You can only delete your own posts', 403)
      }

      // Delete the S3 photo if one exists
      if (result.Item.photoKey) {
        await s3.send(
          new DeleteObjectCommand({ Bucket: BUCKET, Key: result.Item.photoKey })
        )
      }

      await dynamo.send(
        new DeleteCommand({ TableName: TABLE, Key: { postId } })
      )

      return ok({ deleted: true })
    }

    return err('Method not allowed', 405)
  } catch (error) {
    return handleError(error)
  }
}
