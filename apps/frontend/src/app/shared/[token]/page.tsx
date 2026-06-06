import { api } from '@/lib/api'
import { notFound } from 'next/navigation'
import { Shield, Eye, FileSpreadsheet } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Column {
  id: string
  name: string
  type: string
  position: number
}

interface Row {
  id: string
  position: number
}

interface Cell {
  rowId: string
  colId: string
  value: string | null
}

interface ConditionalFormatRule {
  id: string
  colId: string
  condition: string
  value: string
  style: {
    color?: string
    bgColor?: string
    bold?: boolean
    italic?: boolean
    strikethrough?: boolean
  }
  applyToRow?: boolean
}

function evaluateRule(cellValue: string, condition: string, ruleVal: string): boolean {
  const val = (cellValue ?? '').trim().toLowerCase()
  const rVal = (ruleVal ?? '').trim().toLowerCase()

  switch (condition) {
    case 'equals':
      return val === rVal
    case 'not_equals':
      return val !== rVal
    case 'contains':
      return val.includes(rVal)
    case 'not_contains':
      return !val.includes(rVal)
    case 'gt':
      return Number(val) > Number(rVal)
    case 'gte':
      return Number(val) >= Number(rVal)
    case 'lt':
      return Number(val) < Number(rVal)
    case 'lte':
      return Number(val) <= Number(rVal)
    case 'is_empty':
      return val === ''
    case 'is_not_empty':
      return val !== ''
    case 'is_checked':
      return val === 'true' || val === 'checked'
    case 'is_not_checked':
      return val !== 'true' && val !== 'checked'
    default:
      return false
  }
}

export default async function SharedSheetPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  let data: { sheet: any; columns: Column[]; rows: Row[]; cells: Cell[] }
  try {
    const res = await api.sheets.getShared(token)
    data = res.data
  } catch (err) {
    console.error('[SharedSheetPage] Failed to fetch shared sheet:', err)
    notFound()
  }

  const { sheet, columns, rows, cells } = data

  // Sort columns by position
  const sortedColumns = [...columns].sort((a, b) => a.position - b.position)
  // Sort rows by position
  const sortedRows = [...rows].sort((a, b) => a.position - b.position)

  // Map cells for quick lookup: rowId -> colId -> Cell
  const cellMap: Record<string, Record<string, Cell>> = {}
  cells.forEach((cell) => {
    if (!cellMap[cell.rowId]) cellMap[cell.rowId] = {}
    cellMap[cell.rowId][cell.colId] = cell
  })

  // Extract conditional formatting rules from sheet settings
  const rules: ConditionalFormatRule[] = sheet.settings?.conditionalFormatRules ?? []

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-slate-100 flex flex-col">
      {/* Top Glassmorphic Navigation Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <FileSpreadsheet size={22} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-blue-200 to-indigo-300 bg-clip-text text-transparent">
              {sheet.title}
            </h1>
            <p className="text-xs text-slate-400">
              {sheet.description || 'Public shared spreadsheet'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/60 border border-slate-700/60 text-xs font-semibold text-slate-300">
          <Shield size={14} className="text-emerald-400" />
          <span>Read-Only View</span>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {/* Table Container */}
        <div className="border border-slate-800 bg-slate-950/40 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-900/80 text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3.5 border-r border-slate-850 w-12 text-center">#</th>
                  {sortedColumns.map((col) => (
                    <th key={col.id} className="px-6 py-3.5 border-r border-slate-850 font-semibold min-w-[150px]">
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sortedRows.map((row, rowIdx) => {
                  // Precompute row-level style overrides based on conditional formatting rules
                  let rowStyle: any = {}
                  rules.forEach((rule) => {
                    if (rule.applyToRow) {
                      const triggerCell = cellMap[row.id]?.[rule.colId]
                      if (triggerCell && triggerCell.value !== null) {
                        const isMatch = evaluateRule(triggerCell.value, rule.condition, rule.value)
                        if (isMatch) {
                          rowStyle = { ...rowStyle, ...rule.style }
                        }
                      }
                    }
                  })

                  const rowClass = [
                    rowStyle.bold ? 'font-bold' : '',
                    rowStyle.italic ? 'italic' : '',
                    rowStyle.strikethrough ? 'line-through opacity-60' : '',
                  ].join(' ')

                  return (
                    <tr 
                      key={row.id} 
                      className={`hover:bg-slate-800/30 transition-colors ${rowClass}`}
                      style={{
                        backgroundColor: rowStyle.bgColor || undefined,
                        color: rowStyle.color || undefined,
                      }}
                    >
                      <td className="px-4 py-3.5 border-r border-slate-850 text-center text-xs text-slate-500 font-mono">
                        {rowIdx + 1}
                      </td>
                      {sortedColumns.map((col) => {
                        const cell = cellMap[row.id]?.[col.id]
                        const value = cell?.value ?? ''

                        // Precompute cell-level style overrides
                        let cellStyle: any = {}
                        rules.forEach((rule) => {
                          if (!rule.applyToRow && rule.colId === col.id) {
                            if (value !== null) {
                              const isMatch = evaluateRule(value, rule.condition, rule.value)
                              if (isMatch) {
                                cellStyle = { ...cellStyle, ...rule.style }
                              }
                            }
                          }
                        })

                        const cellClass = [
                          cellStyle.bold ? 'font-bold' : '',
                          cellStyle.italic ? 'italic' : '',
                          cellStyle.strikethrough ? 'line-through opacity-60' : '',
                        ].join(' ')

                        return (
                          <td 
                            key={col.id} 
                            className={`px-6 py-3.5 border-r border-slate-850/40 text-slate-300 ${cellClass}`}
                            style={{
                              backgroundColor: cellStyle.bgColor || undefined,
                              color: cellStyle.color || undefined,
                            }}
                          >
                            {col.type === 'checkbox' ? (
                              <input 
                                type="checkbox" 
                                checked={value === 'true' || value === 'checked'} 
                                disabled 
                                className="rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-not-allowed"
                              />
                            ) : (
                              value
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}

                {sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={sortedColumns.length + 1} className="px-6 py-12 text-center text-slate-500">
                      This sheet has no visible rows.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="py-6 border-t border-slate-800/80 bg-slate-950/20 text-center text-xs text-slate-500">
        <div className="flex items-center justify-center gap-1.5">
          <Eye size={12} />
          <span>Shared securely via CTM Platform</span>
        </div>
      </footer>
    </div>
  )
}
