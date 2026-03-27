'use client'

export default function LoadingSpinner() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-12 text-center">
      <div className="flex justify-center mb-4">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent"></div>
      </div>
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
        Removing Background...
      </h2>
      <p className="text-gray-600 dark:text-gray-400">
        This usually takes a few seconds
      </p>
    </div>
  )
}
