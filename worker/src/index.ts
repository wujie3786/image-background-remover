/**
 * image-bg-remover API Worker
 * Handles: user auth, profile, usage tracking
 */

import type { D1Database } from '@cloudflare/workers-types'

const GOOGLE_CLIENT_ID = '681632994673-pg2atmmesfellsrrqkuu3j4imh37gm6e.apps.googleusercontent.com'
// Fallback secret for dev; in production set JWT_SECRET via wrangler secrets
const JWT_SECRET = 'dev-secret-change-in-production-must-be-at-least-32-chars'

function getGoogleClientId(env: Env): string {
  return env.GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID
}

// Free: 5/day, Pro: 50/day
const FREE_DAILY_LIMIT = 5
const PRO_DAILY_LIMIT = 50

interface Env {
  DB: D1Database
  GOOGLE_CLIENT_ID?: string
  JWT_SECRET?: string
}

interface JWTPayload {
  sub: string
  email?: string
  name?: string
  picture?: string
  aud: string | string[]
  iss: string
  iat: number
  exp: number
}

interface User {
  id: string
  google_id: string
  email: string | null
  name: string | null
  picture: string | null
  plan: string
  created_at: number
  last_login: number
}

// ─── JWT Utilities ────────────────────────────────────────────────────────────

function base64UrlEncode(data: string): string {
  const bytes = new TextEncoder().encode(data)
  const bin = String.fromCharCode(...bytes)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  const bin = atob(str)
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)))
}

async function hmacVerify(signature: string, data: string, secret: string): Promise<boolean> {
  const expected = await hmacSign(data, secret)
  return signature === expected
}

function makeSessionToken(userId: string, sessionId: string): string {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + 7 * 24 * 60 * 60 // 7 days
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64UrlEncode(JSON.stringify({ userId, sessionId, exp, iat: now }))
  const data = `${header}.${payload}`
  // signature computed async below, this is a placeholder
  return `${data}.sig`
}

async function makeSignedSessionToken(userId: string, sessionId: string, jwtSecret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + 7 * 24 * 60 * 60 // 7 days
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64UrlEncode(JSON.stringify({ userId, sessionId, exp, iat: now }))
  const data = `${header}.${payload}`
  const signature = await hmacSign(data, jwtSecret)
  return `${data}.${signature}`
}

async function parseSessionToken(token: string, jwtSecret: string): Promise<{ userId: string; sessionId: string; timestamp: number } | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, payload, signature] = parts
    const data = `${header}.${payload}`
    const valid = await hmacVerify(signature, data, jwtSecret)
    if (!valid) return null
    const decoded = JSON.parse(base64UrlDecode(payload)) as { userId: string; sessionId: string; exp: number; iat: number }
    const now = Math.floor(Date.now() / 1000)
    if (decoded.exp < now) return null
    return { userId: decoded.userId, sessionId: decoded.sessionId, timestamp: decoded.iat }
  } catch {
    return null
  }
}

// ─── Schema Migration ─────────────────────────────────────────────────────────

async function ensureSchema(env: Env): Promise<void> {
  // Add plan column if not exists (migration from old schema)
  try {
    await env.DB
      .prepare('ALTER TABLE users ADD COLUMN plan TEXT DEFAULT ?')
      .bind('free')
      .run()
  } catch {
    // Column already exists, ignore
  }
  // Ensure usage table exists
  try {
    await env.DB
      .prepare(
        'CREATE TABLE IF NOT EXISTS usage (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL, count INTEGER DEFAULT 0, UNIQUE(user_id, date))'
      )
      .run()
  } catch {
    // Table already exists, ignore
  }
  try {
    await env.DB
      .prepare(
        'CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage(user_id, date)'
      )
      .run()
  } catch {
    // Index already exists, ignore
  }
}



function createError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function json(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  })
}

// Fetch Google's public keys and cache them
let cachedKeys: CryptoKey | null = null
let keysCacheTime = 0
const KEYS_CACHE_TTL = 3600 * 1000 // 1 hour

