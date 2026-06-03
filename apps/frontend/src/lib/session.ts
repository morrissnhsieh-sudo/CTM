import { cookies } from 'next/headers'

export interface JwtPayload {
  sub?: string
  email?: string
  name?: string
  roles?: string[]
  workspace_id?: string
  exp?: number
  iat?: number
}

/**
 * Decode a JWT without verifying the signature.
 * The token was already validated by the api-service before being issued.
 * We only need the payload for display/routing purposes on the frontend.
 */
export function decodeToken(token: string): JwtPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1]!
    // JWT uses base64url encoding — convert to standard base64 first
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = Buffer.from(base64, 'base64').toString('utf8')
    return JSON.parse(json) as JwtPayload
  } catch {
    return null
  }
}

/**
 * Read the session from the ctm_token cookie (server components / route handlers).
 * Returns null if no valid token is found.
 */
export async function getSession(): Promise<{
  user: { id: string; email: string; name: string; role: string; workspaceId: string }
  accessToken: string
} | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('ctm_token')?.value
  if (!token) return null

  const payload = decodeToken(token)
  if (!payload) return null

  // Treat expired tokens as unauthenticated
  if (payload.exp && payload.exp * 1000 < Date.now()) return null

  const roles = payload.roles ?? []
  const role = roles[0] ?? ''

  return {
    user: {
      id: payload.sub ?? '',
      email: payload.email ?? '',
      name: payload.name ?? '',
      role: role,
      workspaceId: payload.workspace_id ?? '',
    },
    accessToken: token,
  }
}
