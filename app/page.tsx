'use client'

import { useState, useEffect, useCallback } from 'react'
import Uploader from '../components/Uploader'
import ImagePreview from '../components/ImagePreview'
import LoadingSpinner from '../components/LoadingSpinner'
import GoogleLoginButton from '../components/GoogleLogin'
import UserMenu from '../components/UserMenu'
import { API_BASE } from '../lib/config'

interface User {
  id: string
  email?: string
  name?: string
  picture?: string
  plan?: string
}

interface Stats {
  plan: string
  daily_limit: number
  today_count: number
  today_remaining: number
  month_count: number
  can_use: boolean
}

const SESSION_KEY = 'ibr_session'
const USER_KEY = 'ibr_user'

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem(SESSION_KEY)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (res.status === 401) {
    localStorage.removeItem(SESSION_KEY)
    window.location.reload()
    return null
  }
  return res
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [apiConnected, setApiConnected] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [originalImage, setOriginalImage] = useState<string | null>(null)
  const [processedImage, setProcessedImage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load session + fetch stats on mount
  useEffect(() => {
    // Quick API connectivity check
    fetch(`${API_BASE}/api/health`)
      .then(r => r.ok ? setApiConnected(true) : setApiConnected(false))
      .catch(() => setApiConnected(false))

    const loadSession = async () => {
      const token = localStorage.getItem(SESSION_KEY)
      if (!token) {
        setCheckingAuth(false)
        return
      }
      try {
        const res = await apiFetch('/api/user/profile')
        if (res && res.ok) {
          const data = await res.json()
          setUser(data)
          // Also persist user data separately
          try { localStorage.setItem(USER_KEY, JSON.stringify(data)) } catch {}
        } else {
          localStorage.removeItem(SESSION_KEY)
          localStorage.removeItem(USER_KEY)
        }
      } catch (err) {
        console.error('Auth check failed:', err)
      } finally {
        setCheckingAuth(false)
      }
    }
    loadSession()
  }, [])

  // Fetch stats when user changes
  useEffect(() => {
    if (!user) return
    const loadStats = async () => {
      try {
        const res = await apiFetch('/api/user/stats')
        if (res && res.ok) {
          setStats(await res.json())
        }
      } catch (err) {
        console.error('Stats load failed:', err)
      }
    }
    loadStats()
  }, [user])

  const handleLogin = async (loggedInUser: User) => {
    // Token is already saved by GoogleLogin component in localStorage under ibr_session
    // Here we just store the user object separately
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(loggedInUser))
    } catch (err) {
      console.error('Failed to save user:', err)
    }
    setUser(loggedInUser)
  }

  const handleLogout = async () => {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(USER_KEY)
    setUser(null)
    setStats(null)
    setOriginalImage(null)
    setProcessedImage(null)
    setError(null)
  }

  // Check if user can use tool
  const canUseTool = !user || (stats?.can_use ?? false)

  const handleImageUpload = (file: File) => {
    if (!user) return
    if (!stats?.can_use) {
      setError(`今日次数已用完（${stats?.today_count}/${stats?.daily_limit}）。升级到 Pro 每日可使用 50 次。`)
      return
    }
    setError(null)
    setOriginalImage(URL.createObjectURL(file))
    setProcessedImage(null)
  }

  const handleRemoveBg = async () => {
    if (!user || !originalImage) return
    if (!stats?.can_use) {
      setError('今日次数已用完，请明天再试或升级 Pro。')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Record usage
      const res = await apiFetch('/api/use', { method: 'POST' })
      const data = res ? await res.json() : null

      if (!res || !res.ok || !data?.allowed) {
        setError(data?.limit_reached
          ? `今日次数已用完（${stats?.today_count}/${stats?.daily_limit}）。升级 Pro 可享每日 50 次。`
          : '无法使用工具，请重试。')
        setIsLoading(false)
        return
      }

      // Update local stats
      setStats((s) => s ? {
        ...s,
        today_count: s.today_count + 1,
        today_remaining: s.today_remaining - 1,
        can_use: s.today_remaining - 1 > 0,
      } : null)

      // Call remove.bg API (mock for now)
      // TODO: integrate actual remove.bg
      setTimeout(() => {
        setProcessedImage(originalImage)
        setIsLoading(false)
      }, 2000)
    } catch (err) {
      setError('处理失败，请重试。')
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setOriginalImage(null)
    setProcessedImage(null)
    setError(null)
    setIsLoading(false)
  }

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
        <div className="relative flex justify-between items-center mb-8">
          <div className="text-center flex-1">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              Background Remover
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Remove image backgrounds instantly with AI
            </p>
          </div>

          {/* Auth Section */}
          <div className="absolute top-0 right-0 z-10">
            {user ? (
              <div className="flex items-center gap-3">
                {stats && (
                  <div className="text-right">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {stats.plan === 'pro' ? 'Pro' : 'Free'} · 今日 {stats.today_count}/{stats.daily_limit}
                    </div>
                    <div className="w-24 h-1.5 bg-gray-200 rounded-full mt-1">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (stats.today_count / stats.daily_limit) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                <UserMenu user={user} onLogout={handleLogout} />
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
                <GoogleLoginButton
                  onSuccess={handleLogin}
                  onError={(msg) => setError(msg || '登录失败，请重试。')}
                />
              </div>
            )}
          </div>
        </div>

        {/* Usage Limit Banner */}
        {user && stats && stats.today_remaining <= 2 && stats.today_remaining > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded mb-4 text-sm text-center">
            今日剩余 <strong>{stats.today_remaining} 次</strong>，明天重置。升级 Pro 每日 50 次。
          </div>
        )}

        {user && stats && !stats.can_use && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4 text-center">
            今日次数已用完（{stats.today_count}/{stats.daily_limit}）。
            <a href="/#pricing" className="underline ml-1">升级 Pro →</a>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Login Required + Usage Notice */}
        {!user && !checkingAuth && (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded mb-4 text-center">
            登录后可使用工具 · 每日免费 {5} 次 · 无需信用卡
          </div>
        )}

        {/* API Connection Error */}
        {!apiConnected && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-center">
            ⚠️ 无法连接到服务器，请检查网络后重试
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
                  onClick={handleRemoveBg}
                  className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  Remove Background
                </button>
              </div>
            )}
          </div>
        )}

        {/* Features */}
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