function base64UrlDecodeToBytes(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  const bin = atob(str)
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

async function getGooglePublicKey(kid: string): Promise<CryptoKey | null> {
  const now = Date.now()
  if (cachedKeys && now - keysCacheTime < KEYS_CACHE_TTL) {
    return cachedKeys
  }
  // Refresh keys
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs')
  const data = (await res.json()) as { keys: Array<{ kid: string; kty: string; n: string; e: string; alg?: string }> }
  // Find the key with matching kid (RS256 key)
  const keyData = data.keys.find(k => k.kid === kid && k.kty === 'RSA')
  if (!keyData) return null
  // Import RSA public key from JWK
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'RSA',
      n: keyData.n,
      e: keyData.e,
      alg: 'RS256',
      use: 'sig',
    },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  )
  cachedKeys = publicKey
  keysCacheTime = now
  return publicKey
}

async function verifyGoogleToken(token: string, googleClientId: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [headerB64, payloadB64, signatureB64] = parts
    const header = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/'))) as { kid: string; alg: string }

    // Verify signature using Google's RSA public key
    const publicKey = await getGooglePublicKey(header.kid)
    if (!publicKey) return null

    const signatureBytes = base64UrlDecodeToBytes(signatureB64)
    const dataBytes = new TextEncoder().encode(`${headerB64}.${payloadB64}`)

    const valid = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      publicKey,
      signatureBytes as unknown as ArrayBuffer,
      dataBytes as unknown as ArrayBuffer
    )
    if (!valid) return null

    // Decode and validate payload
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))) as JWTPayload

    // Check expiration
    if (payload.exp < Math.floor(Date.now() / 1000)) return null

    // Check audience
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    if (!aud.includes(googleClientId)) return null

    // Check issuer
    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') return null

    return payload
  } catch {
    return null
  }
}

function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

function getDailyLimit(plan: string): number {
  return plan === 'pro' ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────

async function getAuthenticatedUser(request: Request, env: Env): Promise<User | null> {
  // Accept token from Authorization header or from request body
  const authHeader = request.headers.get('Authorization') || ''
  const bearerToken = authHeader.replace('Bearer ', '')

  if (!bearerToken) return null

  // Token can be either:
  // 1. Google credential (first-time login) - contains google_id to look up user
  // 2. Session token - contains userId

  // First try as session token
  const jwtSecret = env.JWT_SECRET || JWT_SECRET
  const session = await parseSessionToken(bearerToken, jwtSecret)
  if (session) {
    const result = await env.DB
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(session.userId)
      .first<User>()
    return result ?? null
  }

  // Try as Google credential (first-time auth)
  const payload = await verifyGoogleToken(bearerToken, getGoogleClientId(env))
  if (!payload) return null

  const result = await env.DB
    .prepare('SELECT * FROM users WHERE google_id = ?')
    .bind(payload.sub)
    .first<User>()
  return result ?? null
}

// ─── Routes ───────────────────────────────────────────────────────────────────

async function handleAuth(request: Request, env: Env) {
  if (request.method !== 'POST') {
    return createError(405, 'Method not allowed')
  }

  let body: { credential?: string }
  try {
    body = await request.json()
  } catch {
    return createError(400, 'Invalid JSON')
  }

  const credential = body.credential
  if (!credential) {
    return createError(400, 'Missing credential')
  }

  // Verify Google token
  const payload = await verifyGoogleToken(credential, getGoogleClientId(env))
  if (!payload) {
    return createError(401, 'Invalid token')
  }

  const now = Math.floor(Date.now() / 1000)

  // Upsert user
  const existing = await env.DB
    .prepare('SELECT * FROM users WHERE google_id = ?')
    .bind(payload.sub)
    .first<User>()

  if (existing) {
    await env.DB
      .prepare('UPDATE users SET last_login = ? WHERE id = ?')
      .bind(now, existing.id)
      .run()
  } else {
    const userId = crypto.randomUUID()
    await env.DB
      .prepare(
        'INSERT INTO users (id, google_id, email, name, picture, plan, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        userId,
        payload.sub,
        payload.email ?? null,
        payload.name ?? null,
        payload.picture ?? null,
        'free',
        now,
        now
      )
      .run()

    // Init usage record
    await env.DB
      .prepare('INSERT INTO usage (id, user_id, date, count) VALUES (?, ?, ?, 0)')
      .bind(crypto.randomUUID(), userId, getToday())
      .run()
  }

  // Fetch updated user
  const user = await env.DB
    .prepare('SELECT * FROM users WHERE google_id = ?')
    .bind(payload.sub)
    .first<User>()

  if (!user) return createError(500, 'User not found')

  // Generate a signed session token with session ID
  const jwtSecret = env.JWT_SECRET || JWT_SECRET
  const sessionId = crypto.randomUUID()
  const sessionToken = await makeSignedSessionToken(user.id, sessionId, jwtSecret)

  // P2-7: Set HttpOnly cookie for XSS protection (token still returned in body for client storage)
  const cookieHeader = `ibr_session=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}`

  const responseBody = JSON.stringify({
    token: sessionToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      plan: user.plan,
    },
  })

  return new Response(responseBody, {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookieHeader,
    },
  })
}

