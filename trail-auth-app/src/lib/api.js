/**
 * api.js — frontend API client
 *
 * All calls to the Lambda backend go through this file.
 * Why centralize it here?
 *   - One place to set the base URL (from .env)
 *   - One place to attach the Auth0 token to every request
 *   - One place to handle the response envelope { success, data, error }
 *   - If the API URL changes, you update one line, not 20 components
 *
 * Usage in a component:
 *   import { api } from '../lib/api'
 *   const { data } = await api.get('/preferences')
 *   await api.post('/preferences', { terrain: 'Mountain', ... })
 */

const BASE_URL = import.meta.env.VITE_API_URL

if (!BASE_URL) {
  console.warn(
    '[TrailMatch] VITE_API_URL is not set. ' +
    'Create a .env.local file with VITE_API_URL=https://your-api-url/prod'
  )
}

/**
 * Core fetch wrapper. Gets the Auth0 token from the auth instance,
 * attaches it as a Bearer token, and unwraps the response envelope.
 *
 * @param {string} path - API path, e.g. '/preferences'
 * @param {object} options - fetch options (method, body, etc.)
 * @param {Function} getAccessToken - Auth0's getAccessTokenSilently function
 */
async function request(path, options = {}, getAccessToken) {
  const token = await getAccessToken({
    authorizationParams: {
      audience: import.meta.env.VITE_AUTH0_AUDIENCE,
    },
  })

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })

  const json = await response.json()

  // If the server returned an error envelope, throw it so the caller
  // can catch it and show an error message.
  if (!json.success) {
    const error = new Error(json.error || 'API request failed')
    error.statusCode = response.status
    throw error
  }

  return json // { success: true, data: ..., error: null }
}

/**
 * Creates an API client bound to a specific Auth0 getAccessTokenSilently function.
 * Call this inside a component or hook that has access to useAuth0().
 *
 * Example:
 *   const { getAccessTokenSilently } = useAuth0()
 *   const client = createApiClient(getAccessTokenSilently)
 *   const { data: prefs } = await client.get('/preferences')
 */
export function createApiClient(getAccessTokenSilently) {
  return {
    get: (path) =>
      request(path, { method: 'GET' }, getAccessTokenSilently),

    post: (path, body) =>
      request(
        path,
        { method: 'POST', body: JSON.stringify(body) },
        getAccessTokenSilently
      ),

    delete: (path) =>
      request(path, { method: 'DELETE' }, getAccessTokenSilently),
  }
}
