'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import * as Y from 'yjs'
import { useGridStore, getColWidth, getRowHeight, getCellKey } from '../../store/gridStore'
import { useUserStore, presenceColor } from '../../store/userStore'
import { useCollabProvider } from '../../hooks/useCollabProvider'
import { CellEditor } from './CellEditor'
import { useUIStore } from '../../store/uiStore'
import { SpecialViews } from './SpecialViews'
import { GridSkeleton } from './GridSkeleton'
import { api } from '../../lib/api'

// ─── Conditional formatting types ────────────────────────────
interface CondFormatRule {
  id: string
  colId: string
  condition: string
  value: string
  style: {
    bgColor?: string
    fontColor?: string
    bold?: boolean
    italic?: boolean
    strikethrough?: boolean
  }
  applyToRow?: boolean
}

function evalCondition(condition: string, cellVal: string, ruleVal: string): boolean {
  const v = cellVal ?? ''
  const r = ruleVal ?? ''
  switch (condition) {
    case 'equals':       return v.toLowerCase() === r.toLowerCase()
    case 'not_equals':   return v.toLowerCase() !== r.toLowerCase()
    case 'contains':     return v.toLowerCase().includes(r.toLowerCase())
    case 'not_contains': return !v.toLowerCase().includes(r.toLowerCase())
    case 'gt':           return Number(v) > Number(r)
    case 'gte':          return Number(v) >= Number(r)
    case 'lt':           return Number(v) < Number(r)
    case 'lte':          return Number(v) <= Number(r)
    case 'is_empty':     return v.trim() === ''
    case 'is_not_empty': return v.trim() !== ''
    case 'is_checked':   return v === 'true' || v === '1'
    case 'is_not_checked': return v !== 'true' && v !== '1'
    default:             return false
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────
const HEADER_HEIGHT = 32
const ROW_NUM_WIDTH = 48
const DEFAULT_ROW_HEIGHT = 32
const DEFAULT_COL_WIDTH = 150
const FONT = '13px Inter, system-ui, sans-serif'
const FONT_BOLD = 'bold 12px Inter, system-ui, sans-serif'

interface Column {
  id: string
  name: string
  type: string
  position: number
  width: number
}

interface GridCanvasProps {
  sheetId: string
  columns?: Column[]
  rowCount?: number
}

export function GridCanvas({ sheetId, columns = [], rowCount = 1000 }: GridCanvasProps) {
  console.log("GRID CANVAS COLUMNS:", columns)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const dirtyRef = useRef(true)

  const store = useGridStore()
  const { collaborators, userId, accessToken, workspaceId } = useUserStore()
  const { doc, provider } = useCollabProvider(sheetId)
  const { viewMode, highlightChangesEnabled, highlightChangesTimeframe } = useUIStore()

  // Conditional formatting rules (loaded from sheet settings)
  const condRulesRef = useRef<CondFormatRule[]>([])
  useEffect(() => {
    if (!accessToken || !workspaceId) return
    api.sheets.get(sheetId, { accessToken, workspaceId })
      .then(res => {
        const rules = (res.data as any)?.settings?.conditionalFormatRules
        if (Array.isArray(rules)) {
          condRulesRef.current = rules
          dirtyRef.current = true
        }
      })
      .catch(() => {})
  }, [sheetId, accessToken, workspaceId])

  // Sync columns with store
  useEffect(() => {
    useGridStore.getState().setColumns(columns)
    useGridStore.getState().updateVisibleRows(rowCount)
  }, [columns, rowCount])

  const canvasElementRef = useRef<HTMLCanvasElement | null>(null)
  const canvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasElementRef.current = canvas
    if (canvas) {
      const container = containerRef.current
      if (container) {
        const { width, height } = container.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        const newWidth = Math.round(width)
        const newHeight = Math.round(height)
        canvas.width = newWidth * dpr
        canvas.height = newHeight * dpr
        canvas.style.width = `${newWidth}px`
        canvas.style.height = `${newHeight}px`
        dirtyRef.current = true
      }
    }
  }, [])

  // ─── Derived layout ─────────────────────────────────────────
  const getX = useCallback((col: number): number => {
    let x = ROW_NUM_WIDTH - store.scrollLeft
    for (let c = 0; c < col; c++) {
      x += store.colWidths.get(c) ?? DEFAULT_COL_WIDTH
    }
    return x
  }, [store.scrollLeft, store.colWidths])

  const getY = useCallback((row: number): number => {
    let y = HEADER_HEIGHT - store.scrollTop
    for (let r = 0; r < row; r++) {
      y += store.rowHeights.get(r) ?? DEFAULT_ROW_HEIGHT
    }
    return y
  }, [store.scrollTop, store.rowHeights])

  // ─── Paint ───────────────────────────────────────────────────
  const paint = useCallback(() => {
    const canvas = canvasElementRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const W = canvas.width / dpr
    const H = canvas.height / dpr

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)

    const isDark = document.documentElement.classList.contains('dark')
    const colors = {
      bg:           isDark ? '#1a1b1e' : '#ffffff',
      headerBg:     isDark ? '#25262b' : '#f8f9fa',
      gridLine:     isDark ? '#2c2e33' : '#e9ecef',
      headerText:   isDark ? '#ced4da' : '#495057',
      cellText:     isDark ? '#c9d1d9' : '#212529',
      selection:    isDark ? 'rgba(59,130,246,0.25)' : 'rgba(59,130,246,0.15)',
      selBorder:    '#3b82f6',
      frozenShadow: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.08)',
      rowNumBg:     isDark ? '#1f2023' : '#f1f3f5',
    }

    let lastLoginMs = Date.now() - 60 * 60 * 1000 // default 1 hour ago
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('ctm_last_login')
      if (stored) {
        lastLoginMs = new Date(stored).getTime()
      } else {
        localStorage.setItem('ctm_last_login', new Date().toISOString())
      }
    }

    // Background
    ctx.fillStyle = colors.bg
    ctx.fillRect(0, 0, W, H)

    // ── Visible range ────────────────────────────────────────
    const totalVisibleRows = store.visibleRows.length || rowCount
    const firstVisibleRow = Math.max(0, Math.floor(store.scrollTop / DEFAULT_ROW_HEIGHT))
    const lastVisibleRow = Math.min(totalVisibleRows - 1, firstVisibleRow + Math.ceil(H / DEFAULT_ROW_HEIGHT) + 2)
    const firstVisibleCol = Math.max(0, Math.floor(store.scrollLeft / DEFAULT_COL_WIDTH))
    const lastVisibleCol = Math.min(columns.length - 1, firstVisibleCol + Math.ceil(W / DEFAULT_COL_WIDTH) + 2)

    // ── Grid lines ───────────────────────────────────────────
    ctx.strokeStyle = colors.gridLine
    ctx.lineWidth = 0.5
    ctx.beginPath()

    // Horizontal lines
    for (let row = firstVisibleRow; row <= lastVisibleRow + 1; row++) {
      const y = getY(row)
      if (y > H) break
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
    }

    // Vertical lines
    for (let col = firstVisibleCol; col <= lastVisibleCol + 1; col++) {
      const x = getX(col)
      if (x > W) break
      ctx.moveTo(x, HEADER_HEIGHT)
      ctx.lineTo(x, H)
    }

    ctx.stroke()

    // ── Row numbers ──────────────────────────────────────────
    ctx.fillStyle = colors.rowNumBg
    ctx.fillRect(0, HEADER_HEIGHT, ROW_NUM_WIDTH, H - HEADER_HEIGHT)
    ctx.strokeStyle = colors.gridLine
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(ROW_NUM_WIDTH, HEADER_HEIGHT)
    ctx.lineTo(ROW_NUM_WIDTH, H)
    ctx.stroke()

    ctx.font = FONT
    ctx.fillStyle = colors.headerText
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'

    for (let row = firstVisibleRow; row <= lastVisibleRow; row++) {
      const y = getY(row)
      const h = store.rowHeights.get(row) ?? DEFAULT_ROW_HEIGHT
      if (y + h < HEADER_HEIGHT) continue
      ctx.fillText(String(row + 1), ROW_NUM_WIDTH - 6, y + h / 2)
    }

    // ── Column headers ───────────────────────────────────────
    ctx.fillStyle = colors.headerBg
    ctx.fillRect(0, 0, W, HEADER_HEIGHT)

    // Corner cell
    ctx.fillStyle = colors.rowNumBg
    ctx.fillRect(0, 0, ROW_NUM_WIDTH, HEADER_HEIGHT)

    ctx.font = FONT_BOLD
    ctx.fillStyle = colors.headerText
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (let col = firstVisibleCol; col <= lastVisibleCol; col++) {
      if (col >= columns.length) break
      const x = getX(col)
      const w = store.colWidths.get(col) ?? DEFAULT_COL_WIDTH
      if (x + w < ROW_NUM_WIDTH) continue

      const colName = columns[col]?.name ?? String.fromCharCode(65 + col)
      ctx.fillText(colName, x + w / 2, HEADER_HEIGHT / 2, w - 8)
    }

    // Header bottom border
    ctx.strokeStyle = colors.gridLine
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, HEADER_HEIGHT)
    ctx.lineTo(W, HEADER_HEIGHT)
    ctx.stroke()

    // ── Cell values ──────────────────────────────────────────
    ctx.font = FONT
    ctx.fillStyle = colors.cellText
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'

    // Clip to content area
    ctx.save()
    ctx.beginPath()
    ctx.rect(ROW_NUM_WIDTH, HEADER_HEIGHT, W - ROW_NUM_WIDTH, H - HEADER_HEIGHT)
    ctx.clip()

    for (let row = firstVisibleRow; row <= lastVisibleRow; row++) {
      const y = getY(row)
      const rowH = store.rowHeights.get(row) ?? DEFAULT_ROW_HEIGHT
      if (y + rowH < HEADER_HEIGHT) continue

      const absRow = store.visibleRows[row] ?? row

      // ── Conditional formatting: evaluate rules for this row ──
      const condRules = condRulesRef.current
      let condBgColor: string | null = null
      let condFontColor: string | null = null
      let condBold = false
      let condItalic = false
      let condStrikethrough = false

      if (condRules.length > 0) {
        for (const rule of condRules) {
          const colIdx = columns.findIndex((c: any) => c.id === rule.colId)
          if (colIdx < 0) continue
          const cellVal = String(store.cellCache.get(getCellKey(absRow, colIdx)) ?? '')
          if (evalCondition(rule.condition, cellVal, rule.value)) {
            if (rule.style.bgColor)     condBgColor      = rule.style.bgColor
            if (rule.style.fontColor)   condFontColor    = rule.style.fontColor
            if (rule.style.bold)        condBold         = true
            if (rule.style.italic)      condItalic       = true
            if (rule.style.strikethrough) condStrikethrough = true
          }
        }
        // Paint row background if any rule matched
        if (condBgColor) {
          ctx.save()
          ctx.fillStyle = condBgColor
          ctx.fillRect(ROW_NUM_WIDTH, y, W - ROW_NUM_WIDTH, rowH)
          ctx.restore()
        }
      }

      for (let col = firstVisibleCol; col <= lastVisibleCol; col++) {
        if (col >= columns.length) break
        const x = getX(col)
        const colW = store.colWidths.get(col) ?? DEFAULT_COL_WIDTH

        const key = getCellKey(absRow, col)
        const val = store.cellCache.get(key)
        const format = store.formatCache.get(key)

        let highlightThisCell = false
        if (highlightChangesEnabled) {
          const updatedAtStr = store.cellUpdateCache.get(key)
          if (updatedAtStr) {
            const cellTime = new Date(updatedAtStr).getTime()
            const diffMs = Date.now() - cellTime
            if (highlightChangesTimeframe === 'today' && diffMs <= 24 * 60 * 60 * 1000) {
              highlightThisCell = true
            } else if (highlightChangesTimeframe === '3days' && diffMs <= 3 * 24 * 60 * 60 * 1000) {
              highlightThisCell = true
            } else if (highlightChangesTimeframe === '7days' && diffMs <= 7 * 24 * 60 * 60 * 1000) {
              highlightThisCell = true
            } else if (highlightChangesTimeframe === 'last_login' && cellTime >= lastLoginMs) {
              highlightThisCell = true
            }
          }
        }

        if (highlightThisCell) {
          ctx.save()
          ctx.fillStyle = isDark ? 'rgba(245, 158, 11, 0.12)' : 'rgba(251, 191, 36, 0.2)'
          ctx.fillRect(x + 0.5, y + 0.5, colW - 1, rowH - 1)
          ctx.strokeStyle = isDark ? 'rgba(245, 158, 11, 0.4)' : 'rgba(251, 191, 36, 0.5)'
          ctx.lineWidth = 1
          ctx.strokeRect(x + 0.5, y + 0.5, colW - 1, rowH - 1)
          ctx.restore()
        }

        if (val != null && val !== '') {
          // Truncate text to cell width
          const text = String(val)

          // Font color: cell format > conditional rule > default
          ctx.fillStyle = (format as any)?.fontColor ?? condFontColor ?? colors.cellText

          // Bold/italic: cell format OR conditional rule
          const isBold   = format?.bold   || condBold
          const isItalic = format?.italic || condItalic
          let fontStr = FONT
          if (isBold && isItalic) {
            fontStr = 'bold italic 13px Inter, system-ui, sans-serif'
          } else if (isBold) {
            fontStr = 'bold 13px Inter, system-ui, sans-serif'
          } else if (isItalic) {
            fontStr = 'italic 13px Inter, system-ui, sans-serif'
          }
          ctx.font = fontStr

          // Apply alignment
          const align = format?.textAlign || 'left'
          ctx.textAlign = align

          let textX = x + 6
          if (align === 'center') {
            textX = x + colW / 2
          } else if (align === 'right') {
            textX = x + colW - 6
          }

          if (col === 0) {
            const meta = store.rowMetadata.get(`r${absRow}`)
            const indent = meta?.indent ?? 0
            textX += indent * 16
            
            // Draw collapse/expand toggle if row has children
            const hasChildren = Array.from(store.rowMetadata.values()).some(m => m.parentId === `r${absRow}`)
            if (hasChildren) {
              const expanded = meta?.expanded ?? true
              ctx.font = '10px Inter, sans-serif'
              ctx.fillStyle = colors.headerText
              ctx.fillText(expanded ? '▼' : '▶', textX - 10, y + rowH / 2)
            }
          }

          ctx.font = fontStr
          const maxTextWidth = colW - 12 - (col === 0 ? (store.rowMetadata.get(`r${absRow}`)?.indent ?? 0) * 16 : 0)
          ctx.fillText(text, textX, y + rowH / 2, maxTextWidth)

          // Strikethrough — from conditional rule or cell format
          if (condStrikethrough || (format as any)?.strikethrough) {
            const measured = Math.min(ctx.measureText(text).width, maxTextWidth)
            const strikeX = align === 'center' ? textX - measured / 2
              : align === 'right' ? textX - measured
              : textX
            ctx.save()
            ctx.strokeStyle = ctx.fillStyle
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(strikeX, y + rowH / 2)
            ctx.lineTo(strikeX + measured, y + rowH / 2)
            ctx.stroke()
            ctx.restore()
          }
        }
      }
    }

    // Restore context font and alignment settings
    ctx.font = FONT
    ctx.textAlign = 'left'
    ctx.restore()

    // ── Selection overlay ────────────────────────────────────
    if (store.selection) {
      const { startRow, startCol, endRow, endCol } = store.selection
      const visualStartRow = store.visibleRows.indexOf(startRow)
      const visualEndRow = store.visibleRows.indexOf(endRow)

      if (visualStartRow !== -1 && visualEndRow !== -1) {
        const x1 = getX(Math.min(startCol, endCol))
        const y1 = getY(Math.min(visualStartRow, visualEndRow))
        const x2 = getX(Math.max(startCol, endCol) + 1)
        const y2 = getY(Math.max(visualStartRow, visualEndRow) + 1)

        ctx.fillStyle = colors.selection
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1)

        ctx.strokeStyle = colors.selBorder
        ctx.lineWidth = 2
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
      }
    }

    // ── Collaborator cursors ─────────────────────────────────
    for (const [uid, collab] of collaborators) {
      if (uid === userId || !collab.cursor) continue
      const { row: absRow, col } = collab.cursor
      const visualRow = store.visibleRows.indexOf(absRow)
      if (visualRow === -1) continue

      const x = getX(col)
      const y = getY(visualRow)
      const w = store.colWidths.get(col) ?? DEFAULT_COL_WIDTH
      const h = store.rowHeights.get(visualRow) ?? DEFAULT_ROW_HEIGHT
      const color = collab.color ?? presenceColor(uid)

      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, w, h)

      // Name label
      ctx.fillStyle = color
      ctx.font = '11px Inter, system-ui, sans-serif'
      ctx.fillText(collab.name?.slice(0, 8) ?? uid.slice(0, 6), x + 2, y - 2)
    }

    ctx.restore()
    dirtyRef.current = false
  }, [store, columns, rowCount, collaborators, userId, getX, getY, highlightChangesEnabled, highlightChangesTimeframe])

  // ─── RAF loop ────────────────────────────────────────────────
  useEffect(() => {
    const loop = () => {
      if (dirtyRef.current) paint()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [paint])

  // Mark dirty on store changes
  useEffect(() => {
    const unsub = useGridStore.subscribe(() => { dirtyRef.current = true })
    return unsub
  }, [])

  // ─── Resize observer ─────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const ro = new ResizeObserver(([entry]) => {
      const canvas = canvasElementRef.current
      if (!canvas || !entry) return
      const { width, height } = entry.contentRect
      const dpr = window.devicePixelRatio || 1
      const newWidth = Math.round(width)
      const newHeight = Math.round(height)
      canvas.width = newWidth * dpr
      canvas.height = newHeight * dpr
      canvas.style.width = `${newWidth}px`
      canvas.style.height = `${newHeight}px`
      dirtyRef.current = true
    })

    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // ─── Resize on viewMode change ──────────────────────────────

  const indentRow = useCallback((rowIdx: number) => {
    const key = `r${rowIdx}`
    const currentMeta = store.rowMetadata.get(key) || { parentId: null, expanded: true, indent: 0 }
    if (currentMeta.indent >= 5) return
    let parentId: string | null = null
    for (let r = rowIdx - 1; r >= 0; r--) {
      const prevMeta = store.rowMetadata.get(`r${r}`)
      const prevIndent = prevMeta?.indent ?? 0
      if (prevIndent === currentMeta.indent) {
        parentId = `r${r}`
        break
      } else if (prevIndent < currentMeta.indent) {
        break
      }
    }
    store.setRowMetadata(key, {
      ...currentMeta,
      indent: currentMeta.indent + 1,
      parentId
    })
  }, [store])

  const outdentRow = useCallback((rowIdx: number) => {
    const key = `r${rowIdx}`
    const currentMeta = store.rowMetadata.get(key) || { parentId: null, expanded: true, indent: 0 }
    if (currentMeta.indent <= 0) return
    let newParentId: string | null = null
    if (currentMeta.parentId) {
      const parentMeta = store.rowMetadata.get(currentMeta.parentId)
      newParentId = parentMeta?.parentId ?? null
    }
    store.setRowMetadata(key, {
      ...currentMeta,
      indent: currentMeta.indent - 1,
      parentId: newParentId
    })
  }, [store])

  // ─── Keyboard ────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { activeCell, isEditing } = store

    if (isEditing) {
      if (e.key === 'Escape') { store.stopEditing(false); e.preventDefault() }
      if (e.key === 'Enter') { store.stopEditing(true); e.preventDefault() }
      if (e.key === 'Tab')   { store.stopEditing(true); e.preventDefault() }
      return
    }

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      if (e.key.toLowerCase() === 'z') {
        store.undo()
        e.preventDefault()
        return
      }
      if (e.key.toLowerCase() === 'y') {
        store.redo()
        e.preventDefault()
        return
      }
    }

    if (!activeCell) return

    switch (e.key) {
      case 'ArrowUp': {
        const visualRow = store.visibleRows.indexOf(activeCell.row)
        const newVisualRow = Math.max(0, visualRow - 1)
        const newAbsRow = store.visibleRows[newVisualRow] ?? activeCell.row
        store.setActiveCell(newAbsRow, activeCell.col)
        e.preventDefault()
        break
      }
      case 'ArrowDown': {
        const visualRow = store.visibleRows.indexOf(activeCell.row)
        const newVisualRow = Math.min(store.visibleRows.length - 1, visualRow + 1)
        const newAbsRow = store.visibleRows[newVisualRow] ?? activeCell.row
        store.setActiveCell(newAbsRow, activeCell.col)
        e.preventDefault()
        break
      }
      case 'ArrowLeft':  store.setActiveCell(activeCell.row, Math.max(0, activeCell.col - 1)); e.preventDefault(); break
      case 'ArrowRight': store.setActiveCell(activeCell.row, activeCell.col + 1); e.preventDefault(); break
      case 'Enter': {
        const visualRow = store.visibleRows.indexOf(activeCell.row)
        const newVisualRow = Math.min(store.visibleRows.length - 1, visualRow + 1)
        const newAbsRow = store.visibleRows[newVisualRow] ?? activeCell.row
        store.setActiveCell(newAbsRow, activeCell.col)
        e.preventDefault()
        break
      }
      case 'Tab': {
        if (e.shiftKey) {
          outdentRow(activeCell.row)
        } else {
          indentRow(activeCell.row)
        }
        e.preventDefault()
        break
      }
      case 'F2':         store.startEditing(); e.preventDefault(); break
      case 'Delete':
      case 'Backspace': {
        const key = getCellKey(activeCell.row, activeCell.col)
        const timestamp = new Date().toISOString()
        if (doc) {
          const cellsMap = doc.getMap<Y.Map<unknown>>('cells')
          doc.transact(() => {
            let cellMap = cellsMap.get(key)
            if (!cellMap) {
              cellMap = new Y.Map()
              cellsMap.set(key, cellMap)
            }
            cellMap.set('value', null)
            cellMap.set('updatedAt', timestamp)
          })
        }
        store.setCellCache(key, null)
        store.setCellUpdateCache(key, timestamp)
        dirtyRef.current = true
        break
      }
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          store.startEditing(e.key)
          e.preventDefault()
        }
    }
  }, [store, doc, indentRow, outdentRow])

  // ─── Mouse ───────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasElementRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (y < HEADER_HEIGHT || x < ROW_NUM_WIDTH) return

    // Find clicked cell
    let col = 0, cx = ROW_NUM_WIDTH - store.scrollLeft
    while (col < columns.length) {
      const w = store.colWidths.get(col) ?? DEFAULT_COL_WIDTH
      if (cx + w > x) break
      cx += w; col++
    }

    const totalVisibleRows = store.visibleRows.length || rowCount
    let row = 0, ry = HEADER_HEIGHT - store.scrollTop
    while (row < totalVisibleRows) {
      const h = store.rowHeights.get(row) ?? DEFAULT_ROW_HEIGHT
      if (ry + h > y) break
      ry += h; row++
    }

    const absRow = store.visibleRows[row] ?? row

    if (col === 0) {
      const meta = store.rowMetadata.get(`r${absRow}`)
      const indent = meta?.indent ?? 0
      const arrowX = cx + 6 + indent * 16 - 10
      const hasChildren = Array.from(store.rowMetadata.values()).some(m => m.parentId === `r${absRow}`)
      if (hasChildren && Math.abs(x - arrowX) <= 12) {
        const expanded = meta?.expanded ?? true
        store.setRowMetadata(`r${absRow}`, { ...meta!, expanded: !expanded })
        dirtyRef.current = true
        return
      }
    }

    if (e.detail === 2) {
      // Double-click → edit
      store.setActiveCell(absRow, col)
      store.startEditing()
    } else {
      store.setActiveCell(absRow, col)
    }

    dirtyRef.current = true
  }, [store, columns.length, rowCount])

  // ─── Scroll ──────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    store.setScroll(
      Math.max(0, store.scrollTop + e.deltaY),
      Math.max(0, store.scrollLeft + e.deltaX),
    )
    dirtyRef.current = true
  }, [store])

  const isTransitioning = store.sheetId !== sheetId

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-background" tabIndex={0} onKeyDown={handleKeyDown}>
      {isTransitioning ? (
        <GridSkeleton />
      ) : viewMode === 'grid' ? (
        <>
          <canvas
            ref={canvasRef}
            className="grid-canvas absolute inset-0"
            onMouseDown={handleMouseDown}
            onWheel={handleWheel}
          />
          {store.isEditing && store.activeCell && (
            <CellEditor
              row={store.activeCell.row}
              col={store.activeCell.col}
              initialValue={store.editValue}
              x={getX(store.activeCell.col)}
              y={getY(store.visibleRows.indexOf(store.activeCell.row))}
              width={store.colWidths.get(store.activeCell.col) ?? DEFAULT_COL_WIDTH}
              height={store.rowHeights.get(store.visibleRows.indexOf(store.activeCell.row)) ?? DEFAULT_ROW_HEIGHT}
              onCommit={(value, reason) => {
                const key = getCellKey(store.activeCell!.row, store.activeCell!.col)
                const timestamp = new Date().toISOString()
                if (doc) {
                  const cellsMap = doc.getMap<Y.Map<unknown>>('cells')
                  doc.transact(() => {
                    let cellMap = cellsMap.get(key)
                    if (!cellMap) {
                      cellMap = new Y.Map()
                      cellsMap.set(key, cellMap)
                    }
                    cellMap.set('value', value)
                    cellMap.set('updatedAt', timestamp)
                  })
                }
                store.setCellCache(key, value)
                store.setCellUpdateCache(key, timestamp)
                store.stopEditing(true)
                dirtyRef.current = true
                if (reason === 'keyboard') {
                  containerRef.current?.focus()
                }
              }}
              onCancel={(reason) => {
                store.stopEditing(false)
                if (reason === 'keyboard') {
                  containerRef.current?.focus()
                }
              }}
            />
          )}
        </>
      ) : (
        <SpecialViews sheetId={sheetId} doc={doc} columns={columns} />
      )}
    </div>
  )
}
