import {
  HyperFormula,
  type DetailedCellError,
  type ExportedCellChange,
  ConfigValueType,
} from 'hyperformula'
import { Mutex } from 'async-mutex'
import { Decimal } from 'decimal.js'
import type { CellDiff, CellValue } from '@ctm/shared-types'
import type { AiFormulaEvalRequest } from '@ctm/shared-types'

// Per-sheet HyperFormula instance + mutex
interface SheetInstance {
  hf: HyperFormula
  mutex: Mutex
  lastAccess: number
}

const AI_FUNCTION_NAMES = ['AI.QUERY', 'AI.SUMMARIZE', 'AI.CLASSIFY', 'AI.EXTRACT']
const LOADING_SENTINEL = '#LOADING...'
const AI_FUNCTIONS_LOADING = Object.fromEntries(
  AI_FUNCTION_NAMES.map(name => [name, () => LOADING_SENTINEL]),
)

// Custom CTM formula plugins
const CTMPlugin = {
  implementedFunctions: {
    ...AI_FUNCTIONS_LOADING,
    'TIMETRACKED': { method: 'timetracked', parameters: [{ argumentType: ConfigValueType.STRING }] },
    'APPROVAL_STATUS': { method: 'approvalStatus', parameters: [{ argumentType: ConfigValueType.STRING }] },
    'LINKED_VALUE': { method: 'linkedValue', parameters: [
      { argumentType: ConfigValueType.STRING },
      { argumentType: ConfigValueType.STRING },
      { argumentType: ConfigValueType.STRING },
    ]},
  },
  timetracked: () => 0,
  approvalStatus: () => 'UNKNOWN',
  linkedValue: () => null,
}
for (const fn of AI_FUNCTION_NAMES) {
  ;(CTMPlugin as Record<string, unknown>)[fn.replace('.', '_').toLowerCase()] = () => LOADING_SENTINEL
}

export type FormulaEngineCallbacks = {
  onAiFormulaRequested: (req: AiFormulaEvalRequest) => Promise<void>
  getSheetCells: (sheetId: string) => Promise<Array<{ rowIdx: number; colIdx: number; value: string | null; formula: string | null }>>
}

export class FormulaEngine {
  private instances = new Map<string, SheetInstance>()
  private readonly TTL_MS = 5 * 60 * 1000   // evict after 5 min idle
  private cleanupTimer: ReturnType<typeof setInterval>

  constructor(private callbacks: FormulaEngineCallbacks) {
    // Evict idle instances every minute
    this.cleanupTimer = setInterval(() => this.evictIdle(), 60_000)
  }

