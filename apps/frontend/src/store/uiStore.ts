import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ViewMode = 'grid' | 'gantt' | 'kanban' | 'calendar' | 'form' | 'dashboard' | 'timeline'

interface UIState {
  // Panels
  rightPanelOpen: boolean
  rightPanelTab: 'comments' | 'ai' | 'history'
  leftSidebarOpen: boolean
  commandPaletteOpen: boolean

  // View
  viewMode: ViewMode
  theme: 'light' | 'dark' | 'system'
  compactMode: boolean

  // Actions
  toggleRightPanel: () => void
  setRightPanelTab: (tab: UIState['rightPanelTab']) => void
  toggleLeftSidebar: () => void
  setCommandPalette: (open: boolean) => void
  setViewMode: (mode: ViewMode) => void
  setTheme: (theme: UIState['theme']) => void
  toggleCompactMode: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      rightPanelOpen: false,
      rightPanelTab: 'comments',
      leftSidebarOpen: true,
      commandPaletteOpen: false,
      viewMode: 'grid',
      theme: 'system',
      compactMode: false,

      toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
      setRightPanelTab: (tab) => set({ rightPanelTab: tab, rightPanelOpen: true }),
      toggleLeftSidebar: () => set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),
      setCommandPalette: (open) => set({ commandPaletteOpen: open }),
      setViewMode: (mode) => set({ viewMode: mode }),
      setTheme: (theme) => set({ theme }),
      toggleCompactMode: () => set((s) => ({ compactMode: !s.compactMode })),
    }),
    { name: 'ctm-ui-store' }
  )
)
