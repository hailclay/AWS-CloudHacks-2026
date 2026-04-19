'use strict'

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb')
const { requireAuth } = require('../../lib/auth')
const { ok, err, handleError } = require('../../lib/response')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const TABLE = process.env.PREFERENCES_TABLE

const VALID_TERRAINS = ['Mountain', 'Beach', 'Forest', 'Canyon', 'Desert']
const VALID_DIFFICULTIES = ['Easy', 'Medium', 'Hard']

async function handler(event) {
  try {
    const user = await requireAuth(event)
    const userId = user.sub
    const method = event.requestContext?.http?.method || event.httpMethod

    if (method === 'GET') {
      const result = await dynamo.send(
        new GetCommand({ TableName: TABLE, Key: { userId } })
      )
      if (!result.Item) return err('No preference profile found', 404)
      return ok(result.Item)
    }

    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}')
      const validationError = validatePreferences(body)
      if (validationError) return err(validationError, 400)

      const item = {
        userId,
        terrain: body.terrain,
        difficulty: body.difficulty,
        distanceMiles: Number(body.distanceMiles),
        elevationFeet: Number(body.elevationFeet),
        drivingMinutes: Number(body.drivingMinutes),
        updatedAt: new Date().toISOString(),
      }

      await dynamo.send(new PutCommand({ TableName: TABLE, Item: item }))
      return ok(item, 201)
    }

    return err('Method not allowed', 405)
  } catch (error) {
    return handleError(error)
  }
}

function validatePreferences(body) {
  if (!VALID_TERRAINS.includes(body.terrain))
    return `terrain must be one of: ${VALID_TERRAINS.join(', ')}`
  if (!VALID_DIFFICULTIES.includes(body.difficulty))
    return `difficulty must be one of: ${VALID_DIFFICULTIES.join(', ')}`
  if (body.distanceMiles < 0.5 || body.distanceMiles > 50)
    return 'distanceMiles must be between 0.5 and 50'
  if (body.elevationFeet < 0 || body.elevationFeet > 10000)
    return 'elevationFeet must be between 0 and 10,000'
  if (body.drivingMinutes < 5 || body.drivingMinutes > 180)
    return 'drivingMinutes must be between 5 and 180'
  return null
}

module.exports = { handler }
