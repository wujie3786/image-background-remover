'use client'

import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google'

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''

interface GoogleLoginButtonProps {
  onSuccess: (user: { id: string; email?: string; name?: string; picture?: string }) => void
  onError: () => void
}

function decodeJWT(token: string): any {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64).split('').map((c) =>
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      ).join('')
    )
    return JSON.parse(jsonPayload)
  } catch {
    return null
  }
}

function LoginButton({ onSuccess, onError }: GoogleLoginButtonProps) {
  const handleSuccess = async (credentialResponse: any) => {
    try {
      const payload = decodeJWT(credentialResponse.credential)
      if (!payload) {
        onError()
        return
      }
      onSuccess({
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      })
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
