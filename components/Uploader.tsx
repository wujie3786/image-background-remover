'use client'

import { useCallback, useState } from 'react'

interface UploaderProps {
  onImageUpload: (file: File) => void
}

export default function Uploader({ onImageUpload }: UploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validateFile = (file: File): boolean => {
    // Check file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setError('Please upload a JPG, PNG, or WEBP image')
      return false
    }

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB')
      return false
    }

    setError(null)
    return true
  }

  const handleFile = (file: File | null) => {
    if (!file) return

    if (validateFile(file)) {
      onImageUpload(file)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    handleFile(file)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    handleFile(file)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
        }`}
      >
        <div className="text-6xl mb-4">📁</div>
        <h2 className="text-2xl font-semibold mb-2 dark:text-white">
          Upload an Image
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Drag and drop an image here, or click to select
        </p>
        <input
          type="file"
          id="file-input"
          className="hidden"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleInputChange}
        />
        <label
          htmlFor="file-input"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg cursor-pointer transition-colors"
        >
          Choose File
        </label>
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Supports JPG, PNG, WEBP • Max 10MB
        </p>
      </div>

      {error && (
        <div className="mt-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}
    </div>
  )
}
