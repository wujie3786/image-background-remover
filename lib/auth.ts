// Simple JWT-like token using Web Crypto API (works in Edge runtime)

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production-must-be-32-chars'

// Base64URL encode/decode
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

// Simple HMAC-SHA256 signing
async function sign(data: string, secret: string): Promise<string> {
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

async function verify(signature: string, data: string, secret: string): Promise<boolean> {
  const expected = await sign(data, secret)
  return signature === expected
}

export interface GoogleUserInfo {
  sub: string
  email?: string
  name?: string
  picture?: string
}

export interface SessionPayload {
  userId: string
  sessionId: string
  exp: number
}

export async function verifyGoogleToken(token: string): Promise<GoogleUserInfo | null> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/tokeninfo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `access_token=${token}`,
    })

    if (!response.ok) return null

    const info = await response.json()
    return {
      sub: info.sub,
      email: info.email,
      name: info.name,
      picture: info.picture,
    }
  } catch {
    return null
  }
}

export async function createSessionToken(userId: string, sessionId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + 7 * 24 * 60 * 60 // 7 days

  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64UrlEncode(JSON.stringify({ userId, sessionId, exp, iat: now }))
  const data = `${header}.${payload}`
  const signature = await sign(data, JWT_SECRET)

  return `${data}.${signature}`
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [header, payload, signature] = parts
    const data = `${header}.${payload}`

    const valid = await verify(signature, data, JWT_SECRET)
    if (!valid) return null

    const decoded = JSON.parse(base64UrlDecode(payload)) as {
      userId: string
      sessionId: string
      exp: number
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000)
    if (decoded.exp < now) return null

    return {
      userId: decoded.userId,
      sessionId: decoded.sessionId,
      exp: decoded.exp,
    }
  } catch {
    return null
  }
}

export function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  cookieHeader?.split(';').forEach(cookie => {
    const [name, ...valueParts] = cookie.trim().split('=')
    if (name) {
      cookies[name] = valueParts.join('=')
    }
  })
  return cookies
}

export function createSessionCookie(sessionToken: string): string {
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString()
  return `session=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=${expires}`
}
