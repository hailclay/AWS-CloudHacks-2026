'use strict'

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

function ok(data, statusCode = 200) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({ success: true, data, error: null }),
  }
}

function err(message, statusCode = 500) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({ success: false, data: null, error: message }),
  }
}

function handleError(error) {
  console.error('[TrailMatch API Error]', error)
  const statusCode = error.statusCode || 500
  const message = error.message || 'Internal server error'
  return err(message, statusCode)
}

module.exports = { ok, err, handleError }
