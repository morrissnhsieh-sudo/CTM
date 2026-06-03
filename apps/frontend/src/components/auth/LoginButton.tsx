'use client'

import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'

interface LoginButtonProps {
  callbackUrl: string
}

export default function LoginButton({ callbackUrl }: LoginButtonProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { setAuth } = useAuthStore()

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!email || !password || (mode === 'register' && !name)) {
      setError('Please fill in all required fields.')
      return
    }

    setSubmitting(true)

    try {
      // Register first if needed
      if (mode === 'register') {
        const response = await fetch(`${apiBase}/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name, password }),
        })

        if (!response.ok) {
          const body = await response.json().catch(() => null)
          setError(body?.error?.message ?? 'Registration failed. Please try again.')
          return
        }
      }

      // POST to our own Next.js route which sets the httpOnly cookie
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error ?? 'Authentication failed. Please check your credentials.')
        return
      }

      const data = (await res.json()) as {
        user: { id: string; email: string; name: string; role: string; workspaceId: string }
      }

      // Hydrate the auth store — accessToken is in the httpOnly cookie,
      // we re-fetch it from /api/auth/me on the next load. For this session,
      // fetch it immediately so in-page features work right away.
      const meRes = await fetch('/api/auth/me')
      let dest = callbackUrl
      if (meRes.ok) {
        const me = (await meRes.json()) as {
          user: { id: string; email: string; name: string; role: string; workspaceId: string }
          accessToken: string
        }
        setAuth(me.user, me.accessToken)
        if (dest === '/') {
          dest = `/${me.user.workspaceId}`
        }
      } else {
        // Fallback — user info without access token (token is in cookie, API calls still work)
        setAuth(data.user, '')
        if (dest === '/') {
          dest = `/${data.user.workspaceId}`
        }
      }

      window.location.href = dest
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            required
          />
        </div>

        {mode === 'register' && (
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>
        )}

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            required
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
      >
        {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'login' ? 'register' : 'login')
          setError(null)
        }}
        className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
      >
        {mode === 'login' ? 'Create a new account' : 'Already have an account? Sign in'}
      </button>
    </form>
  )
}
