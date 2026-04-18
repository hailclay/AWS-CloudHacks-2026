/**
 * auth.js — JWT verification middleware
 *
 * Every Lambda handler calls `requireAuth(event)` at the top.
 * Here's what it does and why:
 *
 * 1. Extracts the Authorization header from the incoming request.
 *    Your React app sends this header automatically after Auth0 login:
 *    Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
 *
 * 2. Verifies the token's signature using Auth0's public keys (JWKS).
 *    This is the critical security step — without it, anyone could forge
 *    a token and claim to be any user. Auth0 signs tokens with a private
 *    key; we verify with the matching public key fetched from Auth0's
 *    /.well-known/jwks.json endpoint.
 *
 * 3. Returns the decoded payload, which contains `sub` (the unique user ID),
 *    email, and other claims. We use `sub` as the DynamoDB partition key
 *    for all user-owned data.
 *
 * We use the `jose` library because it's lightweight, works in Node 20,
 * and handles the JWKS fetching + caching automatically.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose'

// Build the JWKS URL once at cold-start (module level = cached across invocations).
// Lambda reuses the execution environment between calls, so this only runs once
// per container — not once per request. That matters for performance.
const JWKS = createRemoteJWKSet(
  new URL(`https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`)
)

/**
 * Verifies the JWT in the Authorization header.
 *
 * @param {object} event - The raw API Gateway event object
 * @returns {object} The decoded JWT payload (contains `sub`, `email`, etc.)
 * @throws {Error} If the token is missing, malformed, expired, or has a bad signature
 */
export async function requireAuth(event) {
  const authHeader =
    event.headers?.Authorization || event.headers?.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('Missing or malformed Authorization header')
    err.statusCode = 401
    throw err
  }

  const token = authHeader.slice(7) // Strip "Bearer " prefix

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      // audience must match what you set in Auth0's API settings.
      // This prevents a token issued for a different app from working here.
      audience: process.env.AUTH0_AUDIENCE,
      issuer: `https://${process.env.AUTH0_DOMAIN}/`,
    })
    return payload
  } catch (err) {
    const authErr = new Error('Invalid or expired token')
    authErr.statusCode = 401
    throw authErr
  }
}