  destroy() {
    clearInterval(this.cleanupTimer)
    for (const { hf } of this.instances.values()) hf.destroy()
    this.instances.clear()
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Main entry point: set a cell value and return all changed cells.
   * Called synchronously on every REST cell write.
   */
  async setCellContents(
    sheetId: string,
    rowId: string,
    colId: string,
    rawValue: string,
  ): Promise<CellDiff[]> {
    const instance = await this.getOrLoad(sheetId)
    const release = await instance.mutex.acquire()

    try {
      const { hf } = instance
      const sheetIndex = this.getSheetIndex(hf)
      const [rowIdx, colIdx] = this.parseRef(rowId, colId, hf, sheetId)

      const isFormula = rawValue.startsWith('=')
      const isAiFormula = isFormula && AI_FUNCTION_NAMES.some(fn =>
        rawValue.toUpperCase().includes(fn),
      )

      hf.suspendEvaluation()

      const cellContent = isFormula
        ? { formula: rawValue }
        : this.parseLiteralValue(rawValue)

      hf.setCellContents({ sheet: sheetIndex, row: rowIdx, col: colIdx }, [[cellContent]])

      const changes = hf.resumeEvaluation()

      instance.lastAccess = Date.now()

      const diffs = this.changesToDiff(changes, hf, sheetIndex)

      // If AI formula: enqueue async resolution
      if (isAiFormula) {
        void this.callbacks.onAiFormulaRequested({
          formula: rawValue,
          cellRef: `r${rowId}c${colId}`,
          contextRange: null,
          sheetId,
          workspaceId: '',
          userId: '',
        })
      }

      return diffs
    } finally {
      release()
    }
  }

  /**
   * Receive AI formula result callback and update the cell.
   */
  async setAiResult(sheetId: string, rowId: string, colId: string, result: string): Promise<CellDiff[]> {
    return this.setCellContents(sheetId, rowId, colId, result)
  }

  /**
   * Validate a formula string without applying it.
   */
  async validateFormula(formula: string): Promise<{ valid: boolean; error?: string }> {
    try {
      // Use a fresh, ephemeral HF instance for validation
      const hf = HyperFormula.buildEmpty({
        licenseKey: 'gpl-v3',
        functionPlugins: [CTMPlugin],
      })
      hf.addSheet('validation')
      hf.setCellContents({ sheet: 0, row: 0, col: 0 }, [[{ formula }]])
      const result = hf.getCellValue({ sheet: 0, row: 0, col: 0 })
      hf.destroy()

      if (typeof result === 'object' && result !== null && 'type' in result) {
        const err = result as DetailedCellError
        return { valid: false, error: err.type }
      }

      return { valid: true }
    } catch (e) {
      return { valid: false, error: String(e) }
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async getOrLoad(sheetId: string): Promise<SheetInstance> {
    if (this.instances.has(sheetId)) {
      return this.instances.get(sheetId)!
    }

    // Cold-load: fetch all cells from PostgreSQL
    const cellData = await this.callbacks.getSheetCells(sheetId)

    const hf = HyperFormula.buildEmpty({
      licenseKey: 'gpl-v3',
      functionPlugins: [CTMPlugin],
      currencySymbol: ['$', '€', '£', '¥'],
      decimalSeparator: '.',
    })

    const sheetIndex = hf.addSheet(sheetId)

    if (cellData.length > 0) {
      hf.suspendEvaluation()
      for (const cell of cellData) {
        const content = cell.formula
          ? { formula: cell.formula }
          : this.parseLiteralValue(cell.value ?? '')
        hf.setCellContents(
          { sheet: sheetIndex, row: cell.rowIdx, col: cell.colIdx },
          [[content]],
        )
      }
      hf.resumeEvaluation()
    }

    const instance: SheetInstance = {
      hf,
      mutex: new Mutex(),
      lastAccess: Date.now(),
    }

    this.instances.set(sheetId, instance)
    return instance
  }

  private getSheetIndex(hf: HyperFormula): number {
    const sheets = hf.getSheetNames()
    return sheets.length > 0 ? 0 : hf.addSheet('sheet')
  }

  /** Maps rowId/colId to 0-indexed integer coordinates using a stable hash map */
  private rowMap = new Map<string, Map<string, [number, number]>>()

  private parseRef(rowId: string, colId: string, hf: HyperFormula, sheetId: string): [number, number] {
    const key = `${rowId}::${colId}`
    if (!this.rowMap.has(sheetId)) this.rowMap.set(sheetId, new Map())
    const map = this.rowMap.get(sheetId)!

    if (!map.has(key)) {
      const idx = map.size
      const row = Math.floor(idx / 1000)
      const col = idx % 1000
      map.set(key, [row, col])
    }

    return map.get(key)!
  }

  private parseLiteralValue(raw: string): { cellValue: CellValue } {
    if (raw === '' || raw === null) return { cellValue: null }
    if (raw === 'TRUE' || raw === 'true') return { cellValue: true }
    if (raw === 'FALSE' || raw === 'false') return { cellValue: false }

    const num = Number(raw)
    if (!isNaN(num) && raw.trim() !== '') {
      // Use decimal.js for currency-like values with many decimal places
      return { cellValue: num }
    }

    return { cellValue: raw }
  }

  private changesToDiff(
    changes: readonly ExportedCellChange[],
    hf: HyperFormula,
    sheetIndex: number,
  ): CellDiff[] {
    return changes
      .filter(c => c.sheet === sheetIndex)
      .map(c => ({
        cellRef: `r${c.row}c${c.col}`,
        oldValue: null,
        newValue: typeof c.newValue === 'object' && c.newValue !== null && 'type' in c.newValue
          ? (c.newValue as DetailedCellError).value as CellValue
          : c.newValue as CellValue,
        formula: null,
        errorValue: typeof c.newValue === 'object' && c.newValue !== null && 'type' in c.newValue
          ? (c.newValue as DetailedCellError).type
          : null,
      }))
  }

  private evictIdle() {
    const now = Date.now()
    for (const [id, instance] of this.instances) {
      if (now - instance.lastAccess > this.TTL_MS) {
        instance.hf.destroy()
        this.instances.delete(id)
        this.rowMap.delete(id)
      }
    }
  }
}
