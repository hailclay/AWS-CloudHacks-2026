/**
 * Preferences handler
 * Routes: GET /preferences, POST /preferences
 *
 * This is the first endpoint your React app will call.
 * After a user logs in for the first time, the frontend does:
 *   GET /preferences  → 404 (no profile yet) → show onboarding form
 *   POST /preferences → save their answers   → redirect to /discover
 *
 * On subsequent logins:
 *   GET /preferences  → 200 with their saved profile → skip onboarding
 *
 * DynamoDB access pattern:
 *   Table: TrailMatch-Preferences
 *   PK: userId (Auth0 user.sub, looks like "auth0|abc123")
 *   One item per user — simple GetItem / PutItem, no queries needed.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { requireAuth } from '../../lib/auth.js'
import { ok, err, handleError } from '../../lib/response.js'

// DynamoDBDocumentClient is the high-level client that automatically
// marshals/unmarshals JavaScript objects to/from DynamoDB's typed format.
// Without it you'd write { userId: { S: "auth0|abc" } } instead of { userId: "auth0|abc" }.
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const TABLE = process.env.PREFERENCES_TABLE

export async function handler(event) {
  try {
    // Every handler starts with auth. If the token is bad, this throws
    // and we never touch the database.
    const user = await requireAuth(event)
    const userId = user.sub // Auth0's unique user identifier

    const method = event.requestContext?.http?.method || event.httpMethod

    // -----------------------------------------------------------------------
    // GET /preferences — fetch the user's saved preference profile
    // -----------------------------------------------------------------------
    if (method === 'GET') {
      const result = await dynamo.send(
        new GetCommand({
          TableName: TABLE,
          Key: { userId },
        })
      )

      if (!result.Item) {
        // No profile yet — this is expected for new users.
        // Return 404 so the frontend knows to show the onboarding flow.
        return err('No preference profile found', 404)
      }

      return ok(result.Item)
    }

    // -----------------------------------------------------------------------
    // POST /preferences — create or update the user's preference profile
    // -----------------------------------------------------------------------
    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}')

      // Validate all required fields are present and within bounds.
      // We do this in Lambda (not just the frontend) because anyone can
      // call your API directly — never trust client-side validation alone.
      const validationError = validatePreferences(body)
      if (validationError) {
        return err(validationError, 400)
      }

      const item = {
        userId,
        // Terrain: one of Mountain, Beach, Forest, Canyon, Desert
        terrain: body.terrain,
        // Difficulty: Easy, Medium, or Hard
        difficulty: body.difficulty,
        // Distance in miles (0.5 – 50)
        distanceMiles: Number(body.distanceMiles),
        // Elevation gain in feet (0 – 10,000)
        elevationFeet: Number(body.elevationFeet),
        // Max driving time in minutes (5 – 180)
        drivingMinutes: Number(body.drivingMinutes),
        // ISO timestamp — useful for "last updated" display on Profile page
        updatedAt: new Date().toISOString(),
      }

      // PutItem overwrites any existing item with the same PK.
      // This is intentional — POST /preferences is both create and update.
      await dynamo.send(
        new PutCommand({
          TableName: TABLE,
          Item: item,
        })
      )

      return ok(item, 201)
    }

    return err('Method not allowed', 405)
  } catch (error) {
    return handleError(error)
  }
}

// ---------------------------------------------------------------------------
// Validation helper
// Returns an error string if invalid, null if valid.
// Keeping this in the handler file (not a shared lib) because validation
// rules are specific to this endpoint's data shape.
// ---------------------------------------------------------------------------
function validatePreferences(body) {
  const VALID_TERRAINS = ['Mountain', 'Beach', 'Forest', 'Canyon', 'Desert']
  const VALID_DIFFICULTIES = ['Easy', 'Medium', 'Hard']

  if (!VALID_TERRAINS.includes(body.terrain)) {
    return `terrain must be one of: ${VALID_TERRAINS.join(', ')}`
  }
  if (!VALID_DIFFICULTIES.includes(body.difficulty)) {
    return `difficulty must be one of: ${VALID_DIFFICULTIES.join(', ')}`
  }
  if (body.distanceMiles < 0.5 || body.distanceMiles > 50) {
    return 'distanceMiles must be between 0.5 and 50'
  }
  if (body.elevationFeet < 0 || body.elevationFeet > 10000) {
    return 'elevationFeet must be between 0 and 10,000'
  }
  if (body.drivingMinutes < 5 || body.drivingMinutes > 180) {
    return 'drivingMinutes must be between 5 and 180'
  }
  return null
}
