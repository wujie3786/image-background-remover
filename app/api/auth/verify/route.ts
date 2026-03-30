import { NextRequest, NextResponse } from 'next/server'
import { createSessionToken, createSessionCookie, generateId } from '@/lib/auth'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const { credential } = await request.json()

    if (!credential) {
      return NextResponse.json({ error: 'No credential provided' }, { status: 400 })
    }

    // Verify with Google's tokeninfo endpoint
    const tokenInfo = await fetch('https://oauth2.googleapis.com/tokeninfo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `access_token=${credential}`,
    })

    if (!tokenInfo.ok) {
      // Try verifying as ID token
      const idTokenInfo = await fetch('https://oauth2.googleapis.com/tokeninfo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `id_token=${credential}`,
      })
      
      if (!idTokenInfo.ok) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
      }
    }

    const tokenData = await tokenInfo.json()
    
    const googleUser = {
      googleId: tokenData.sub,
      email: tokenData.email,
      name: tokenData.name,
      picture: tokenData.picture,
    }

    // Get D1 database
    const d1 = request.env.DB as D1Database
    if (!d1) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }

    // Check if user exists
    const existingUser = await d1
      .prepare('SELECT id FROM users WHERE google_id = ?')
      .bind(googleUser.googleId)
      .first()

    let userId: string
    const now = Math.floor(Date.now() / 1000)

    if (existingUser) {
      userId = existingUser.id as string
      // Update last login
      await d1
        .prepare('UPDATE users SET last_login = ? WHERE id = ?')
        .bind(now, userId)
        .run()
    } else {
      // Create new user
      userId = generateId()
      await d1
        .prepare(`
          INSERT INTO users (id, google_id, email, name, picture, created_at, last_login)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(userId, googleUser.googleId, googleUser.email || '', googleUser.name || '', googleUser.picture || '', now, now)
        .run()
    }

    // Create session
    const sessionId = generateId()
    const sessionToken = await createSessionToken(userId, sessionId)

    // Store session in D1
    const expiresAt = now + 7 * 24 * 60 * 60 // 7 days
    await d1
      .prepare(`
        INSERT INTO sessions (id, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
      `)
      .bind(sessionId, userId, now, expiresAt)
      .run()

    const response = NextResponse.json({ 
      success: true,
      user: { id: userId, email: googleUser.email, name: googleUser.name, picture: googleUser.picture }
    })

    response.headers.set('Set-Cookie', createSessionCookie(sessionToken))

    return response
  } catch (error) {
    console.error('Auth error:', error)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}
