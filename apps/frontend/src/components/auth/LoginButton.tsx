'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'

interface LoginButtonProps {
  callbackUrl: string
}

export default function LoginButton({ callbackUrl }: LoginButtonProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!email || !password || (mode === 'register' && !name)) {
      setError('Please fill in all required fields.')
      return
    }

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

    const result = await signIn('credentials', {
      redirect: false,
      email,
      password,
      callbackUrl,
    })

    if (!result?.ok) {
      setError(result?.error ?? 'Authentication failed. Please check your credentials.')
      return
    }

    window.location.href = callbackUrl
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
        className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white transition hover:bg-primary/90"
      >
        {mode === 'login' ? 'Sign in' : 'Create account'}
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
