import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, parseCookies } from '@/lib/auth'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('cookie') || ''
    const cookies = parseCookies(cookieHeader)
    const sessionToken = cookies.session

    if (sessionToken) {
      const session = await verifySessionToken(sessionToken)
      
      if (session) {
        const d1 = request.env.DB as D1Database
        if (d1) {
          // Delete session from DB
          await d1
            .prepare('DELETE FROM sessions WHERE id = ?')
            .bind(session.sessionId)
            .run()
        }
      }
    }

    const response = NextResponse.json({ success: true })
    response.headers.set(
      'Set-Cookie',
      'session=; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    )

    return response
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 })
  }
}
