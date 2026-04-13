'use client'

import { useState } from 'react'
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google'
import { API_BASE } from '../lib/config'

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''

interface GoogleLoginButtonProps {
  onSuccess: (user: { id: string; email?: string; name?: string; picture?: string }) => void
  onError: (msg?: string) => void
}

function LoginButton({ onSuccess, onError }: GoogleLoginButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleSuccess = async (credentialResponse: any) => {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      })
      if (res.ok) {
        const data = await res.json()
        try { localStorage.setItem('ibr_session', data.token) } catch {}
        onSuccess(data.user)
      } else {
        const errData = await res.json().catch(() => ({}))
        onError(errData.error || '登录失败，请重试')
      }
    } catch (err: any) {
      console.error('Auth fetch error:', err)
      onError('网络连接失败，请检查网络后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <GoogleLogin
      onSuccess={handleSuccess}
      onError={() => onError('Google 登录失败，请重试')}
      useOneTap={false}
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
