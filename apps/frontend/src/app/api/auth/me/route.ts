import { NextRequest, NextResponse } from 'next/server'
import { decodeToken } from '@/lib/session'

export async function GET(req: NextRequest) {
  const token = req.cookies.get('ctm_token')?.value
  console.log('[api/auth/me] cookie token present:', !!token)
  if (!token) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  const payload = decodeToken(token)
  console.log('[api/auth/me] token payload decoded:', !!payload)
  if (!payload) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  const roles = payload.roles ?? []
  const role = roles[0] ?? ''

  return NextResponse.json({
    user: {
      id: payload.sub ?? '',
      email: payload.email ?? '',
      name: payload.name ?? '',
      role: role,
      workspaceId: payload.workspace_id ?? '',
    },
    accessToken: token,
  })
}
