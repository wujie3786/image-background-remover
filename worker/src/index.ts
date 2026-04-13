/**
 * image-bg-remover API Worker
 * Handles: user auth, profile, usage tracking
 */

import type { D1Database } from '@cloudflare/workers-types'

// ⚠️ DEV-ONLY fallback - production must set JWT_SECRET via `wrangler secret put JWT_SECRET`
// ⚠️ If env.JWT_SECRET is not set in production, auth will fail - this is intentional
const JWT_SECRET = '__dev_fallback_do_not_use_in_prod__'

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
  try {
    await env.DB
      .prepare('ALTER TABLE users ADD COLUMN plan TEXT DEFAULT ?')
      .bind('free')
      .run()
  } catch { /* column exists */ }

  try {
    await env.DB
      .prepare(
        'CREATE TABLE IF NOT EXISTS usage (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL, count INTEGER DEFAULT 0, UNIQUE(user_id, date))'
      )
      .run()
  } catch { /* table exists */ }

  try {
    await env.DB
      .prepare('CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage(user_id, date)')
      .run()
  } catch { /* index exists */ }
}

function createError(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function json(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── Google Token Verification ──────────────────────────────────────────────────

// Cache: kid -> CryptoKey (supports Google key rotation)
const keyCache = new Map<string, { key: CryptoKey; time: number }>()
const KEYS_CACHE_TTL = 3600 * 1000 // 1 hour

function base64UrlDecodeToBytes(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  const bin = atob(str)
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

async function getGooglePublicKey(kid: string): Promise<CryptoKey | null> {
  const now = Date.now()

  // Check per-key cache
  const cached = keyCache.get(kid)
  if (cached && now - cached.time < KEYS_CACHE_TTL) {
    return cached.key
  }

  // Refresh all keys from Google
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs')
  if (!res.ok) return null

  const data = await res.json() as { keys: Array<{ kid: string; kty: string; n: string; e: string; alg?: string }> }

  // Rebuild cache for all keys
  for (const keyData of data.keys) {
    if (keyData.kty !== 'RSA') continue
    try {
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
      keyCache.set(keyData.kid, { key: publicKey, time: now })
    } catch { /* skip invalid key */ }
  }

  const result = keyCache.get(kid)
  return result ? result.key : null
}

async function verifyGoogleToken(token: string, googleClientId: string): Promise<{ payload: JWTPayload | null; error?: string }> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return { payload: null, error: 'google_token_malformed' }

    const [headerB64, payloadB64, signatureB64] = parts
    const header = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/'))) as { kid: string; alg: string }

    const publicKey = await getGooglePublicKey(header.kid)
    if (!publicKey) return { payload: null, error: 'google_key_cache_miss' }

    const signatureBytes = base64UrlDecodeToBytes(signatureB64)
    const dataBytes = new TextEncoder().encode(`${headerB64}.${payloadB64}`)

    const valid = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      publicKey,
      signatureBytes as unknown as ArrayBuffer,
      dataBytes as unknown as ArrayBuffer
    )
    if (!valid) return { payload: null, error: 'google_token_invalid_signature' }

    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))) as JWTPayload

    if (payload.exp < Math.floor(Date.now() / 1000)) return { payload: null, error: 'google_token_expired' }

    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    if (!aud.includes(googleClientId)) return { payload: null, error: 'oauth_client_mismatch' }

    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
      return { payload: null, error: 'google_token_invalid_issuer' }
    }

    return { payload }
  } catch {
    return { payload: null, error: 'google_token_invalid' }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

function getDailyLimit(plan: string): number {
  return plan === 'pro' ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────

async function getAuthenticatedUser(request: Request, env: Env): Promise<User | null> {
  const authHeader = request.headers.get('Authorization') || ''
  const bearerToken = authHeader.replace('Bearer ', '')
  if (!bearerToken) return null

  const jwtSecret = env.JWT_SECRET || JWT_SECRET

  // Try as session token first
  const session = await parseSessionToken(bearerToken, jwtSecret)
  if (session) {
    const result = await env.DB
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(session.userId)
      .first<User>()
    return result ?? null
  }

  // Try as Google credential
  const googleClientId = env.GOOGLE_CLIENT_ID || 'unknown'
  const { payload } = await verifyGoogleToken(bearerToken, googleClientId)
  if (!payload) return null

  const result = await env.DB
    .prepare('SELECT * FROM users WHERE google_id = ?')
    .bind(payload.sub)
    .first<User>()
  return result ?? null
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

const CORS_ORIGINS = [
  'https://imagebackgroundremover.world',
  'https://87d28ee.image-background-remover-7tz.pages.dev',
  'https://image-background-remover-7tz.pages.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || ''
  if (CORS_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    }
  }
  return {
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function handleOptions(request: Request) {
  return new Response(null, { headers: corsHeaders(request) })
}

// ─── Routes ───────────────────────────────────────────────────────────────────

async function handleAuth(request: Request, env: Env) {
  if (request.method !== 'POST') {
    return createError(405, 'method_not_allowed', 'Method not allowed')
  }

  let body: { credential?: string }
  try {
    body = await request.json()
  } catch {
    return createError(400, 'invalid_json', 'Invalid JSON')
  }

  const credential = body.credential
  if (!credential) {
    return createError(400, 'missing_credential', 'Missing credential')
  }

  const googleClientId = env.GOOGLE_CLIENT_ID || ''
  const { payload, error } = await verifyGoogleToken(credential, googleClientId)
  if (!payload) {
    // Return diagnostic error codes for better debugging
    const errorMessages: Record<string, string> = {
      google_token_malformed: '无效的登录凭证',
      google_key_cache_miss: 'Google 验签服务暂时不可用，请重试',
      google_token_invalid_signature: '登录凭证验证失败',
      google_token_expired: '登录凭证已过期，请重新登录',
      oauth_client_mismatch: 'OAuth 客户端不匹配（前后端 Client ID 不一致）',
      google_token_invalid_issuer: '登录凭证来源无效',
      google_token_invalid: '无法验证登录凭证',
    }
    return createError(401, error || 'google_token_invalid', errorMessages[error || ''] || '验证失败，请重试')
  }

  const now = Math.floor(Date.now() / 1000)

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

    await env.DB
      .prepare('INSERT INTO usage (id, user_id, date, count) VALUES (?, ?, ?, 0)')
      .bind(crypto.randomUUID(), userId, getToday())
      .run()
  }

  const user = await env.DB
    .prepare('SELECT * FROM users WHERE google_id = ?')
    .bind(payload.sub)
    .first<User>()

  if (!user) return createError(500, 'user_not_found', 'User not found')

  const jwtSecret = env.JWT_SECRET || JWT_SECRET
  const sessionId = crypto.randomUUID()
  const sessionToken = await makeSignedSessionToken(user.id, sessionId, jwtSecret)

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
      ...corsHeaders(request),
    },
  })
}

