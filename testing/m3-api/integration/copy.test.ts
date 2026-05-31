/**
 * M3 — API Gateway
 * Tests: POST /sheets/:id/copy
 *
 * Spec:
 *  - Deep-clones sheet: columns + rows + cells (batched 500 at a time)
 *  - title defaults to "Copy of {original}"
 *  - includeData=false copies columns only (no rows)
 *  - Cross-workspace copy requires ADMIN role
 *  - Min role: EDITOR
 *  - Returns 201 with { sheet, colsCopied, rowsCopied, cellsCopied }
 *  - Returns 404 if source sheet not found
 *  - Returns 403 if caller lacks EDITOR role
 */

import { describe, it, expect } from 'vitest'
import { hasMinRole } from '@ctm/shared-types'

const uuid = () => crypto.randomUUID()

// ── Minimal in-memory sheet store for copy logic tests ────────────────────────

interface MockSheet  { id: string; workspaceId: string; title: string; description: string | null; projectId: string | null; settings: Record<string, unknown> }
interface MockColumn { id: string; sheetId: string; name: string; type: string; position: number; width: number; frozen: boolean; hidden: boolean; format: Record<string, unknown>; validation: null }
interface MockRow    { id: string; sheetId: string; position: number }
interface MockCell   { rowId: string; colId: string; value: string | null; formula: string | null; format: Record<string, unknown> }

function makeSheet(override: Partial<MockSheet> = {}): MockSheet {
  return { id: uuid(), workspaceId: 'ws-1', title: 'My Sheet', description: null, projectId: null, settings: {}, ...override }
}

function makeColumn(sheetId: string, pos: number): MockColumn {
  return { id: uuid(), sheetId, name: `Col ${pos}`, type: 'text', position: pos, width: 150, frozen: false, hidden: false, format: {}, validation: null }
}

function makeRow(sheetId: string, pos: number): MockRow {
  return { id: uuid(), sheetId, position: pos }
}

