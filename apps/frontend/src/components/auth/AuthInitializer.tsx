'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'

/**
 * Fetches the current session from our /api/auth/me route on mount
 * and hydrates the Zustand auth store. Placed once in the root layout.
 */
export function AuthInitializer() {
  const { setAuth, clearAuth, setLoading } = useAuthStore()

  useEffect(() => {
    setLoading(true)
    fetch('/api/auth/me')
      .then(async (res) => {
        if (!res.ok) {
          clearAuth()
          return
        }
        const data = (await res.json()) as {
          user: { id: string; email: string; name: string; role: string; workspaceId: string }
          accessToken: string
        }
        if (data.user && data.accessToken) {
          setAuth(data.user, data.accessToken)
        } else {
          clearAuth()
        }
      })
      .catch(() => clearAuth())
  }, [setAuth, clearAuth, setLoading])

  return null
}
