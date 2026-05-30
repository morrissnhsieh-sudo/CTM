import type { Cell } from './cell.js'

export interface Row {
  id: string
  sheetId: string
  position: number
  createdBy: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  cells?: Record<string, Cell>  // keyed by colId
}

export interface RowInsertRequest {
  sheetId: string
  position?: number  // if undefined, append to end
  cells?: Record<string, import('./cell.js').CellValue>
}
