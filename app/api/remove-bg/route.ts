import { NextRequest, NextResponse } from 'next/server'
import { REMOVE_BG_API_URL } from '@/lib/constants'
import { verifySessionToken, parseCookies } from '@/lib/auth'

export const runtime = 'nodejs'

async function verifyAuth(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie') || ''
  const cookies = parseCookies(cookieHeader)
  const sessionToken = cookies.session

  if (!sessionToken) {
    return { authorized: false, userId: null }
  }

  const session = await verifySessionToken(sessionToken)
  if (!session) {
    return { authorized: false, userId: null }
  }

  // Check if session exists in DB and not expired
  const d1 = request.env.DB as D1Database
  if (!d1) {
    return { authorized: false, userId: null }
  }

  const now = Math.floor(Date.now() / 1000)
  const dbSession = await d1
    .prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?')
    .bind(session.sessionId, now)
    .first()

  if (!dbSession) {
    return { authorized: false, userId: null }
  }

  return { authorized: true, userId: session.userId }
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const auth = await verifyAuth(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { error: 'Please sign in to use this feature', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const imageFile = formData.get('image') as File

    if (!imageFile) {
      return NextResponse.json(
        { error: 'No image provided', code: 'INVALID_FILE' },
        { status: 400 }
      )
    }

    // Validate file size
    if (imageFile.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit', code: 'INVALID_FILE' },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(imageFile.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPG, PNG, and WEBP are supported', code: 'INVALID_FILE' },
        { status: 400 }
      )
    }

    // Get API key from environment variables
    const apiKey = process.env.REMOVE_BG_API_KEY

    if (!apiKey) {
      console.error('REMOVE_BG_API_KEY is not configured')
      return NextResponse.json(
        { error: 'Service configuration error. Please contact support.', code: 'API_ERROR' },
        { status: 500 }
      )
    }

    // Create FormData for Remove.bg API
    const removeBgFormData = new FormData()
    removeBgFormData.append('image_file', imageFile)
    removeBgFormData.append('size', 'auto')

    // Call Remove.bg API
    const response = await fetch(REMOVE_BG_API_URL, {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
      },
      body: removeBgFormData,
    })

    // Handle quota exceeded
    if (response.status === 402) {
      return NextResponse.json(
        { error: 'Daily quota exceeded. Please try again tomorrow.', code: 'QUOTA_EXCEEDED' },
        { status: 402 }
      )
    }

    // Handle other API errors
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Remove.bg API error:', response.status, errorText)

      let errorMessage = 'Failed to remove background. Please try again.'
      let errorCode = 'API_ERROR'

      if (response.status === 400) {
        errorMessage = 'Invalid image or image size too large.'
        errorCode = 'INVALID_FILE'
      } else if (response.status === 401) {
        errorMessage = 'Invalid API key configured.'
        errorCode = 'API_ERROR'
      } else if (response.status >= 500) {
        errorMessage = 'Service temporarily unavailable. Please try again later.'
      }

      return NextResponse.json(
        { error: errorMessage, code: errorCode },
        { status: response.status }
      )
    }

    // Get the processed image (PNG with transparent background)
    const imageBuffer = await response.arrayBuffer()

    // Return the image directly
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="removed-bg-${Date.now()}.png"`,
      },
    })
  } catch (error) {
    console.error('Error processing image:', error)
    return NextResponse.json(
      { error: 'Network error. Please check your connection and try again.', code: 'NETWORK_ERROR' },
      { status: 500 }
    )
  }
}
