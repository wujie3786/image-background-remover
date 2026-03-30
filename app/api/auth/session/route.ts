import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, parseCookies } from '@/lib/auth'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('cookie') || ''
    const cookies = parseCookies(cookieHeader)
    const sessionToken = cookies.session

    if (!sessionToken) {
      return NextResponse.json({ authenticated: false, user: null })
    }

    const session = await verifySessionToken(sessionToken)
    if (!session) {
      return NextResponse.json({ authenticated: false, user: null })
    }

    // Check if session exists in DB and not expired
    const d1 = request.env.DB as D1Database
    if (!d1) {
      return NextResponse.json({ authenticated: false, user: null })
    }

    const now = Math.floor(Date.now() / 1000)
    const dbSession = await d1
      .prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?')
      .bind(session.sessionId, now)
      .first()

    if (!dbSession) {
      return NextResponse.json({ authenticated: false, user: null })
    }

    // Get user info
    const user = await d1
      .prepare('SELECT id, email, name, picture FROM users WHERE id = ?')
      .bind(session.userId)
      .first()

    return NextResponse.json({ 
      authenticated: true,
      user: user ? { id: user.id, email: user.email, name: user.name, picture: user.picture } : null
    })
  } catch (error) {
    console.error('Session check error:', error)
    return NextResponse.json({ authenticated: false, user: null })
  }
}