async function handleProfile(request: Request, env: Env) {
  const user = await getAuthenticatedUser(request, env)
  if (!user) return createError(401, 'Unauthorized')

  if (request.method === 'GET') {
    return json({
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      plan: user.plan,
      created_at: user.created_at,
    })
  }

  if (request.method === 'PATCH') {
    let body: { name?: string; plan?: string }
    try {
      body = await request.json()
    } catch {
      return createError(400, 'Invalid JSON')
    }

    const updates: string[] = []
    const values: (string | number)[] = []

    if (body.name !== undefined) {
      updates.push('name = ?')
      values.push(body.name)
    }

    if (updates.length === 0) {
      return createError(400, 'No fields to update')
    }

    values.push(user.id)
    await env.DB
      .prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run()

    return json({ success: true })
  }

  return createError(405, 'Method not allowed')
}

async function handleStats(request: Request, env: Env) {
  const user = await getAuthenticatedUser(request, env)
  if (!user) return createError(401, 'Unauthorized')

  const today = getToday()
  const dailyLimit = getDailyLimit(user.plan)

  // Get today's usage
  const todayUsage = await env.DB
    .prepare('SELECT count FROM usage WHERE user_id = ? AND date = ?')
    .bind(user.id, today)
    .first<{ count: number }>()

  const todayCount = todayUsage?.count ?? 0

  // Get this month's usage
  const monthStart = today.substring(0, 7) + '-01'
  const monthUsage = await env.DB
    .prepare('SELECT SUM(count) as total FROM usage WHERE user_id = ? AND date >= ?')
    .bind(user.id, monthStart)
    .first<{ total: number | null }>()

  const monthCount = monthUsage?.total ?? 0

  return json({
    plan: user.plan,
    daily_limit: dailyLimit,
    today_count: todayCount,
    today_remaining: Math.max(0, dailyLimit - todayCount),
    month_count: monthCount,
    can_use: todayCount < dailyLimit,
  })
}

async function handleUse(request: Request, env: Env) {
  if (request.method !== 'POST') {
    return createError(405, 'Method not allowed')
  }

  const user = await getAuthenticatedUser(request, env)
  if (!user) return createError(401, 'Unauthorized')

  const today = getToday()
  const dailyLimit = getDailyLimit(user.plan)

  // P1-5 Fix: Atomic conditional update to prevent race conditions
  // Only update if count < limit; returns affected rows (0 if limit reached)
  const result = await env.DB
    .prepare(
      'UPDATE usage SET count = count + 1 WHERE user_id = ? AND date = ? AND count < ?'
    )
    .bind(user.id, today, dailyLimit)
    .run()

  if (result.meta.changes === 0) {
    // Either first use today (no row exists) or limit already reached
    const current = await env.DB
      .prepare('SELECT count FROM usage WHERE user_id = ? AND date = ?')
      .bind(user.id, today)
      .first<{ count: number }>()

    if (!current) {
      // First use today - insert with count=1 (idempotent)
      try {
        await env.DB
          .prepare('INSERT INTO usage (id, user_id, date, count) VALUES (?, ?, ?, 1)')
          .bind(crypto.randomUUID(), user.id, today)
          .run()
        return json({ allowed: true, remaining: dailyLimit - 1 })
      } catch {
        // Another request inserted first - retry the conditional update
        const retry = await env.DB
          .prepare('UPDATE usage SET count = count + 1 WHERE user_id = ? AND date = ? AND count < ?')
          .bind(user.id, today, dailyLimit)
          .run()
        if (retry.meta.changes === 0) {
          return json({ allowed: false, remaining: 0, limit: dailyLimit, limit_reached: true })
        }
        return json({ allowed: true, remaining: dailyLimit - 2 })
      }
    }

    return json({
      allowed: false,
      remaining: 0,
      limit: dailyLimit,
      limit_reached: true,
    })
  }

  // Get updated remaining count
  const updated = await env.DB
    .prepare('SELECT count FROM usage WHERE user_id = ? AND date = ?')
    .bind(user.id, today)
    .first<{ count: number }>()

  const remaining = Math.max(0, dailyLimit - (updated?.count ?? 1))
  return json({
    allowed: true,
    remaining,
  })
}