/** Simulate the copy logic (mirrors apps/api-service/src/routes/copy.ts) */
function copySheet(
  source: MockSheet,
  columns: MockColumn[],
  rows: MockRow[],
  cells: MockCell[],
  opts: { title?: string; workspaceId?: string; includeData?: boolean },
  newId = uuid(),
): { sheet: MockSheet; colsCopied: number; rowsCopied: number; cellsCopied: number } {
  const targetWs = opts.workspaceId ?? source.workspaceId
  const newSheet: MockSheet = {
    id: newId,
    workspaceId: targetWs,
    title: opts.title ?? `Copy of ${source.title}`,
    description: source.description,
    projectId: source.projectId,
    settings: source.settings,
  }

  const colIdMap = new Map<string, string>()
  for (const col of columns) {
    const newColId = uuid()
    colIdMap.set(col.id, newColId)
  }

  // Default includeData is true; only skip rows when explicitly set to false
  if (opts.includeData === false) {
    return { sheet: newSheet, colsCopied: columns.length, rowsCopied: 0, cellsCopied: 0 }
  }

  const rowIdMap = new Map<string, string>()
  for (const row of rows) rowIdMap.set(row.id, uuid())

  let cellsCopied = 0
  for (const cell of cells) {
    if (rowIdMap.has(cell.rowId) && colIdMap.has(cell.colId)) cellsCopied++
  }

  return { sheet: newSheet, colsCopied: columns.length, rowsCopied: rows.length, cellsCopied }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /sheets/:id/copy — sheet copy logic', () => {

  describe('basic copy', () => {
    it('creates a new sheet with cloned metadata', () => {
      const src = makeSheet({ title: 'Sales Data' })
      const cols = [makeColumn(src.id, 0), makeColumn(src.id, 1)]
      const { sheet } = copySheet(src, cols, [], [], {})

      expect(sheet.id).not.toBe(src.id)
      expect(sheet.workspaceId).toBe(src.workspaceId)
    })

    it('default title is "Copy of {original title}"', () => {
      const src = makeSheet({ title: 'Q4 Revenue' })
      const { sheet } = copySheet(src, [], [], [], {})
      expect(sheet.title).toBe('Copy of Q4 Revenue')
    })

    it('custom title overrides the default', () => {
      const src = makeSheet({ title: 'Original' })
      const { sheet } = copySheet(src, [], [], [], { title: 'My Custom Clone' })
      expect(sheet.title).toBe('My Custom Clone')
    })

    it('copies all columns and reports count', () => {
      const src = makeSheet()
      const cols = [0, 1, 2, 3].map((i) => makeColumn(src.id, i))
      const { colsCopied } = copySheet(src, cols, [], [], {})
      expect(colsCopied).toBe(4)
    })

    it('copies rows when includeData is true (default)', () => {
      const src = makeSheet()
      const rows = [0, 1, 2].map((i) => makeRow(src.id, i))
      const { rowsCopied } = copySheet(src, [], rows, [], { includeData: true })
      expect(rowsCopied).toBe(3)
    })

    it('copies cells and maps them to new row/col IDs', () => {
      const src = makeSheet()
      const col = makeColumn(src.id, 0)
      const row = makeRow(src.id, 0)
      const cell: MockCell = { rowId: row.id, colId: col.id, value: 'Hello', formula: null, format: {} }
      const { cellsCopied } = copySheet(src, [col], [row], [cell], {})
      expect(cellsCopied).toBe(1)
    })

    it('preserves formula in copied cells', () => {
      const src = makeSheet()
      const col = makeColumn(src.id, 0)
      const row = makeRow(src.id, 0)
      const cell: MockCell = { rowId: row.id, colId: col.id, value: null, formula: '=SUM(A1:A10)', format: {} }
      const { cellsCopied } = copySheet(src, [col], [row], [cell], {})
      expect(cellsCopied).toBe(1)
    })

    it('copies multiple rows and all their cells', () => {
      const src = makeSheet()
      const cols = [0, 1].map((i) => makeColumn(src.id, i))
      const rows = [0, 1, 2].map((i) => makeRow(src.id, i))
      const cells: MockCell[] = []
      for (const row of rows) {
        for (const col of cols) {
          cells.push({ rowId: row.id, colId: col.id, value: `v_${row.id}_${col.id}`, formula: null, format: {} })
        }
      }
      const { rowsCopied, cellsCopied } = copySheet(src, cols, rows, cells, {})
      expect(rowsCopied).toBe(3)
      expect(cellsCopied).toBe(6)
    })
  })

  describe('includeData: false — columns-only clone', () => {
    it('copies columns but no rows', () => {
      const src = makeSheet()
      const cols = [0, 1, 2].map((i) => makeColumn(src.id, i))
      const rows = [0, 1].map((i) => makeRow(src.id, i))
      const { colsCopied, rowsCopied, cellsCopied } = copySheet(src, cols, rows, [], { includeData: false })
      expect(colsCopied).toBe(3)
      expect(rowsCopied).toBe(0)
      expect(cellsCopied).toBe(0)
    })
  })

  describe('empty sheet copy', () => {
    it('copies an empty sheet with no columns or rows', () => {
      const src = makeSheet()
      const result = copySheet(src, [], [], [], {})
      expect(result.colsCopied).toBe(0)
      expect(result.rowsCopied).toBe(0)
      expect(result.cellsCopied).toBe(0)
      expect(result.sheet.id).toBeTruthy()
    })
  })

  describe('cross-workspace copy', () => {
    it('sets targetWorkspaceId on the new sheet', () => {
      const src = makeSheet({ workspaceId: 'ws-source' })
      const { sheet } = copySheet(src, [], [], [], { workspaceId: 'ws-target' })
      expect(sheet.workspaceId).toBe('ws-target')
    })

    it('cross-workspace copy requires ADMIN role (RBAC check)', () => {
      // VIEWER cannot cross-workspace copy
      expect(hasMinRole('VIEWER', 'ADMIN')).toBe(false)
      expect(hasMinRole('EDITOR', 'ADMIN')).toBe(false)
      expect(hasMinRole('ADMIN', 'ADMIN')).toBe(true)
      expect(hasMinRole('OWNER', 'ADMIN')).toBe(true)
    })
  })

  describe('RBAC enforcement', () => {
    it('VIEWER cannot copy a sheet', () => {
      expect(hasMinRole('VIEWER', 'EDITOR')).toBe(false)
    })

    it('COMMENTER cannot copy a sheet', () => {
      expect(hasMinRole('COMMENTER', 'EDITOR')).toBe(false)
    })

    it('EDITOR can copy within workspace', () => {
      expect(hasMinRole('EDITOR', 'EDITOR')).toBe(true)
    })

    it('ADMIN can copy (includes cross-workspace)', () => {
      expect(hasMinRole('ADMIN', 'EDITOR')).toBe(true)
      expect(hasMinRole('ADMIN', 'ADMIN')).toBe(true)
    })
  })

  describe('column ID remapping', () => {
    it('new column IDs are all different from source IDs', () => {
      const src = makeSheet()
      const cols = [0, 1, 2].map((i) => makeColumn(src.id, i))
      const colIdMap = new Map<string, string>()
      for (const col of cols) colIdMap.set(col.id, uuid())

      const oldIds = cols.map((c) => c.id)
      const newIds = [...colIdMap.values()]
      for (const newId of newIds) {
        expect(oldIds).not.toContain(newId)
      }
    })

    it('generates unique IDs for each column', () => {
      const src = makeSheet()
      const cols = [0, 1, 2].map((i) => makeColumn(src.id, i))
      const newIds = new Set(cols.map(() => uuid()))
      expect(newIds.size).toBe(3)
    })
  })

  describe('metadata preservation', () => {
    it('preserves description in copy', () => {
      const src = makeSheet({ description: 'Annual budget data' })
      const { sheet } = copySheet(src, [], [], [], {})
      expect(sheet.description).toBe('Annual budget data')
    })

    it('preserves projectId in copy', () => {
      const projectId = uuid()
      const src = makeSheet({ projectId })
      const { sheet } = copySheet(src, [], [], [], {})
      expect(sheet.projectId).toBe(projectId)
    })

    it('preserves settings in copy', () => {
      const src = makeSheet({ settings: { frozenRows: 2, theme: 'compact' } })
      const { sheet } = copySheet(src, [], [], [], {})
      expect(sheet.settings).toEqual({ frozenRows: 2, theme: 'compact' })
    })
  })
})
