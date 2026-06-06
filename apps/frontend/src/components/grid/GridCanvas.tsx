'use client'

import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import * as Y from 'yjs'
import { useGridStore, getColWidth, getRowHeight, getCellKey } from '../../store/gridStore'
import { useUserStore, presenceColor } from '../../store/userStore'
import { useAuthStore } from '../../store/authStore'
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
  // 1. Hooks and Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null)
  const dirtyRef = useRef(true)
  const condRulesRef = useRef<CondFormatRule[]>([])

  const store = useGridStore()
  const isTransitioning = store.sheetId !== sheetId

  const { collaborators, userId } = useUserStore()
  const { accessToken: authToken, user } = useAuthStore()
  const { doc, provider } = useCollabProvider(sheetId)
  const { 
    viewMode, 
    highlightChangesEnabled, 
    highlightChangesTimeframe,
    toggleAttachmentsPanel,
    attachmentsPanelOpen
  } = useUIStore()

  const authWorkspaceId = user?.workspaceId ?? ''
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [rowAttachments, setRowAttachments] = useState<Map<string, any[]>>(new Map())
  const [sheetAttachments, setSheetAttachments] = useState<any[]>([])
  const [rowIdMap, setRowIdMap] = useState<string[]>([])

  // Fetch sheet attachments
  useEffect(() => {
    if (isTransitioning || !authToken || !authWorkspaceId) return
    api.attachments.list({ scope: 'sheet', sheetId }, { accessToken: authToken, workspaceId: authWorkspaceId })
      .then(res => {
        if (res && res.data && Array.isArray(res.data)) {
          setSheetAttachments(res.data)
          dirtyRef.current = true
        }
      })
      .catch(err => console.error("Failed to fetch sheet attachments:", err))
  }, [sheetId, isTransitioning, authToken, authWorkspaceId])

  // Fetch row IDs mapping
  useEffect(() => {
    if (isTransitioning || !authToken || !authWorkspaceId) return
    api.rows.list(sheetId, { accessToken: authToken, workspaceId: authWorkspaceId, pageSize: 1000 })
      .then(res => {
        if (res && (res as any).data) {
          const rows = (res as any).data as any[]
          setRowIdMap(rows.map(r => r.id))
        }
      })
      .catch(err => console.error("Failed to fetch row IDs:", err))
  }, [sheetId, isTransitioning, authToken, authWorkspaceId])

  // Fetch row attachments
  useEffect(() => {
    if (isTransitioning || !authToken || !authWorkspaceId) return
    api.attachments.list({ scope: 'row', sheetId }, { accessToken: authToken, workspaceId: authWorkspaceId })
      .then(res => {
        const m = new Map<string, any[]>()
        if (res && res.data && Array.isArray(res.data)) {
          res.data.forEach(a => {
            if (a.rowId) {
              const list = m.get(a.rowId) || []
              list.push(a)
              m.set(a.rowId, list)
            }
          })
        }
        setRowAttachments(m)
        dirtyRef.current = true
      })
      .catch(err => console.error("Failed to fetch attachments:", err))
  }, [sheetId, isTransitioning, authToken, authWorkspaceId])

  // 3. Derived layout helpers (useCallback/useMemo)
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

  const totalWidth = useMemo(() => {
    let w = ROW_NUM_WIDTH
    for (let i = 0; i < columns.length; i++) {
      w += store.colWidths.get(i) ?? DEFAULT_COL_WIDTH
    }
    return w
  }, [columns.length, store.colWidths])

  const totalHeight = useMemo(() => {
    let h = HEADER_HEIGHT
    const rowCountToShow = store.visibleRows.length > 0 ? store.visibleRows.length : rowCount
    for (let i = 0; i < rowCountToShow; i++) {
      h += store.rowHeights.get(i) ?? DEFAULT_ROW_HEIGHT
    }
    return h
  }, [store.visibleRows.length, store.rowHeights, rowCount])

  // 4. Component Actions
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

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget
    store.setScroll(scrollTop, scrollLeft)
    dirtyRef.current = true
  }, [store])

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

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasElementRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    let cursor = 'default'

    if (y < HEADER_HEIGHT && x < ROW_NUM_WIDTH) {
      if (sheetAttachments.length > 0) cursor = 'pointer'
    } else if (x < ROW_NUM_WIDTH && y >= HEADER_HEIGHT) {
      const row = Math.max(0, Math.floor((y - HEADER_HEIGHT + store.scrollTop) / DEFAULT_ROW_HEIGHT))
      const absRow = store.visibleRows[row] ?? row
      const rowId = rowIdMap[absRow]
      if (rowId && rowAttachments.has(rowId)) cursor = 'pointer'
    } else if (y >= HEADER_HEIGHT && x >= ROW_NUM_WIDTH) {
      let col = 0, cx = ROW_NUM_WIDTH - store.scrollLeft
      while (col < columns.length) {
        const w = store.colWidths.get(col) ?? DEFAULT_COL_WIDTH
        if (cx + w > x) break
        cx += w; col++
      }
      if (columns[col]?.type === 'attachment') {
        const totalVisibleRows = store.visibleRows.length || rowCount
        let row = 0, ry = HEADER_HEIGHT - store.scrollTop
        while (row < totalVisibleRows) {
          const h = store.rowHeights.get(row) ?? DEFAULT_ROW_HEIGHT
          if (ry + h > y) break
          ry += h; row++
        }
        const absRow = store.visibleRows[row] ?? row
        const val = store.cellCache.get(getCellKey(absRow, col))
        if (val != null && val !== '') cursor = 'pointer'
      }
    }

    if (canvas.style.cursor !== cursor) {
      canvas.style.cursor = cursor
    }
  }, [sheetAttachments.length, rowIdMap, rowAttachments, store, columns, rowCount])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasElementRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (y < HEADER_HEIGHT && x < ROW_NUM_WIDTH) {
      if (sheetAttachments.length > 0) {
        toggleAttachmentsPanel()
      }
      return
    }

    if (y < HEADER_HEIGHT || x < ROW_NUM_WIDTH) {
      if (x < ROW_NUM_WIDTH) {
        const row = Math.max(0, Math.floor((y - HEADER_HEIGHT + store.scrollTop) / DEFAULT_ROW_HEIGHT))
        const absRow = store.visibleRows[row] ?? row
        const rowId = rowIdMap[absRow]
        if (rowId && rowAttachments.has(rowId)) {
          toggleAttachmentsPanel()
        }
      }
      return
    }
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

    if (columns[col]?.type === 'attachment') {
      const val = store.cellCache.get(getCellKey(absRow, col))
      if (val != null && val !== '') {
        toggleAttachmentsPanel()
        return
      }
    }

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
      store.setActiveCell(absRow, col)
      store.startEditing()
    } else {
      store.setActiveCell(absRow, col)
    }

    dirtyRef.current = true
  }, [store, columns.length, rowCount])

  // 5. Side Effects (useEffect)
  useEffect(() => {
    if (!authToken || !authWorkspaceId) return
    api.sheets.get(sheetId, { accessToken: authToken, workspaceId: authWorkspaceId })
      .then(res => {
        const rules = (res.data as any)?.settings?.conditionalFormatRules
        if (Array.isArray(rules)) {
          condRulesRef.current = rules
          dirtyRef.current = true
        }
      })
      .catch(() => {})
  }, [sheetId, authToken, authWorkspaceId])

  useEffect(() => {
    useGridStore.getState().setColumns(columns)
    useGridStore.getState().updateVisibleRows(rowCount)
  }, [columns, rowCount])

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

    let lastLoginMs = Date.now() - 60 * 60 * 1000
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('ctm_last_login')
      if (stored) {
        lastLoginMs = new Date(stored).getTime()
      } else {
        localStorage.setItem('ctm_last_login', new Date().toISOString())
      }
    }

    ctx.fillStyle = colors.bg
    ctx.fillRect(0, 0, W, H)

    const totalVisibleRows = store.visibleRows.length || rowCount
    const firstVisibleRow = Math.max(0, Math.floor(store.scrollTop / DEFAULT_ROW_HEIGHT))
    const lastVisibleRow = Math.min(totalVisibleRows - 1, firstVisibleRow + Math.ceil(H / DEFAULT_ROW_HEIGHT) + 2)
    const firstVisibleCol = Math.max(0, Math.floor(store.scrollLeft / DEFAULT_COL_WIDTH))
    const lastVisibleCol = Math.min(columns.length - 1, firstVisibleCol + Math.ceil(W / DEFAULT_COL_WIDTH) + 2)

    ctx.strokeStyle = colors.gridLine
    ctx.lineWidth = 0.5
    ctx.beginPath()

    for (let row = firstVisibleRow; row <= lastVisibleRow + 1; row++) {
      const y = getY(row)
      if (y > H) break
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
    }
    for (let col = firstVisibleCol; col <= lastVisibleCol + 1; col++) {
      const x = getX(col)
      if (x > W) break
      ctx.moveTo(x, HEADER_HEIGHT)
      ctx.lineTo(x, H)
    }
    ctx.stroke()

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

      // Draw row number
      ctx.font = FONT
      ctx.fillStyle = colors.headerText
      ctx.textAlign = 'right'
      ctx.fillText(String(row + 1), ROW_NUM_WIDTH - 6, y + h / 2)

      // Draw attachment icon if row has attachments
      const absRow = store.visibleRows[row] ?? row
      const rowId = rowIdMap[absRow]
      if (rowId && rowAttachments.has(rowId)) {
        ctx.font = '10px Inter, system-ui, sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText('📎', 4, y + h / 2)
      }
    }

    ctx.fillStyle = colors.headerBg
    ctx.fillRect(0, 0, W, HEADER_HEIGHT)
    ctx.fillStyle = colors.rowNumBg
    ctx.fillRect(0, 0, ROW_NUM_WIDTH, HEADER_HEIGHT)

    if (sheetAttachments.length > 0) {
      ctx.font = '12px Inter, system-ui, sans-serif'
      ctx.fillStyle = colors.headerText
      ctx.textAlign = 'center'
      ctx.fillText('📎', ROW_NUM_WIDTH / 2, HEADER_HEIGHT / 2)
    }

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

    ctx.strokeStyle = colors.gridLine
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, HEADER_HEIGHT)
    ctx.lineTo(W, HEADER_HEIGHT)
    ctx.stroke()

    ctx.font = FONT
    ctx.fillStyle = colors.cellText
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.save()
    ctx.beginPath()
    ctx.rect(ROW_NUM_WIDTH, HEADER_HEIGHT, W - ROW_NUM_WIDTH, H - HEADER_HEIGHT)
    ctx.clip()

    for (let row = firstVisibleRow; row <= lastVisibleRow; row++) {
      const y = getY(row)
      const rowH = store.rowHeights.get(row) ?? DEFAULT_ROW_HEIGHT
      if (y + rowH < HEADER_HEIGHT) continue
      const absRow = store.visibleRows[row] ?? row
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
            if (rule.style.bgColor) condBgColor = rule.style.bgColor
            if (rule.style.fontColor) condFontColor = rule.style.fontColor
            if (rule.style.bold) condBold = true
            if (rule.style.italic) condItalic = true
            if (rule.style.strikethrough) condStrikethrough = true
          }
        }
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
            if (highlightChangesTimeframe === 'today' && diffMs <= 24 * 60 * 60 * 1000) highlightThisCell = true
            else if (highlightChangesTimeframe === '3days' && diffMs <= 3 * 24 * 60 * 60 * 1000) highlightThisCell = true
            else if (highlightChangesTimeframe === '7days' && diffMs <= 7 * 24 * 60 * 60 * 1000) highlightThisCell = true
            else if (highlightChangesTimeframe === 'last_login' && cellTime >= lastLoginMs) highlightThisCell = true
          }
        }

        if (highlightThisCell) {
          ctx.save()
          ctx.fillStyle = isDark ? 'rgba(245, 158, 11, 0.12)' : 'rgba(251, 191, 36, 0.2)'
          ctx.fillRect(x + 0.5, y + 0.5, colW - 1, rowH - 1)
          ctx.restore()
        }

        if (val != null && val !== '') {
          const text = String(val)
          const colType = columns[col]?.type

          // Specialized rendering for certain column types
          if (colType === 'attachment') {
            ctx.fillStyle = isDark ? '#2563eb' : '#3b82f6'
            ctx.font = '12px Inter, system-ui, sans-serif'
            ctx.textAlign = 'left'
            const displayValue = text.length > 20 ? text.slice(0, 17) + '...' : text
            ctx.fillText('📎 ' + displayValue, x + 6, y + rowH / 2, colW - 12)
            continue
          }

          if (colType === 'checkbox') {
            const checked = text === 'true' || text === '1'
            ctx.font = '14px Inter, system-ui, sans-serif'
            ctx.fillStyle = checked ? '#3b82f6' : colors.gridLine
            ctx.textAlign = 'center'
            ctx.fillText(checked ? '☑' : '☐', x + colW / 2, y + rowH / 2)
            continue
          }

          let cellFontColor = (format as any)?.fontColor ?? condFontColor ?? colors.cellText
          if (colType === 'url') {
            cellFontColor = '#3b82f6'
          }
          ctx.fillStyle = cellFontColor
          const isBold = format?.bold || condBold
          const isItalic = format?.italic || condItalic
          let fontStr = FONT
          if (isBold && isItalic) fontStr = 'bold italic 13px Inter, system-ui, sans-serif'
          else if (isBold) fontStr = 'bold 13px Inter, system-ui, sans-serif'
          else if (isItalic) fontStr = 'italic 13px Inter, system-ui, sans-serif'
          ctx.font = fontStr

          const align = format?.textAlign || 'left'
          ctx.textAlign = align
          let textX = x + 6
          if (align === 'center') textX = x + colW / 2
          else if (align === 'right') textX = x + colW - 6

          if (col === 0) {
            const meta = store.rowMetadata.get(`r${absRow}`)
            const indent = meta?.indent ?? 0
            textX += indent * 16
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

          if (condStrikethrough || (format as any)?.strikethrough) {
            const measured = Math.min(ctx.measureText(text).width, maxTextWidth)
            const strikeX = align === 'center' ? textX - measured / 2 : align === 'right' ? textX - measured : textX
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
    ctx.restore()

    if (store.selection) {
      const { startRow, startCol, endRow, endCol } = store.selection
      const visualStartRow = store.visibleRows.indexOf(startRow)
      const visualEndRow = store.visibleRows.indexOf(endRow)
      if (visualStartRow !== -1 && visualEndRow !== -1) {
        const x1 = getX(Math.min(startCol, endCol)), y1 = getY(Math.min(visualStartRow, visualEndRow))
        const x2 = getX(Math.max(startCol, endCol) + 1), y2 = getY(Math.max(visualStartRow, visualEndRow) + 1)
        ctx.fillStyle = colors.selection
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1)
        ctx.strokeStyle = colors.selBorder
        ctx.lineWidth = 2
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
      }
    }

    for (const [uid, collab] of collaborators) {
      if (uid === userId || !collab.cursor) continue
      const { row: absRow, col } = collab.cursor
      const visualRow = store.visibleRows.indexOf(absRow)
      if (visualRow === -1) continue
      const x = getX(col), y = getY(visualRow)
      const w = store.colWidths.get(col) ?? DEFAULT_COL_WIDTH
      const h = store.rowHeights.get(visualRow) ?? DEFAULT_ROW_HEIGHT
      const color = collab.color ?? presenceColor(uid)
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, w, h)
      ctx.fillStyle = color
      ctx.font = '11px Inter, system-ui, sans-serif'
      ctx.fillText(collab.name?.slice(0, 8) ?? uid.slice(0, 6), x + 2, y - 2)
    }

    ctx.restore()
    dirtyRef.current = false
  }, [store, columns, rowCount, collaborators, userId, getX, getY, highlightChangesEnabled, highlightChangesTimeframe])

  useEffect(() => {
    const loop = () => { if (dirtyRef.current) paint(); rafRef.current = requestAnimationFrame(loop) }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [paint])

  useEffect(() => {
    const unsub = useGridStore.subscribe(() => { dirtyRef.current = true })
    return unsub
  }, [])

  useEffect(() => {
    if (isTransitioning || viewMode !== 'grid') return
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(([entry]) => {
      const canvas = canvasElementRef.current
      if (!canvas || !entry) return
      const { width, height } = entry.contentRect
      setViewport({ w: width, h: height })
      const dpr = window.devicePixelRatio || 1
      const newWidth = Math.round(width), newHeight = Math.round(height)
      canvas.width = newWidth * dpr; canvas.height = newHeight * dpr
      canvas.style.width = `${newWidth}px`; canvas.style.height = `${newHeight}px`
      dirtyRef.current = true
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [isTransitioning, viewMode])

  useEffect(() => {
    if (isTransitioning || viewMode !== 'grid') return
    const container = containerRef.current
    if (!container) return
    if (Math.abs(container.scrollTop - store.scrollTop) > 1) container.scrollTop = store.scrollTop
    if (Math.abs(container.scrollLeft - store.scrollLeft) > 1) container.scrollLeft = store.scrollLeft
  }, [store.scrollTop, store.scrollLeft, isTransitioning, viewMode])

  useEffect(() => {
    if (!store.activeCell || !containerRef.current) return
    const { row, col } = store.activeCell
    const visualRow = store.visibleRows.indexOf(row)
    if (visualRow === -1) return
    const container = containerRef.current
    const { clientWidth, clientHeight } = container
    if (clientWidth === 0 || clientHeight === 0) return
    const x = getX(col), y = getY(visualRow)
    const w = store.colWidths.get(col) ?? DEFAULT_COL_WIDTH
    const h = store.rowHeights.get(visualRow) ?? DEFAULT_ROW_HEIGHT
    let newScrollTop = store.scrollTop, newScrollLeft = store.scrollLeft
    if (y < HEADER_HEIGHT) newScrollTop = store.scrollTop + (y - HEADER_HEIGHT)
    else if (y + h > clientHeight) newScrollTop = store.scrollTop + (y + h - clientHeight)
    if (x < ROW_NUM_WIDTH) newScrollLeft = store.scrollLeft + (x - ROW_NUM_WIDTH)
    else if (x + w > clientWidth) newScrollLeft = store.scrollLeft + (x + w - clientWidth)
    if (newScrollTop !== store.scrollTop || newScrollLeft !== store.scrollLeft) {
      store.setScroll(Math.max(0, newScrollTop), Math.max(0, newScrollLeft))
    }
  }, [store.activeCell, store.visibleRows, columns.length, getX, getY])

  // 6. Final Render
  return (
    <div className="relative w-full h-full bg-background">
      {isTransitioning ? (
        <GridSkeleton />
      ) : viewMode === 'grid' ? (
        <div 
          ref={containerRef} 
          className="relative w-full h-full overflow-auto bg-background" 
          onScroll={handleScroll}
          tabIndex={0} 
          onKeyDown={handleKeyDown}
        >
          <div style={{ width: totalWidth, height: totalHeight, pointerEvents: 'none', position: 'relative' }}>
            <div className="sticky top-0 left-0 pointer-events-none" style={{ width: viewport.w || '100%', height: viewport.h || '100%' }}>
              <canvas
                ref={canvasRef}
                className="grid-canvas pointer-events-auto block w-full h-full"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
              />
              {store.isEditing && store.activeCell && (
                <div className="absolute inset-0 pointer-events-none">
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
                          if (!cellMap) { cellMap = new Y.Map(); cellsMap.set(key, cellMap) }
                          cellMap.set('value', value); cellMap.set('updatedAt', timestamp)
                        })
                      }
                      store.setCellCache(key, value); store.setCellUpdateCache(key, timestamp)
                      store.stopEditing(true); dirtyRef.current = true
                      if (reason === 'keyboard') containerRef.current?.focus()
                    }}
                    onCancel={(reason) => {
                      store.stopEditing(false)
                      if (reason === 'keyboard') containerRef.current?.focus()
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <SpecialViews sheetId={sheetId} doc={doc} columns={columns} />
      )}
    </div>
  )
}
