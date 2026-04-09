'use client'

import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google'
import { API_BASE } from '../lib/config'

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''

interface GoogleLoginButtonProps {
  onSuccess: (user: { id: string; email?: string; name?: string; picture?: string }) => void
  onError: () => void
}

function LoginButton({ onSuccess, onError }: GoogleLoginButtonProps) {
  const handleSuccess = async (credentialResponse: any) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      })

      if (res.ok) {
        const data = await res.json()
        // Store session token locally
        try {
          localStorage.setItem('ibr_session', data.token)
        } catch {}
        onSuccess(data.user)
      } else {
        onError()
      }
    } catch {
      onError()
    }
  }

  return (
    <GoogleLogin
      onSuccess={handleSuccess}
      onError={onError}
      useOneTap
      theme="outline"
      size="large"
      text="signin_with"
      shape="rectangular"
    />
  )
}

export default function GoogleLoginButton({ onSuccess, onError }: GoogleLoginButtonProps) {
  if (!GOOGLE_CLIENT_ID) {
    return (
      <div className="text-red-500 text-sm">
        Google OAuth not configured. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID environment variable.
      </div>
    )
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <LoginButton onSuccess={onSuccess} onError={onError} />
    </GoogleOAuthProvider>
  )
}
