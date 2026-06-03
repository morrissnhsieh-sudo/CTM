import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { CellValue, CellFormat } from '@ctm/shared-types'

export interface CellSelection {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface GridState {
  // Viewport
  scrollTop: number
  scrollLeft: number
  viewportWidth: number
  viewportHeight: number

  // Selection
  selection: CellSelection | null
  activeCell: { row: number; col: number } | null
  isEditing: boolean
  editValue: string

  // Layout
  rowHeights: Map<number, number>
  colWidths: Map<number, number>
  frozenRows: number
  frozenCols: number

  // Data (mirrors Yjs Y.Doc — source of truth is the CRDT)
  cellCache: Map<string, CellValue>      // "r{row}c{col}" → value
  formulaCache: Map<string, string>      // "r{row}c{col}" → formula
  formatCache: Map<string, Partial<CellFormat>>    // "r{row}c{col}" → format

  // Actions
  setScroll: (top: number, left: number) => void
  setViewport: (width: number, height: number) => void
  setSelection: (sel: CellSelection | null) => void
  setActiveCell: (row: number, col: number) => void
  startEditing: (initialValue?: string) => void
  stopEditing: (commit: boolean) => void
  setEditValue: (v: string) => void
  setColWidth: (col: number, width: number) => void
  setRowHeight: (row: number, height: number) => void
  setCellCache: (key: string, value: CellValue) => void
  setFormulaCache: (key: string, formula: string) => void
  setFormatCache: (key: string, format: Partial<CellFormat>) => void
  applyFormat: (format: Partial<CellFormat>) => void
  undo: () => void
  redo: () => void
  clearCellCache: () => void
}

const DEFAULT_ROW_HEIGHT = 32
const DEFAULT_COL_WIDTH = 150

export const useGridStore = create<GridState>()(
  subscribeWithSelector((set, get) => ({
    scrollTop: 0,
    scrollLeft: 0,
    viewportWidth: 0,
    viewportHeight: 0,

    selection: null,
    activeCell: null,
    isEditing: false,
    editValue: '',

    rowHeights: new Map(),
    colWidths: new Map(),
    frozenRows: 0,
    frozenCols: 0,

    cellCache: new Map(),
    formulaCache: new Map(),
    formatCache: new Map(),

    setScroll: (top, left) => set({ scrollTop: top, scrollLeft: left }),
    setViewport: (width, height) => set({ viewportWidth: width, viewportHeight: height }),
    setSelection: (sel) => set({ selection: sel }),
    setActiveCell: (row, col) => set({ activeCell: { row, col }, selection: { startRow: row, startCol: col, endRow: row, endCol: col } }),
    startEditing: (initialValue) => set((s) => ({ isEditing: true, editValue: initialValue ?? '' })),
    stopEditing: (commit) => set({ isEditing: false, editValue: '' }),
    setEditValue: (v) => set({ editValue: v }),
    setColWidth: (col, width) => set((s) => { const m = new Map(s.colWidths); m.set(col, width); return { colWidths: m } }),
    setRowHeight: (row, height) => set((s) => { const m = new Map(s.rowHeights); m.set(row, height); return { rowHeights: m } }),
    setCellCache: (key, value) => set((s) => { const m = new Map(s.cellCache); m.set(key, value); return { cellCache: m } }),
    setFormulaCache: (key, formula) => set((s) => { const m = new Map(s.formulaCache); m.set(key, formula); return { formulaCache: m } }),
    setFormatCache: (key, format) => set((s) => { const m = new Map(s.formatCache); m.set(key, format); return { formatCache: m } }),
    applyFormat: (format) => {
      const state = get()
      const selection = state.selection
      if (!selection) return
      const m = new Map(state.formatCache)
      const startRow = Math.min(selection.startRow, selection.endRow)
      const endRow = Math.max(selection.startRow, selection.endRow)
      const startCol = Math.min(selection.startCol, selection.endCol)
      const endCol = Math.max(selection.startCol, selection.endCol)

      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          const key = getCellKey(r, c)
          const existing = m.get(key) ?? {}
          m.set(key, { ...existing, ...format })
        }
      }
      set({ formatCache: m })
    },
    undo: () => {},
    redo: () => {},
    clearCellCache: () => set({ cellCache: new Map(), formulaCache: new Map(), formatCache: new Map() }),
  }))
)

// Selectors
export const getRowHeight = (state: GridState, row: number) =>
  state.rowHeights.get(row) ?? DEFAULT_ROW_HEIGHT

export const getColWidth = (state: GridState, col: number) =>
  state.colWidths.get(col) ?? DEFAULT_COL_WIDTH

export const getCellKey = (row: number, col: number) => `r${row}c${col}`
