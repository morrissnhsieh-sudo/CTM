import { NextRequest, NextResponse } from 'next/server'
import { decodeToken } from '@/lib/session'

const AUTH_API_BASE =
  process.env['AUTH_API_BASE'] ??
  process.env['NEXT_PUBLIC_API_URL'] ??
  'http://localhost:3001'

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

  try {
    const apiRes = await fetch(`${AUTH_API_BASE}/v1/users/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Workspace-Id': payload.workspace_id ?? '',
      }
    })
    if (apiRes.ok) {
      const body = await apiRes.json()
      if (body?.data) {
        return NextResponse.json({
          user: {
            id: body.data.id,
            email: body.data.email,
            name: body.data.name,
            role: body.data.role,
            workspaceId: body.data.workspaceId,
            avatarUrl: body.data.avatarUrl || null,
            organizationName: body.data.organizationName || null,
            employeeId: body.data.employeeId || null,
            tel: body.data.tel || null,
          },
          accessToken: token,
        })
      }
    }
  } catch (err) {
    console.error('[api/auth/me] failed to fetch from DB, falling back to token payload', err)
  }

  return NextResponse.json({
    user: {
      id: payload.sub ?? '',
      email: payload.email ?? '',
      name: payload.name ?? '',
      role: role,
      workspaceId: payload.workspace_id ?? '',
      avatarUrl: null,
      organizationName: null,
      employeeId: null,
      tel: null,
    },
    accessToken: token,
  })
}
