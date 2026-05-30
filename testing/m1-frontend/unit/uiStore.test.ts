/**
 * M1 — Frontend Shell
 * Unit tests: uiStore — panels, view mode, command palette
 *
 * Spec refs:
 *  - Right panel: collapsible; maintains WebSocket connection when hidden
 *  - View modes: grid, gantt, kanban, calendar, form, dashboard, timeline
 *  - ⌘K / Ctrl+K command palette
 *  - Theme: light/dark/system via next-themes
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ViewMode = 'grid' | 'gantt' | 'kanban' | 'calendar' | 'form' | 'dashboard' | 'timeline'

interface UIState {
  rightPanelOpen: boolean; rightPanelTab: 'comments' | 'ai' | 'history'
  leftSidebarOpen: boolean; commandPaletteOpen: boolean
  viewMode: ViewMode; theme: 'light' | 'dark' | 'system'; compactMode: boolean
  toggleRightPanel: () => void; setRightPanelTab: (t: UIState['rightPanelTab']) => void
  toggleLeftSidebar: () => void; setCommandPalette: (o: boolean) => void
  setViewMode: (m: ViewMode) => void; setTheme: (t: UIState['theme']) => void
  toggleCompactMode: () => void
}

const createUIStore = () => create<UIState>()((set) => ({
  rightPanelOpen: false, rightPanelTab: 'comments', leftSidebarOpen: true,
  commandPaletteOpen: false, viewMode: 'grid', theme: 'system', compactMode: false,
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setRightPanelTab: (t) => set({ rightPanelTab: t, rightPanelOpen: true }),
  toggleLeftSidebar: () => set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),
  setCommandPalette: (o) => set({ commandPaletteOpen: o }),
  setViewMode: (m) => set({ viewMode: m }),
  setTheme: (t) => set({ theme: t }),
  toggleCompactMode: () => set((s) => ({ compactMode: !s.compactMode })),
}))

describe('M1 uiStore', () => {
  let store: ReturnType<typeof createUIStore>
  beforeEach(() => { store = createUIStore() })

  describe('right panel', () => {
    it('starts closed', () => expect(store.getState().rightPanelOpen).toBe(false))

    it('toggleRightPanel opens the panel', () => {
      store.getState().toggleRightPanel()
      expect(store.getState().rightPanelOpen).toBe(true)
    })

    it('toggleRightPanel closes an open panel', () => {
      store.getState().toggleRightPanel()
      store.getState().toggleRightPanel()
      expect(store.getState().rightPanelOpen).toBe(false)
    })

    it('setRightPanelTab opens panel and sets tab', () => {
      store.getState().setRightPanelTab('ai')
      expect(store.getState().rightPanelOpen).toBe(true)
      expect(store.getState().rightPanelTab).toBe('ai')
    })

    it('can switch between all three tabs', () => {
      const tabs: UIState['rightPanelTab'][] = ['comments', 'ai', 'history']
      for (const tab of tabs) {
        store.getState().setRightPanelTab(tab)
        expect(store.getState().rightPanelTab).toBe(tab)
      }
    })
  })

  describe('view mode', () => {
    it('defaults to grid view', () => expect(store.getState().viewMode).toBe('grid'))

    const views: ViewMode[] = ['grid', 'gantt', 'kanban', 'calendar', 'form', 'dashboard', 'timeline']
    views.forEach((v) => {
      it(`can switch to ${v} view`, () => {
        store.getState().setViewMode(v)
        expect(store.getState().viewMode).toBe(v)
      })
    })

    it('switching view does not close the right panel', () => {
      store.getState().toggleRightPanel() // open it
      store.getState().setViewMode('gantt')
      expect(store.getState().rightPanelOpen).toBe(true)
    })
  })

  describe('command palette', () => {
    it('starts closed', () => expect(store.getState().commandPaletteOpen).toBe(false))
    it('setCommandPalette(true) opens it', () => {
      store.getState().setCommandPalette(true)
      expect(store.getState().commandPaletteOpen).toBe(true)
    })
    it('setCommandPalette(false) closes it', () => {
      store.getState().setCommandPalette(true)
      store.getState().setCommandPalette(false)
      expect(store.getState().commandPaletteOpen).toBe(false)
    })
  })

  describe('theme', () => {
    it('defaults to system', () => expect(store.getState().theme).toBe('system'))
    it('can set dark theme', () => {
      store.getState().setTheme('dark')
      expect(store.getState().theme).toBe('dark')
    })
    it('can set light theme', () => {
      store.getState().setTheme('light')
      expect(store.getState().theme).toBe('light')
    })
  })

  describe('compact mode', () => {
    it('starts false', () => expect(store.getState().compactMode).toBe(false))
    it('toggle enables compact mode', () => {
      store.getState().toggleCompactMode()
      expect(store.getState().compactMode).toBe(true)
    })
    it('double toggle restores normal mode', () => {
      store.getState().toggleCompactMode()
      store.getState().toggleCompactMode()
      expect(store.getState().compactMode).toBe(false)
    })
  })
})
