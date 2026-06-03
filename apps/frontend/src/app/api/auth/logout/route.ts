import { NextResponse } from 'next/server'

export async function GET() {
  const res = NextResponse.redirect(
    new URL('/login', process.env['NEXTAUTH_URL'] ?? process.env['AUTH_URL'] ?? 'http://localhost:3000'),
  )
  res.cookies.set('ctm_token', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0, // expire immediately
  })
  return res
}

export async function POST() {
  return GET()
}
