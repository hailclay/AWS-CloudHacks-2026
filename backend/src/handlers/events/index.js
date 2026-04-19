'use strict'

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb')
const { requireAuth } = require('../../lib/auth')
const { ok, err, handleError } = require('../../lib/response')
const { randomUUID } = require('crypto')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const TABLE = process.env.EVENTS_TABLE

async function handler(event) {
  try {
    const user = await requireAuth(event)
    const userId = user.sub
    const method = event.requestContext?.http?.method || event.httpMethod
    const eventId = event.pathParameters?.id
    const isJoin = (event.rawPath || '').endsWith('/join')

    if (method === 'POST' && !eventId) {
      const body = JSON.parse(event.body || '{}')
      if (!body.trailId) return err('trailId is required', 400)
      if (!body.eventName) return err('eventName is required', 400)
      if (!body.eventDate) return err('eventDate is required', 400)
      if (body.maxGroupSize < 1 || body.maxGroupSize > 50) return err('maxGroupSize must be between 1 and 50', 400)
      if (body.description && body.description.length > 300) return err('description must be 300 characters or fewer', 400)

      const newEvent = {
        eventId: randomUUID(),
        trailId: body.trailId,
        organizerId: userId,
        eventName: body.eventName,
        eventDate: body.eventDate,
        maxGroupSize: Number(body.maxGroupSize),
        description: body.description || null,
        attendees: [userId],
        status: 'active',
        createdAt: new Date().toISOString(),
      }
      await dynamo.send(new PutCommand({ TableName: TABLE, Item: newEvent }))
      return ok(newEvent, 201)
    }

    if (method === 'POST' && eventId && isJoin) {
      const result = await dynamo.send(new GetCommand({ TableName: TABLE, Key: { eventId } }))
      if (!result.Item) return err('Event not found', 404)
      const ev = result.Item
      if (ev.status === 'cancelled') return err('Event has been cancelled', 400)
      if (ev.attendees.includes(userId)) return err('Already joined this event', 400)
      if (ev.attendees.length >= ev.maxGroupSize) return err('Event is full', 400)

      await dynamo.send(new UpdateCommand({
        TableName: TABLE,
        Key: { eventId },
        UpdateExpression: 'SET attendees = list_append(attendees, :newAttendee)',
        ExpressionAttributeValues: { ':newAttendee': [userId] },
      }))
      return ok({ joined: true, eventId })
    }

    if (method === 'GET' && !eventId) {
      const result = await dynamo.send(new ScanCommand({
        TableName: TABLE,
        FilterExpression: '#status = :active',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':active': 'active' },
      }))
      const sorted = (result.Items || []).sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate))
      return ok(sorted)
    }

    if (method === 'GET' && eventId) {
      const result = await dynamo.send(new GetCommand({ TableName: TABLE, Key: { eventId } }))
      if (!result.Item) return err('Event not found', 404)
      return ok(result.Item)
    }

    if (method === 'DELETE' && eventId) {
      const result = await dynamo.send(new GetCommand({ TableName: TABLE, Key: { eventId } }))
      if (!result.Item) return err('Event not found', 404)
      if (result.Item.organizerId !== userId) return err('Only the organizer can cancel this event', 403)
      await dynamo.send(new UpdateCommand({
        TableName: TABLE,
        Key: { eventId },
        UpdateExpression: 'SET #status = :cancelled',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':cancelled': 'cancelled' },
      }))
      return ok({ cancelled: true, eventId })
    }

    return err('Method not allowed', 405)
  } catch (error) {
    return handleError(error)
  }
}

module.exports = { handler }
