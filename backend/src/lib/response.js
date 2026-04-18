/**
 * response.js — consistent API response envelope
 *
 * Every endpoint returns the same shape:
 *   { "success": true/false, "data": ..., "error": null/"message" }
 *
 * Why a consistent envelope? Your React app can always check `response.success`
 * instead of guessing whether the response is an array, object, or error string.
 * It also makes it easy to add logging or metrics later — one place to hook into.
 *
 * API Gateway requires responses to have `statusCode` and `body` (as a string).
 * The headers here ensure the browser accepts the JSON and CORS works.
 */

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*', // API Gateway CORS config handles the real restriction
}

/**
 * Send a successful response.
 * @param {*} data - Any JSON-serializable value
 * @param {number} statusCode - HTTP status (default 200)
 */
export function ok(data, statusCode = 200) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({ success: true, data, error: null }),
  }
}

/**
 * Send an error response.
 * @param {string} message - Human-readable error description
 * @param {number} statusCode - HTTP status (default 500)
 */
export function err(message, statusCode = 500) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({ success: false, data: null, error: message }),
  }
}

/**
 * Central error handler — call this in every catch block.
 * Reads the statusCode off the error if we set one (e.g. 401 from auth.js),
 * otherwise defaults to 500.
 */
export function handleError(error) {
  console.error('[TrailMatch API Error]', error)
  const statusCode = error.statusCode || 500
  const message = error.message || 'Internal server error'
  return err(message, statusCode)
}
