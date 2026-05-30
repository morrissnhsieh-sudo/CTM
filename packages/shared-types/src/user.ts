import type { UserRole } from './workspace.js'

export interface User {
  id: string
  workspaceId: string
  email: string
  name: string
  avatarUrl: string | null
  role: UserRole
  lastActive: Date | null
  createdAt: Date
}

export interface RequestContext {
  userId: string
  workspaceId: string
  role: UserRole
  authMethod: 'jwt' | 'pat' | 'mcp' | 'mtls'
  scopes?: string[]
}
