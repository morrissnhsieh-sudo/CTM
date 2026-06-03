import { auth } from './app/api/auth/[...nextauth]/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Public paths
  if (pathname.startsWith('/api/auth') || pathname === '/login' || pathname === '/invite') {
    return NextResponse.next()
  }

  // Not authenticated → redirect to login
  if (!req.auth?.user) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', req.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
