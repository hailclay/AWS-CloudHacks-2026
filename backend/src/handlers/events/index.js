/**
 * Events handler
 * Routes: POST /events, GET /events, GET /events/{id},
 *         POST /events/{id}/join, DELETE /events/{id}
 *
 * Hike events are the social meetup feature. A user creates an event tied
 * to a specific trail, sets a date/time and max group size, then invites others.
 *
 * DynamoDB access pattern:
 *   Table: TrailMatch-Events
 *   PK: eventId (UUID)
 *   GSI: TrailEventsIndex (PK: trailId) ← "events for this trail" query
 *
 * Attendees are stored as a DynamoDB List attribute on the event item itself.
 * For a hackathon scale (max 50 per event), this is fine. At production scale
 * you'd move attendees to a separate table.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb'
import { requireAuth } from '../../lib/auth.js'
import { ok, err, handleError } from '../../lib/response.js'
import { randomUUID } from 'crypto'

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const TABLE = process.env.EVENTS_TABLE

export async function handler(event) {
  try {
    const user = await requireAuth(event)
    const userId = user.sub
    const method = event.requestContext?.http?.method || event.httpMethod
    const eventId = event.pathParameters?.id
    const isJoin = event.rawPath?.endsWith('/join')

    // -----------------------------------------------------------------------
    // POST /events — create a new hike event
    // -----------------------------------------------------------------------
    if (method === 'POST' && !eventId) {
      const body = JSON.parse(event.body || '{}')

      if (!body.trailId) return err('trailId is required', 400)
      if (!body.eventName) return err('eventName is required', 400)
      if (!body.eventDate) return err('eventDate is required', 400)
      if (body.maxGroupSize < 1 || body.maxGroupSize > 50) {
        return err('maxGroupSize must be between 1 and 50', 400)
      }
      if (body.description && body.description.length > 300) {
        return err('description must be 300 characters or fewer', 400)
      }

      const newEvent = {
        eventId: randomUUID(),
        trailId: body.trailId,
        organizerId: userId,
        eventName: body.eventName,
        eventDate: body.eventDate,       // ISO string, e.g. "2026-07-04T09:00:00Z"
        maxGroupSize: Number(body.maxGroupSize),
        description: body.description || null,
        attendees: [userId],             // Organizer is automatically attending
        status: 'active',
        createdAt: new Date().toISOString(),
      }

      await dynamo.send(new PutCommand({ TableName: TABLE, Item: newEvent }))
      return ok(newEvent, 201)
    }

    // -----------------------------------------------------------------------
    // POST /events/{id}/join — join an existing event
    // -----------------------------------------------------------------------
    if (method === 'POST' && eventId && isJoin) {
      // First fetch the event to check capacity and status
      const result = await dynamo.send(
        new GetCommand({ TableName: TABLE, Key: { eventId } })
      )

      if (!result.Item) return err('Event not found', 404)
      const ev = result.Item

      if (ev.status === 'cancelled') return err('Event has been cancelled', 400)
      if (ev.attendees.includes(userId)) return err('Already joined this event', 400)
      if (ev.attendees.length >= ev.maxGroupSize) {
        return err('Event is full', 400)
      }

      // UpdateCommand with list_append adds the userId to the attendees array
      // atomically — safe even if two people join at the exact same millisecond.
      await dynamo.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { eventId },
          UpdateExpression: 'SET attendees = list_append(attendees, :newAttendee)',
          ExpressionAttributeValues: { ':newAttendee': [userId] },
        })
      )

      return ok({ joined: true, eventId })
    }

    // -----------------------------------------------------------------------
    // GET /events — list all upcoming events
    // -----------------------------------------------------------------------
    if (method === 'GET' && !eventId) {
      // Scan is acceptable here for a hackathon — in production you'd add
      // a GSI on eventDate for efficient time-range queries.
      const result = await dynamo.send(
        new ScanCommand({
          TableName: TABLE,
          FilterExpression: '#status = :active',
          ExpressionAttributeNames: { '#status': 'status' }, // 'status' is a reserved word
          ExpressionAttributeValues: { ':active': 'active' },
        })
      )

      // Sort by event date ascending (soonest first)
      const sorted = (result.Items || []).sort(
        (a, b) => new Date(a.eventDate) - new Date(b.eventDate)
      )

      return ok(sorted)
    }

    // -----------------------------------------------------------------------
    // GET /events/{id} — single event detail
    // -----------------------------------------------------------------------
    if (method === 'GET' && eventId) {
      const result = await dynamo.send(
        new GetCommand({ TableName: TABLE, Key: { eventId } })
      )
      if (!result.Item) return err('Event not found', 404)
      return ok(result.Item)
    }

    // -----------------------------------------------------------------------
    // DELETE /events/{id} — cancel an event (organizer only)
    // -----------------------------------------------------------------------
    if (method === 'DELETE' && eventId) {
      const result = await dynamo.send(
        new GetCommand({ TableName: TABLE, Key: { eventId } })
      )
      if (!result.Item) return err('Event not found', 404)

      // Authorization check: only the organizer can cancel
      if (result.Item.organizerId !== userId) {
        return err('Only the event organizer can cancel this event', 403)
      }

      await dynamo.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { eventId },
          UpdateExpression: 'SET #status = :cancelled',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':cancelled': 'cancelled' },
        })
      )

      return ok({ cancelled: true, eventId })
    }

    return err('Method not allowed', 405)
  } catch (error) {
    return handleError(error)
  }
}