// P1-4 Fix: Process endpoint - deducts quota ONLY after successful processing
async function handleProcess(request: Request, env: Env) {
  if (request.method !== 'POST') {
    return createError(405, 'Method not allowed')
  }

  const user = await getAuthenticatedUser(request, env)
  if (!user) return createError(401, 'Unauthorized')

  let body: { image_data?: string }
  try {
    body = await request.json()
  } catch {
    return createError(400, 'Invalid JSON')
  }

  const imageData = body.image_data
  if (!imageData) {
    return createError(400, 'Missing image_data')
  }

  // TODO: Integrate with remove.bg API here
  // For now, we simulate successful processing
  // const result = await removeBg(imageData, env.REMOVE_BG_API_KEY)
  // if (!result.success) return createError(500, 'Processing failed')

  const today = getToday()
  const dailyLimit = getDailyLimit(user.plan)

  // P1-5 Fix: Atomic conditional update - only deduct on successful processing
  const result = await env.DB
    .prepare(
      'UPDATE usage SET count = count + 1 WHERE user_id = ? AND date = ? AND count < ?'
    )
    .bind(user.id, today, dailyLimit)
    .run()

  if (result.meta.changes === 0) {
    const current = await env.DB
      .prepare('SELECT count FROM usage WHERE user_id = ? AND date = ?')
      .bind(user.id, today)
      .first<{ count: number }>()

    if (!current) {
      // First use today - insert with count=1
      try {
        await env.DB
          .prepare('INSERT INTO usage (id, user_id, date, count) VALUES (?, ?, ?, 1)')
          .bind(crypto.randomUUID(), user.id, today)
          .run()
      } catch {
        // Another request inserted first - retry conditional update
        const retry = await env.DB
          .prepare('UPDATE usage SET count = count + 1 WHERE user_id = ? AND date = ? AND count < ?')
          .bind(user.id, today, dailyLimit)
          .run()
        if (retry.meta.changes === 0) {
          return json({ success: false, error: 'Quota exceeded', limit_reached: true })
        }
      }
    } else {
      return json({ success: false, error: 'Quota exceeded', limit_reached: true })
    }
  }

  // Processing succeeded and quota deducted - return success
  // TODO: Return actual processed image when remove.bg is integrated
  // return json({ success: true, image: result.image })
  return json({ success: true })
}

// ─── CORS Headers ─────────────────────────────────────────────────────────────

const CORS_ORIGINS = [
  'https://imagebackgroundremover.world',
  'https://87d28ee.image-background-remover-7tz.pages.dev',
  'https://image-background-remover-7tz.pages.dev',
]

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || ''
  const allowed = CORS_ORIGINS.includes(origin) ? origin : CORS_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  }
}

function handleOptions(request: Request) {
  return new Response(null, { headers: corsHeaders(request) })
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    const cors = corsHeaders(request)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request)
    }

    // Ensure schema is up to date (lazy migration)
    await ensureSchema(env)

    let response: Response

    // Health check endpoint
    if (path === '/api/health') {
      return json({ ok: true, ts: Date.now() })
    }



    if (path.startsWith('/api/auth')) {
      response = await handleAuth(request, env)
    } else if (path.startsWith('/api/user/profile')) {
      response = await handleProfile(request, env)
    } else if (path.startsWith('/api/user/stats')) {
      response = await handleStats(request, env)
    } else if (path.startsWith('/api/use')) {
      response = await handleUse(request, env)
    } else if (path.startsWith('/api/process')) {
      response = await handleProcess(request, env)
    } else {
      response = createError(404, 'Not found')
    }

    // Attach CORS headers
    const newHeaders = new Headers(response.headers)
    for (const [k, v] of Object.entries(cors)) {
      newHeaders.set(k, v)
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    })
  },
}
