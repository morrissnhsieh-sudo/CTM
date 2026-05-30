import type { UserRole } from './workspace.js'

export interface JwtPayload {
  sub: string           // userId
  email: string
  name: string
  workspace_id: string
  roles: UserRole[]
  exp: number
  iat: number
  jti: string
}

export interface ApiToken {
  id: string
  userId: string
  workspaceId: string
  role: UserRole
  tokenHash: string  // SHA-256 of raw token
  name: string
  lastUsedAt: Date | null
  createdAt: Date
  expiresAt: Date | null
}

export interface OAuthTokenResponse {
  access_token: string
  refresh_token: string
  token_type: 'Bearer'
  expires_in: number
  scope: string
}
