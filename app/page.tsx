'use client'

import { useState, useEffect } from 'react'
import Uploader from '../components/Uploader'
import ImagePreview from '../components/ImagePreview'
import LoadingSpinner from '../components/LoadingSpinner'
import GoogleLoginButton from '../components/GoogleLogin'
import UserMenu from '../components/UserMenu'

interface User {
  id: string
  email?: string
  name?: string
  picture?: string
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [originalImage, setOriginalImage] = useState<string | null>(null)
  const [processedImage, setProcessedImage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check auth status on mount
  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/session')
      const data = await response.json()
      if (data.authenticated && data.user) {
        setUser(data.user)
      }
    } catch (err) {
      console.error('Auth check failed:', err)
    } finally {
      setCheckingAuth(false)
    }
  }

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser)
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      setUser(null)
      // Reset images on logout
      setOriginalImage(null)
      setProcessedImage(null)
      setError(null)
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }

  const handleImageUpload = (file: File) => {
    setError(null)
    setOriginalImage(URL.createObjectURL(file))
    setProcessedImage(null)
  }

  const handleProcessingComplete = (resultUrl: string) => {
    setProcessedImage(resultUrl)
    setIsLoading(false)
  }

  const handleError = (errorMessage: string) => {
    setError(errorMessage)
    setIsLoading(false)
  }

  const handleReset = () => {
    setOriginalImage(null)
    setProcessedImage(null)
    setError(null)
    setIsLoading(false)
  }

  // Show loading while checking auth
  if (checkingAuth) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="relative flex justify-between items-center mb-12">
          <div className="text-center flex-1">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Background Remover
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Remove image backgrounds instantly with AI
            </p>
          </div>
          
          {/* Auth Section */}
          <div className="absolute top-4 right-4 z-10">
            {user ? (
              <UserMenu user={user} onLogout={handleLogout} />
            ) : (
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 text-center">
                  Sign in to use the tool
                </p>
                <GoogleLoginButton
                  onSuccess={handleLogin}
                  onError={() => setError('Login failed. Please try again.')}
                />
              </div>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Login Required Message */}
        {!user && !checkingAuth && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded mb-6 text-center">
            <p>Please sign in with Google to use the background remover.</p>
          </div>
        )}

        {/* Main Content */}
        {!originalImage && !isLoading && (
          <Uploader onImageUpload={handleImageUpload} />
        )}

        {(originalImage || isLoading) && !error && (
          <div className="space-y-6">
            {isLoading && <LoadingSpinner />}

            {originalImage && processedImage && !isLoading && (
              <ImagePreview
                originalImage={originalImage}
                processedImage={processedImage}
                onReset={handleReset}
              />
            )}

            {originalImage && !processedImage && !isLoading && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <img
                  src={originalImage}
                  alt="Original"
                  className="w-full h-auto max-h-96 object-contain rounded"
                />
                <button
                  onClick={() => setIsLoading(true)}
                  className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  Remove Background
                </button>
              </div>
            )}
          </div>
        )}

        {/* Features Section */}
        <div className="mt-16 grid md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <div className="text-3xl mb-3">🔒</div>
            <h3 className="text-xl font-semibold mb-2 dark:text-white">Privacy First</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Images are processed in memory and never stored on our servers
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <div className="text-3xl mb-3">⚡</div>
            <h3 className="text-xl font-semibold mb-2 dark:text-white">Instant Results</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Upload, process, and download in seconds with AI-powered background removal
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <div className="text-3xl mb-3">💎</div>
            <h3 className="text-xl font-semibold mb-2 dark:text-white">High Quality</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Professional-grade background removal with precise edge detection
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
