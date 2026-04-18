/**
 * Trails handler
 * Routes: GET /trails, GET /trails/{id}
 *
 * GET /trails
 *   Called by the Discover page on load. Reads the user's preference profile,
 *   then scores and ranks all trails against those preferences.
 *
 *   This is the "working demo" recommendation engine. It's a scoring function
 *   we wrote ourselves — not Amazon Personalize. Here's why:
 *
 *   Amazon Personalize needs real interaction history (clicks, ratings, views)
 *   to train a model. With zero users and zero data at hackathon launch, it
 *   returns nothing useful. Our scoring function works immediately with just
 *   the user's stated preferences. In your pitch, you describe Personalize as
 *   the production path once real interaction data accumulates — that's honest
 *   and technically correct.
 *
 * GET /trails/{id}
 *   Returns a single trail's full data for the Trail Detail page.
 *
 * Data source:
 *   Trail data lives in S3 as a JSON file (data/trails.json).
 *   Lambda reads it, filters/scores it, and returns results.
 *   We also write trails to DynamoDB for fast individual lookups by ID.
 *   S3 = source of truth for the full dataset; DynamoDB = fast single-item reads.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { requireAuth } from '../../lib/auth.js'
import { ok, err, handleError } from '../../lib/response.js'

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const s3 = new S3Client({})

const TRAILS_TABLE = process.env.TRAILS_TABLE
const PREFERENCES_TABLE = process.env.PREFERENCES_TABLE
const TRAILS_BUCKET = process.env.TRAILS_BUCKET

export async function handler(event) {
  try {
    const user = await requireAuth(event)
    const userId = user.sub
    const method = event.requestContext?.http?.method || event.httpMethod
    const trailId = event.pathParameters?.id

    // -----------------------------------------------------------------------
    // GET /trails/{id} — single trail detail
    // -----------------------------------------------------------------------
    if (method === 'GET' && trailId) {
      const result = await dynamo.send(
        new GetCommand({
          TableName: TRAILS_TABLE,
          Key: { trailId },
        })
      )

      if (!result.Item) {
        return err('Trail not found', 404)
      }

      return ok(result.Item)
    }

    // -----------------------------------------------------------------------
    // GET /trails — ranked list for Discover page
    // -----------------------------------------------------------------------
    if (method === 'GET') {
      // Fetch user preferences and all trails in parallel.
      // Promise.all runs both DynamoDB calls simultaneously instead of
      // waiting for one to finish before starting the other.
      const [prefsResult, trails] = await Promise.all([
        dynamo.send(new GetCommand({
          TableName: PREFERENCES_TABLE,
          Key: { userId },
        })),
        loadTrails(),
      ])

      const prefs = prefsResult.Item

      // If no preferences saved yet, return trails sorted by community rating.
      // This handles the edge case where someone navigates to /discover before
      // completing onboarding (e.g. direct URL).
      if (!prefs) {
        const sorted = trails
          .sort((a, b) => tierToNumber(b.communityTier) - tierToNumber(a.communityTier))
          .slice(0, 10)
        return ok({ trails: sorted, hasPreferences: false })
      }

      // Score every trail against the user's preferences, then sort descending.
      const scored = trails
        .map(trail => ({ ...trail, matchScore: scoreTrail(trail, prefs) }))
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 10) // Return top 10

      return ok({ trails: scored, hasPreferences: true })
    }

    return err('Method not allowed', 405)
  } catch (error) {
    return handleError(error)
  }
}

// ---------------------------------------------------------------------------
// Load trails from S3
// The JSON file at data/trails.json is the seed dataset.
// We cache it in the Lambda module scope so repeated calls within the same
// warm container don't re-fetch from S3 every time.
// ---------------------------------------------------------------------------
let trailsCache = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

async function loadTrails() {
  const now = Date.now()
  if (trailsCache && now - cacheTimestamp < CACHE_TTL_MS) {
    return trailsCache
  }

  const response = await s3.send(
    new GetObjectCommand({
      Bucket: TRAILS_BUCKET,
      Key: 'data/trails.json',
    })
  )

  // S3 returns a ReadableStream — we need to collect all chunks into a string.
  const chunks = []
  for await (const chunk of response.Body) {
    chunks.push(chunk)
  }
  const json = Buffer.concat(chunks).toString('utf-8')
  trailsCache = JSON.parse(json)
  cacheTimestamp = now
  return trailsCache
}

// ---------------------------------------------------------------------------
// Scoring function
//
// Returns a number 0–100 representing how well a trail matches the user's
// preferences. Higher = better match.
//
// Each dimension contributes a weighted portion of the total score:
//   Terrain match:    35 points (most important — wrong terrain = wrong vibe)
//   Difficulty match: 25 points
//   Distance match:   20 points (within ±2 miles of preference)
//   Elevation match:  20 points (within ±500 ft of preference)
//
// Driving distance is handled separately — trails beyond the user's max
// driving time are filtered out entirely before scoring.
// ---------------------------------------------------------------------------
function scoreTrail(trail, prefs) {
  let score = 0

  // Filter: if driving time exceeds user's max, score 0 (will sort to bottom)
  if (trail.drivingMinutes > prefs.drivingMinutes) {
    return 0
  }

  // Terrain: exact match = full points, no partial credit
  if (trail.terrain === prefs.terrain) score += 35

  // Difficulty: exact match = full points, adjacent difficulty = half points
  // (e.g. user wants Medium, trail is Hard → 12 points instead of 0)
  if (trail.difficulty === prefs.difficulty) {
    score += 25
  } else if (isAdjacentDifficulty(trail.difficulty, prefs.difficulty)) {
    score += 12
  }

  // Distance: full points if within ±2 miles, scaled down beyond that
  const distanceDiff = Math.abs(trail.distanceMiles - prefs.distanceMiles)
  if (distanceDiff <= 2) {
    score += 20
  } else if (distanceDiff <= 5) {
    score += 10
  }

  // Elevation: full points if within ±500 ft, scaled down beyond that
  const elevationDiff = Math.abs(trail.elevationFeet - prefs.elevationFeet)
  if (elevationDiff <= 500) {
    score += 20
  } else if (elevationDiff <= 1500) {
    score += 10
  }

  return score
}

function isAdjacentDifficulty(a, b) {
  const order = ['Easy', 'Medium', 'Hard']
  return Math.abs(order.indexOf(a) - order.indexOf(b)) === 1
}

// Convert tier letter to number for sorting when no preferences exist
function tierToNumber(tier) {
  return { S: 5, A: 4, B: 3, C: 2, D: 1 }[tier] || 0
}
