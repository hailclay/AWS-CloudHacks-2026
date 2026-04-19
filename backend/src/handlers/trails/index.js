'use strict'

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb')
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime')
const { requireAuth } = require('../../lib/auth')
const { ok, err, handleError } = require('../../lib/response')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const s3 = new S3Client({})
const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' })

const TRAILS_TABLE = process.env.TRAILS_TABLE
const PREFERENCES_TABLE = process.env.PREFERENCES_TABLE
const TRAILS_BUCKET = process.env.TRAILS_BUCKET
const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY

async function handler(event) {
  try {
    const user = await requireAuth(event)
    const userId = user.sub
    const method = event.requestContext?.http?.method || event.httpMethod
    const rawPath = event.rawPath || ''
    const trailId = event.pathParameters?.id

    // POST /trails/search — quiz-based AI trail search
    if (method === 'POST' && rawPath.endsWith('/search')) {
      const body = JSON.parse(event.body || '{}')
      const { answers, location, radius = 25 } = body

      if (!answers || Object.keys(answers).length < 5)
        return err('Missing quiz answers', 400)
      if (!location)
        return err('Missing location', 400)

      const [trails, analysis] = await Promise.all([
        searchTrailsFromAnswers(answers, location, radius),
        buildAnalysisWithBedrock(answers, location).catch(bedrockErr => {
          console.warn('Bedrock failed, using fallback:', bedrockErr.message)
          return buildFallbackAnalysis(answers, location)
        }),
      ])

      return ok({ trails, analysis })
    }

    // GET /trails/{id} — single trail
    if (method === 'GET' && trailId) {
      const result = await dynamo.send(
        new GetCommand({ TableName: TRAILS_TABLE, Key: { trailId } })
      )
      if (!result.Item) return err('Trail not found', 404)
      return ok(result.Item)
    }

    // GET /trails — preference-ranked list
    if (method === 'GET') {
      const [prefsResult, trails] = await Promise.all([
        dynamo.send(new GetCommand({ TableName: PREFERENCES_TABLE, Key: { userId } })),
        loadTrailsFromS3(),
      ])

      const prefs = prefsResult.Item

      if (!prefs) {
        const sorted = trails
          .sort((a, b) => tierToNumber(b.communityTier) - tierToNumber(a.communityTier))
          .slice(0, 10)
        return ok({ trails: sorted, hasPreferences: false })
      }

      const scored = trails
        .map(trail => ({ ...trail, matchScore: scoreTrail(trail, prefs) }))
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 10)

      return ok({ trails: scored, hasPreferences: true })
    }

    return err('Method not allowed', 405)
  } catch (error) {
    return handleError(error)
  }
}

// ---------------------------------------------------------------------------
// Trail search via Google Places
// ---------------------------------------------------------------------------
async function searchTrailsFromAnswers(answers, location, radius) {
  const searchTerms = buildSearchTerms(answers, location)
  const found = []
  const seenNames = new Set()
  const radiusMeters = Math.min(parseInt(radius) * 1609, 50000)

  const origin = await geocodeLocation(location)
  if (!origin) return []

  for (const term of searchTerms) {
    try {
      const results = await searchGooglePlaces(term, origin, radiusMeters)
      for (const place of results) {
        if (seenNames.has(place.name)) continue
        seenNames.add(place.name)
        found.push({
          id: place.place_id || place.name.toLowerCase().replace(/\s+/g, '-'),
          name: place.name,
          tagline: place.vicinity || `Near ${location}`,
          tags: buildTagsFromAnswers(answers),
          desc: place.vicinity || '',
          emoji: terrainEmoji(answers['1']),
          lat: place.geometry?.location?.lat,
          lng: place.geometry?.location?.lng,
          maps_url: `https://www.google.com/maps/search/?api=1&query=${place.geometry?.location?.lat},${place.geometry?.location?.lng}`,
          rating: place.rating || null,
        })
      }
    } catch (e) {
      console.warn('Place search failed:', e.message)
    }
    if (found.length >= 8) break
  }

  return found.slice(0, 8)
}

async function geocodeLocation(location) {
  if (!GOOGLE_MAPS_KEY) return null
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${GOOGLE_MAPS_KEY}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.status !== 'OK' || !data.results?.[0]) return null
  return data.results[0].geometry.location
}

async function searchGooglePlaces(query, origin, radiusMeters) {
  if (!GOOGLE_MAPS_KEY) return []
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${origin.lat},${origin.lng}&radius=${radiusMeters}&key=${GOOGLE_MAPS_KEY}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.status !== 'OK') return []
  return data.results || []
}

