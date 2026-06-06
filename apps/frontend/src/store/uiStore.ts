import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ViewMode = 'grid' | 'gantt' | 'kanban' | 'calendar' | 'form' | 'dashboard' | 'timeline' | 'resources'

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

  // Highlight Changes
  highlightChangesEnabled: boolean
  highlightChangesTimeframe: 'today' | '3days' | '7days' | 'last_login'

  // Actions
  toggleRightPanel: () => void
  setRightPanelTab: (tab: UIState['rightPanelTab']) => void
  toggleLeftSidebar: () => void
  setCommandPalette: (open: boolean) => void
  setViewMode: (mode: ViewMode) => void
  setTheme: (theme: UIState['theme']) => void
  toggleCompactMode: () => void
  setHighlightChangesEnabled: (enabled: boolean) => void
  setHighlightChangesTimeframe: (timeframe: UIState['highlightChangesTimeframe']) => void
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
      highlightChangesEnabled: false,
      highlightChangesTimeframe: 'today',

      toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
      setRightPanelTab: (tab) => set({ rightPanelTab: tab, rightPanelOpen: true }),
      toggleLeftSidebar: () => set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),
      setCommandPalette: (open) => set({ commandPaletteOpen: open }),
      setViewMode: (mode) => set({ viewMode: mode }),
      setTheme: (theme) => set({ theme }),
      toggleCompactMode: () => set((s) => ({ compactMode: !s.compactMode })),
      setHighlightChangesEnabled: (enabled) => set({ highlightChangesEnabled: enabled }),
      setHighlightChangesTimeframe: (timeframe) => set({ highlightChangesTimeframe: timeframe }),
    }),
    { name: 'ctm-ui-store' }
  )
)
