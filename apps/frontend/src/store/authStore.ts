import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  workspaceId: string
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isLoading: boolean

  setAuth: (user: AuthUser, accessToken: string) => void
  clearAuth: () => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isLoading: true,

      setAuth: (user, accessToken) => set({ user, accessToken, isLoading: false }),
      clearAuth: () => set({ user: null, accessToken: null, isLoading: false }),
      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name: 'ctm-auth',
      // Only persist user info — accessToken is re-fetched from the httpOnly
      // cookie via /api/auth/me on each page load, but we store it in memory
      // for the session so API calls can use it without an extra round-trip.
      partialize: (state) => ({ user: state.user }),
    },
  ),
)
