import { create } from 'zustand'
import type { PresenceData } from '@ctm/shared-types'

interface UserState {
  userId: string | null
  workspaceId: string | null
  role: string | null
  accessToken: string | null

  // Collaborators presence (from Hocuspocus Awareness)
  collaborators: Map<string, PresenceData & { cursor?: { row: number; col: number }; color?: string }>

  setUser: (userId: string, workspaceId: string, role: string, accessToken: string) => void
  setCollaborator: (userId: string, data: PresenceData & { cursor?: { row: number; col: number }; color?: string }) => void
  removeCollaborator: (userId: string) => void
  clearCollaborators: () => void
}

// Assign a unique color to each collaborator (deterministic from userId)
const PRESENCE_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
]

export function presenceColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i)
    hash |= 0
  }
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length]!
}

export const useUserStore = create<UserState>()((set) => ({
  userId: null,
  workspaceId: null,
  role: null,
  accessToken: null,
  collaborators: new Map(),

  setUser: (userId, workspaceId, role, accessToken) =>
    set({ userId, workspaceId, role, accessToken }),

  setCollaborator: (userId, data) =>
    set((s) => {
      const m = new Map(s.collaborators)
      m.set(userId, { ...data, color: presenceColor(userId) })
      return { collaborators: m }
    }),

  removeCollaborator: (userId) =>
    set((s) => {
      const m = new Map(s.collaborators)
      m.delete(userId)
      return { collaborators: m }
    }),

  clearCollaborators: () => set({ collaborators: new Map() }),
}))
