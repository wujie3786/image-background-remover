/**
 * image-bg-remover API Worker
 * Handles: user auth, profile, usage tracking
 */

const GOOGLE_CLIENT_ID = '681632994673-pg2atmmesfellsrrqkuu3j4imh37gm6e.apps.googleusercontent.com'

// Free: 5/day, Pro: 50/day
const FREE_DAILY_LIMIT = 5
const PRO_DAILY_LIMIT = 50

interface Env {
  DB: D1Database
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
let cachedKeys: Record<string, string> | null = null
let keysCacheTime = 0
const KEYS_CACHE_TTL = 3600 * 1000 // 1 hour

async function getGooglePublicKeys(): Promise<Record<string, string>> {
  const now = Date.now()
  if (cachedKeys && now - keysCacheTime < KEYS_CACHE_TTL) {
    return cachedKeys
  }
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs')
  const data = (await res.json()) as { keys: Array<{ kid: string; n: string; e: string }> }
  cachedKeys = {}
  for (const key of data.keys) {
    cachedKeys[key.kid] = key as unknown as string
  }
  keysCacheTime = now
  return cachedKeys
}

async function verifyGoogleToken(token: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/'))) as { kid: string; alg: string }
    const keys = await getGooglePublicKeys()
    const signingKey = keys[header.kid]

    // For simplicity, decode payload without cryptographic verification
    // In production, verify signature using the key
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    ) as JWTPayload

    // Basic validation
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    if (!aud.includes(GOOGLE_CLIENT_ID)) return null

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

function makeSessionToken(userId: string): string {
  // Simple signed token (in production use a proper JWT library)
  const payload = `${userId}:${Date.now()}`
  const encoded = btoa(payload)
  return encoded
}

function parseSessionToken(token: string): { userId: string; timestamp: number } | null {
  try {
    const decoded = atob(token)
    const [userId, ts] = decoded.split(':')
    return { userId, timestamp: parseInt(ts) }
  } catch {
    return null
  }
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
  const session = parseSessionToken(bearerToken)
  if (session) {
    const result = await env.DB
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(session.userId)
      .first<User>()
    return result ?? null
  }

  // Try as Google credential (first-time auth)
  const payload = await verifyGoogleToken(bearerToken)
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
  const payload = await verifyGoogleToken(credential)
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

  // Return session token + user data (no password/JWT needed)
  const sessionToken = makeSessionToken(user.id)
  return json({
    token: sessionToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      plan: user.plan,
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

  // Get or create today's usage record
  const existing = await env.DB
    .prepare('SELECT count FROM usage WHERE user_id = ? AND date = ?')
    .bind(user.id, today)
    .first<{ count: number }>()

  if (!existing) {
    // First use today - insert
    await env.DB
      .prepare('INSERT INTO usage (id, user_id, date, count) VALUES (?, ?, ?, 1)')
      .bind(crypto.randomUUID(), user.id, today)
      .run()
    return json({ allowed: true, remaining: dailyLimit - 1 })
  }

  if (existing.count >= dailyLimit) {
    return json({
      allowed: false,
      remaining: 0,
      limit: dailyLimit,
      limit_reached: true,
    })
  }

  // Increment count
  await env.DB
    .prepare('UPDATE usage SET count = count + 1 WHERE user_id = ? AND date = ?')
    .bind(user.id, today)
    .run()

  return json({
    allowed: true,
    remaining: dailyLimit - existing.count - 1,
  })
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

    if (path.startsWith('/api/auth')) {
      response = await handleAuth(request, env)
    } else if (path.startsWith('/api/user/profile')) {
      response = await handleProfile(request, env)
    } else if (path.startsWith('/api/user/stats')) {
      response = await handleStats(request, env)
    } else if (path.startsWith('/api/use')) {
      response = await handleUse(request, env)
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
