import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Public paths — always allow
  if (
    pathname.startsWith('/api/auth') ||
    pathname === '/login' ||
    pathname === '/invite'
  ) {
    return NextResponse.next()
  }

  // Check for our session cookie
  const token = req.cookies.get('ctm_token')?.value
  if (!token) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', req.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
