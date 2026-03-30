'use client'

import { useState } from 'react'

interface User {
  id: string
  email?: string
  name?: string
  picture?: string
}

interface UserMenuProps {
  user: User
  onLogout: () => void
}

export default function UserMenu({ user, onLogout }: UserMenuProps) {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-full shadow-md p-2 hover:shadow-lg transition-shadow"
      >
        {user.picture ? (
          <img
            src={user.picture}
            alt={user.name || 'User'}
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-sm">
            {user.name?.charAt(0).toUpperCase() || 'U'}
          </div>
        )}
        <span className="text-gray-700 dark:text-gray-300 text-sm font-medium hidden md:inline">
          {user.name || user.email}
        </span>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${showMenu ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showMenu && (
        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg py-2 z-50">
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {user.name || 'User'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {user.email || 'No email'}
            </p>
          </div>
          <button
            onClick={() => {
              setShowMenu(false)
              onLogout()
            }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
