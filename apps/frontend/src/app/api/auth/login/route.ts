import { NextRequest, NextResponse } from 'next/server'

const AUTH_API_BASE =
  process.env['AUTH_API_BASE'] ??
  process.env['NEXT_PUBLIC_API_URL'] ??
  'http://localhost:3001'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = (await req.json()) as {
      email?: string
      password?: string
    }

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 },
      )
    }

    const apiRes = await fetch(`${AUTH_API_BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!apiRes.ok) {
      const body = await apiRes.text().catch(() => '')
      console.error('[auth/login] api rejected', apiRes.status, body)
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 },
      )
    }

    const payload = (await apiRes.json()) as any
    console.log('[api/auth/login] API response body:', JSON.stringify(payload))

    const { token, user } = payload.data ?? {}
    if (!token || !user) {
      return NextResponse.json(
        { error: 'Unexpected response from auth service' },
        { status: 502 },
      )
    }

    console.log('[api/auth/login] login success. token length:', token.length, 'NODE_ENV:', process.env['NODE_ENV'])

    const res = NextResponse.json({ user })

    // Store the raw JWT in an httpOnly cookie so the middleware and
    // server components can read it without exposing it to JavaScript.
    res.cookies.set('ctm_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      // 7-day expiry — matches typical JWT lifetime
      maxAge: 60 * 60 * 24 * 7,
      // Use secure cookies in production
      secure: process.env['NODE_ENV'] === 'production',
    })

    console.log('[api/auth/login] cookie set on response object. Set-Cookie header present:', res.headers.has('set-cookie'))
    return res
  } catch (err) {
    console.error('[auth/login] unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
