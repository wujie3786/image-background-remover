'use client'

import { useState } from 'react'
import Uploader from '../components/Uploader'
import ImagePreview from '../components/ImagePreview'
import LoadingSpinner from '../components/LoadingSpinner'

export default function Home() {
  const [originalImage, setOriginalImage] = useState<string | null>(null)
  const [processedImage, setProcessedImage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Background Remover
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Remove image backgrounds instantly with AI
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            {error}
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
