export type WorkspacePlan = 'free' | 'pro' | 'business' | 'enterprise'

export interface Workspace {
  id: string
  name: string
  plan: WorkspacePlan
  ownerId: string
  settings: WorkspaceSettings
  createdAt: Date
  deletedAt: Date | null
}

export interface WorkspaceSettings {
  aiTokenBudget: number
  aiTokenBudgetUnlimited: boolean
  aiDataAccess: boolean
  mfaRequired: boolean
  allowedSsoDomains: string[]
  defaultRole: UserRole
  webhookSecret?: string
}

export type UserRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'COMMENTER' | 'VIEWER'

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  VIEWER: 1,
  COMMENTER: 2,
  EDITOR: 3,
  ADMIN: 4,
  OWNER: 5,
}

export function hasMinRole(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole]
}
