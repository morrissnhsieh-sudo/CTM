import type { CellFormat } from './sheet.js'

export type CellValue = string | number | boolean | null

export interface Cell {
  rowId: string
  colId: string
  value: CellValue
  formula: string | null
  format: Partial<CellFormat>
  updatedBy: string
  updatedAt: Date
}

export interface CellRef {
  sheetId: string
  rowId: string
  colId: string
}

/** A1-style reference used in formulas */
export interface A1Ref {
  sheet?: string
  row: number   // 0-indexed
  col: number   // 0-indexed
  rowAbsolute?: boolean
  colAbsolute?: boolean
}

export interface CellDiff {
  cellRef: string   // "r{rowId}c{colId}"
  oldValue: CellValue
  newValue: CellValue
  formula: string | null
  errorValue: string | null
}
