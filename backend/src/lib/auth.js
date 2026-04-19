'use strict'

const { createRemoteJWKSet, jwtVerify } = require('jose')

const JWKS = createRemoteJWKSet(
  new URL(`https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`)
)

async function requireAuth(event) {
  const authHeader =
    event.headers?.Authorization || event.headers?.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('Missing or malformed Authorization header')
    err.statusCode = 401
    throw err
  }

  const token = authHeader.slice(7)

  try {
    const { payload } = await jwtVerify(token, JWKS, {
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

module.exports = { requireAuth }
