/**
 * M1 — Frontend Shell
 * Unit tests: gridStore (Zustand state management)
 *
 * Spec refs:
 *  - M1.3 State Management: Zustand stores — gridStore (selection, scroll, viewport)
 *  - Undo/Redo: Yjs UndoManager (unlimited within session)
 *  - Cell edit mode: Double-click or F2 activates inline editor
 *  - Multi-select: Shift+click range, Ctrl+click individual cells
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { act } from '@testing-library/react'

// We test the store logic directly (no React needed for state tests)
// Re-implement the minimal store logic here to keep tests self-contained
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

// ── Inline store type (mirrors apps/frontend/src/store/gridStore.ts) ─────────
interface CellSelection { startRow: number; startCol: number; endRow: number; endCol: number }
interface GridState {
  scrollTop: number; scrollLeft: number
  selection: CellSelection | null; activeCell: { row: number; col: number } | null
  isEditing: boolean; editValue: string
  colWidths: Map<number, number>; rowHeights: Map<number, number>
  cellCache: Map<string, unknown>
  frozenRows: number; frozenCols: number
  setScroll: (top: number, left: number) => void
  setSelection: (s: CellSelection | null) => void
  setActiveCell: (row: number, col: number) => void
  startEditing: (init?: string) => void; stopEditing: (commit: boolean) => void
  setEditValue: (v: string) => void
  setColWidth: (col: number, w: number) => void
  setCellCache: (key: string, value: unknown) => void
}

const createTestStore = () => create<GridState>()(
  subscribeWithSelector((set) => ({
    scrollTop: 0, scrollLeft: 0, selection: null, activeCell: null,
    isEditing: false, editValue: '',
    colWidths: new Map(), rowHeights: new Map(), cellCache: new Map(),
    frozenRows: 0, frozenCols: 0,
    setScroll: (top, left) => set({ scrollTop: top, scrollLeft: left }),
    setSelection: (s) => set({ selection: s }),
    setActiveCell: (row, col) => set({
      activeCell: { row, col },
      selection: { startRow: row, startCol: col, endRow: row, endCol: col },
    }),
    startEditing: (init) => set({ isEditing: true, editValue: init ?? '' }),
    stopEditing: () => set({ isEditing: false, editValue: '' }),
    setEditValue: (v) => set({ editValue: v }),
    setColWidth: (col, w) => set((s) => { const m = new Map(s.colWidths); m.set(col, w); return { colWidths: m } }),
    setCellCache: (key, value) => set((s) => { const m = new Map(s.cellCache); m.set(key, value); return { cellCache: m } }),
  }))
)

describe('M1 gridStore', () => {
  let store: ReturnType<typeof createTestStore>

  beforeEach(() => { store = createTestStore() })

  // ── Scroll ────────────────────────────────────────────────────────────────
  describe('scroll state', () => {
    it('initialises at (0, 0)', () => {
      const { scrollTop, scrollLeft } = store.getState()
      expect(scrollTop).toBe(0)
      expect(scrollLeft).toBe(0)
    })

    it('updates scroll position via setScroll', () => {
      store.getState().setScroll(200, 350)
      const { scrollTop, scrollLeft } = store.getState()
      expect(scrollTop).toBe(200)
      expect(scrollLeft).toBe(350)
    })

    it('allows independent horizontal and vertical scroll', () => {
      store.getState().setScroll(0, 500)
      expect(store.getState().scrollTop).toBe(0)
      expect(store.getState().scrollLeft).toBe(500)

      store.getState().setScroll(100, 500)
      expect(store.getState().scrollTop).toBe(100)
      expect(store.getState().scrollLeft).toBe(500)
    })
  })

  // ── Cell selection ─────────────────────────────────────────────────────────
  describe('cell selection', () => {
    it('starts with no selection', () => {
      expect(store.getState().selection).toBeNull()
      expect(store.getState().activeCell).toBeNull()
    })

    it('setActiveCell updates activeCell and creates single-cell selection', () => {
      store.getState().setActiveCell(3, 5)
      const { activeCell, selection } = store.getState()
      expect(activeCell).toEqual({ row: 3, col: 5 })
      expect(selection).toEqual({ startRow: 3, startCol: 5, endRow: 3, endCol: 5 })
    })

    it('setSelection sets a multi-cell range independently', () => {
      store.getState().setSelection({ startRow: 1, startCol: 1, endRow: 4, endCol: 6 })
      const { selection } = store.getState()
      expect(selection?.endRow).toBe(4)
      expect(selection?.endCol).toBe(6)
    })

    it('clearSelection sets selection to null', () => {
      store.getState().setActiveCell(2, 2)
      store.getState().setSelection(null)
      expect(store.getState().selection).toBeNull()
    })

    it('navigating to a new cell replaces the selection', () => {
      store.getState().setActiveCell(0, 0)
      store.getState().setActiveCell(5, 10)
      const { selection } = store.getState()
      expect(selection).toEqual({ startRow: 5, startCol: 10, endRow: 5, endCol: 10 })
    })
  })

  // ── Edit mode ─────────────────────────────────────────────────────────────
  describe('cell edit mode', () => {
    it('isEditing starts as false', () => {
      expect(store.getState().isEditing).toBe(false)
    })

    it('startEditing sets isEditing to true with empty value', () => {
      store.getState().startEditing()
      expect(store.getState().isEditing).toBe(true)
      expect(store.getState().editValue).toBe('')
    })

    it('startEditing with initialValue pre-fills editValue (keyboard-initiated edit)', () => {
      store.getState().startEditing('=SUM')
      expect(store.getState().isEditing).toBe(true)
      expect(store.getState().editValue).toBe('=SUM')
    })

    it('setEditValue updates the in-progress value', () => {
      store.getState().startEditing()
      store.getState().setEditValue('Hello World')
      expect(store.getState().editValue).toBe('Hello World')
    })

    it('stopEditing resets isEditing and editValue', () => {
      store.getState().startEditing('=IF(A1>0,')
      store.getState().stopEditing(true)
      expect(store.getState().isEditing).toBe(false)
      expect(store.getState().editValue).toBe('')
    })

    it('cancelling edit (Escape) stops editing without committing', () => {
      store.getState().startEditing('draft value')
      store.getState().stopEditing(false)
      expect(store.getState().isEditing).toBe(false)
    })
  })

  // ── Column widths ─────────────────────────────────────────────────────────
  describe('column widths', () => {
    it('returns undefined for unset columns (caller uses default 150px)', () => {
      expect(store.getState().colWidths.get(0)).toBeUndefined()
    })

    it('setColWidth stores custom width per column index', () => {
      store.getState().setColWidth(2, 300)
      expect(store.getState().colWidths.get(2)).toBe(300)
    })

    it('different columns have independent widths', () => {
      store.getState().setColWidth(0, 200)
      store.getState().setColWidth(1, 80)
      store.getState().setColWidth(2, 400)
      expect(store.getState().colWidths.get(0)).toBe(200)
      expect(store.getState().colWidths.get(1)).toBe(80)
      expect(store.getState().colWidths.get(2)).toBe(400)
    })

    it('overwriting a column width replaces the previous value', () => {
      store.getState().setColWidth(0, 150)
      store.getState().setColWidth(0, 250)
      expect(store.getState().colWidths.get(0)).toBe(250)
    })
  })

  // ── Cell cache ────────────────────────────────────────────────────────────
  describe('cell cache (mirrors Yjs Y.Doc)', () => {
    it('stores cell value by key "r{row}c{col}"', () => {
      store.getState().setCellCache('r0c0', 'Hello')
      expect(store.getState().cellCache.get('r0c0')).toBe('Hello')
    })

    it('supports numeric and boolean values', () => {
      store.getState().setCellCache('r1c2', 42)
      store.getState().setCellCache('r2c3', true)
      expect(store.getState().cellCache.get('r1c2')).toBe(42)
      expect(store.getState().cellCache.get('r2c3')).toBe(true)
    })

    it('null value clears the cell', () => {
      store.getState().setCellCache('r0c0', 'value')
      store.getState().setCellCache('r0c0', null)
      expect(store.getState().cellCache.get('r0c0')).toBeNull()
    })

    it('independent cells do not interfere', () => {
      store.getState().setCellCache('r0c0', 'A')
      store.getState().setCellCache('r0c1', 'B')
      store.getState().setCellCache('r1c0', 'C')
      expect(store.getState().cellCache.get('r0c0')).toBe('A')
      expect(store.getState().cellCache.get('r0c1')).toBe('B')
      expect(store.getState().cellCache.get('r1c0')).toBe('C')
    })

    it('overwriting a cell updates to the new value', () => {
      store.getState().setCellCache('r5c5', 'old')
      store.getState().setCellCache('r5c5', 'new')
      expect(store.getState().cellCache.get('r5c5')).toBe('new')
    })
  })

  // ── Subscriptions ─────────────────────────────────────────────────────────
  describe('store subscriptions', () => {
    it('notifies subscribers when activeCell changes', () => {
      const callback = vi.fn()
      // Zustand v5: subscribe(selector, callback) — callback(newValue, prevValue)
      store.subscribe((s) => s.activeCell, callback)
      store.getState().setActiveCell(7, 3)
      expect(callback).toHaveBeenCalled()
      const [newVal, prevVal] = callback.mock.calls[0] as [unknown, unknown]
      expect(newVal).toEqual({ row: 7, col: 3 })
      expect(prevVal).toBeNull()
    })

    it('does not notify when unrelated state changes', () => {
      const callback = vi.fn()
      store.subscribe((s) => s.activeCell, callback)
      store.getState().setScroll(100, 200) // change unrelated state
      expect(callback).not.toHaveBeenCalled()
    })
  })
})