function buildSearchTerms(answers, location) {
  const envMap = { forest: 'forest hiking trail', mountain: 'mountain hiking trail', beach: 'coastal hiking trail', desert: 'desert hiking trail' }
  const sceneryMap = { water: 'waterfall hiking trail', views: 'scenic viewpoint trail', wildlife: 'wildlife nature trail', flowers: 'wildflower hiking trail' }
  const vibeMap = { peaceful: 'quiet nature trail', adventure: 'challenging hiking trail', scenic: 'scenic hiking trail', discovery: 'hidden gem hiking trail' }
  const fitnessMap = { beginner: 'easy hiking trail', moderate: 'moderate hiking trail', advanced: 'hard hiking trail', expert: 'expert hiking trail' }

  const terms = []
  if (envMap[answers['1']]) terms.push(`${envMap[answers['1']]} near ${location}`)
  if (sceneryMap[answers['3']]) terms.push(`${sceneryMap[answers['3']]} near ${location}`)
  if (vibeMap[answers['5']]) terms.push(`${vibeMap[answers['5']]} near ${location}`)
  if (fitnessMap[answers['2']]) terms.push(`${fitnessMap[answers['2']]} near ${location}`)
  return [...new Set(terms)].slice(0, 4)
}

function buildTagsFromAnswers(answers) {
  const tagMap = {
    '1': { forest: 'Forest', mountain: 'Mountain', beach: 'Coastal', desert: 'Desert' },
    '2': { beginner: 'Easy', moderate: 'Moderate', advanced: 'Hard', expert: 'Expert' },
    '3': { wildlife: 'Wildlife', views: 'Views', water: 'Waterfall', flowers: 'Wildflowers' },
    '5': { adventure: 'Adventure', peaceful: 'Peaceful', scenic: 'Scenic', discovery: 'Hidden Gem' },
  }
  return Object.entries(tagMap)
    .map(([q, map]) => map[answers[q]])
    .filter(Boolean)
}

function terrainEmoji(terrain) {
  return { forest: '🌲', mountain: '⛰️', beach: '🏖️', desert: '🏜️' }[terrain] || '🥾'
}

// ---------------------------------------------------------------------------
// Bedrock analysis
// ---------------------------------------------------------------------------
async function buildAnalysisWithBedrock(answers, location) {
  const labels = {
    '1': { forest: 'forest lover', mountain: 'mountain person', beach: 'coastal explorer', desert: 'desert wanderer' },
    '2': { beginner: 'beginner hiker', moderate: 'moderate hiker', advanced: 'advanced hiker', expert: 'expert hiker' },
    '3': { wildlife: 'wildlife and birds', views: 'panoramic views', water: 'waterfalls and rivers', flowers: 'wildflowers and meadows' },
    '4': { solo: 'usually hikes solo', partner: 'likes hiking with a partner or friend', group: 'enjoys hiking with a group' },
    '5': { adventure: 'wants adventure', peaceful: 'wants peace and quiet', scenic: 'wants scenic beauty', discovery: 'wants exploration and hidden gems' },
  }

  const profile = {
    environment: labels['1'][answers['1']] || '',
    fitness: labels['2'][answers['2']] || '',
    scenery: labels['3'][answers['3']] || '',
    social: labels['4'][answers['4']] || '',
    vibe: labels['5'][answers['5']] || '',
    location,
  }

  const prompt = `Write a short hiking personality analysis in 3 to 4 sentences.

User profile:
${JSON.stringify(profile, null, 2)}

Style: warm, natural, slightly poetic, no bullet points.`

  const response = await bedrock.send(
    new InvokeModelCommand({
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  )

  const result = JSON.parse(Buffer.from(response.body).toString('utf-8'))
  return result.content.filter(i => i.type === 'text').map(i => i.text).join('').trim()
}

function buildFallbackAnalysis(answers, location) {
  const envLabel = { forest: 'forests', mountain: 'mountains', beach: 'the coast', desert: 'desert canyons' }[answers['1']] || 'nature'
  return `You seem drawn to ${envLabel} and trails that match your pace and energy. Based on your answers, you're looking for a hike near ${location} that feels personal and worth the trip.`
}

// ---------------------------------------------------------------------------
// S3 trail loader + scoring
// ---------------------------------------------------------------------------
let trailsCache = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000

async function loadTrailsFromS3() {
  const now = Date.now()
  if (trailsCache && now - cacheTimestamp < CACHE_TTL_MS) return trailsCache
  const response = await s3.send(
    new GetObjectCommand({ Bucket: TRAILS_BUCKET, Key: 'data/trails.json' })
  )
  const chunks = []
  for await (const chunk of response.Body) chunks.push(chunk)
  trailsCache = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
  cacheTimestamp = now
  return trailsCache
}

function scoreTrail(trail, prefs) {
  let score = 0
  if (trail.drivingMinutes > prefs.drivingMinutes) return 0
  if (trail.terrain === prefs.terrain) score += 35
  if (trail.difficulty === prefs.difficulty) score += 25
  else if (isAdjacentDifficulty(trail.difficulty, prefs.difficulty)) score += 12
  const distDiff = Math.abs(trail.distanceMiles - prefs.distanceMiles)
  if (distDiff <= 2) score += 20
  else if (distDiff <= 5) score += 10
  const elevDiff = Math.abs(trail.elevationFeet - prefs.elevationFeet)
  if (elevDiff <= 500) score += 20
  else if (elevDiff <= 1500) score += 10
  return score
}

function isAdjacentDifficulty(a, b) {
  const order = ['Easy', 'Medium', 'Hard']
  return Math.abs(order.indexOf(a) - order.indexOf(b)) === 1
}

function tierToNumber(tier) {
  return { S: 5, A: 4, B: 3, C: 2, D: 1 }[tier] || 0
}

module.exports = { handler }
