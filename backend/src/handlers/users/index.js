'use strict'

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb')
const { requireAuth } = require('../../lib/auth')
const { ok, err, handleError } = require('../../lib/response')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const USERS_TABLE = process.env.USERS_TABLE

async function handler(event) {
  try {
    const user = await requireAuth(event)
    const method = event.requestContext?.http?.method || event.httpMethod
    const rawPath = event.rawPath || ''

    // PUT /users/me — set or update display name and avatar
    if (method === 'PUT' && rawPath.endsWith('/users/me')) {
      const body = JSON.parse(event.body || '{}')
      
      let updateExpression = 'SET updatedAt = :now'
      let expressionValues = { ':now': new Date().toISOString() }
      
      if (body.displayName !== undefined) {
        const displayName = body.displayName?.trim()
        if (!displayName || displayName.length < 2) return err('displayName must be at least 2 characters', 400)
        if (displayName.length > 30) return err('displayName must be 30 characters or fewer', 400)

        // Check the name isn't already taken by someone else
        const taken = await dynamo.send(new ScanCommand({
          TableName: USERS_TABLE,
          FilterExpression: 'displayName = :name AND userId <> :self',
          ExpressionAttributeValues: { ':name': displayName, ':self': user.sub },
        }))
        if (taken.Items?.length > 0) return err('That display name is already taken', 409)
        
        updateExpression += ', displayName = :name'
        expressionValues[':name'] = displayName
      }
      
      if (body.avatar !== undefined) {
        const validAvatars = ['avatar-1', 'avatar-2', 'avatar-3']
        if (!validAvatars.includes(body.avatar)) return err('Invalid avatar selection', 400)
        
        updateExpression += ', avatar = :avatar'
        expressionValues[':avatar'] = body.avatar
      }

      await dynamo.send(new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { userId: user.sub },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionValues,
      }))
      
      return ok({ success: true })
    }

    // GET /users/me — get own profile (creates it with email prefix if missing)
    if (method === 'GET' && rawPath.endsWith('/users/me')) {
      const result = await dynamo.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId: user.sub } }))
      if (result.Item) return ok(result.Item)

      // First time — seed with email prefix as default display name
      const emailPrefix = (user.email || '').split('@')[0] || 'hiker'
      const item = {
        userId: user.sub,
        displayName: emailPrefix,
        avatar: 'avatar-1', // default avatar
        picture: user.picture || null,
        updatedAt: new Date().toISOString(),
      }
      await dynamo.send(new PutCommand({ TableName: USERS_TABLE, Item: item }))
      return ok(item)
    }

    // GET /users/search?q=username
    if (method === 'GET' && rawPath.endsWith('/users/search')) {
      const q = event.queryStringParameters?.q?.trim()
      if (!q || q.length < 2) return err('Query must be at least 2 characters', 400)

      const result = await dynamo.send(new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression: 'contains(displayName, :q)',
        ExpressionAttributeValues: { ':q': q },
        Limit: 20,
      }))
      return ok(result.Items || [])
    }

    // GET /users/:userId
    if (method === 'GET') {
      const userId = event.pathParameters?.userId
      if (!userId) return err('userId is required', 400)

      const result = await dynamo.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId } }))
      if (!result.Item) return err('User not found', 404)
      return ok(result.Item)
    }

    return err('Method not allowed', 405)
  } catch (error) {
    return handleError(error)
  }
}

module.exports = { handler }