async function handleProfile(request: Request, env: Env) {
  const user = await getAuthenticatedUser(request, env)
  if (!user) return createError(401, 'unauthorized', 'Unauthorized')

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
    let body: { name?: string }
    try {
      body = await request.json()
    } catch {
      return createError(400, 'invalid_json', 'Invalid JSON')
    }

    if (body.name !== undefined) {
      await env.DB
        .prepare('UPDATE users SET name = ? WHERE id = ?')
        .bind(body.name, user.id)
        .run()
    }

    return json({ success: true })
  }

  return createError(405, 'method_not_allowed', 'Method not allowed')
}

async function handleStats(request: Request, env: Env) {
  const user = await getAuthenticatedUser(request, env)
  if (!user) return createError(401, 'unauthorized', 'Unauthorized')

  const today = getToday()
  const dailyLimit = getDailyLimit(user.plan)

  const todayUsage = await env.DB
    .prepare('SELECT count FROM usage WHERE user_id = ? AND date = ?')
    .bind(user.id, today)
    .first<{ count: number }>()

  const todayCount = todayUsage?.count ?? 0

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
    return createError(405, 'method_not_allowed', 'Method not allowed')
  }

  const user = await getAuthenticatedUser(request, env)
  if (!user) return createError(401, 'unauthorized', 'Unauthorized')

  const today = getToday()
  const dailyLimit = getDailyLimit(user.plan)

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
      try {
        await env.DB
          .prepare('INSERT INTO usage (id, user_id, date, count) VALUES (?, ?, ?, 1)')
          .bind(crypto.randomUUID(), user.id, today)
          .run()
        return json({ allowed: true, remaining: dailyLimit - 1 })
      } catch {
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

    return json({ allowed: false, remaining: 0, limit: dailyLimit, limit_reached: true })
  }

  const updated = await env.DB
    .prepare('SELECT count FROM usage WHERE user_id = ? AND date = ?')
    .bind(user.id, today)
    .first<{ count: number }>()

  const remaining = Math.max(0, dailyLimit - (updated?.count ?? 1))
  return json({ allowed: true, remaining })
}

async function handleProcess(request: Request, env: Env) {
  if (request.method !== 'POST') {
    return createError(405, 'method_not_allowed', 'Method not allowed')
  }

  const user = await getAuthenticatedUser(request, env)
  if (!user) return createError(401, 'unauthorized', 'Unauthorized')

  let body: { image_data?: string }
  try {
    body = await request.json()
  } catch {
    return createError(400, 'invalid_json', 'Invalid JSON')
  }

  const imageData = body.image_data
  if (!imageData) {
    return createError(400, 'missing_image_data', 'Missing image_data')
  }

  const today = getToday()
  const dailyLimit = getDailyLimit(user.plan)

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
      try {
        await env.DB
          .prepare('INSERT INTO usage (id, user_id, date, count) VALUES (?, ?, ?, 1)')
          .bind(crypto.randomUUID(), user.id, today)
          .run()
      } catch {
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

  return json({ success: true })
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const cors = corsHeaders(request)

    if (request.method === 'OPTIONS') {
      return handleOptions(request)
    }

    await ensureSchema(env)

    let response: Response

    if (path === '/api/health') {
      // Health check with CORS headers
      response = json({ ok: true, ts: Date.now() })
    } else if (path.startsWith('/api/auth')) {
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
      response = createError(404, 'not_found', 'Not found')
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
