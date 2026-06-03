'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import * as Y from 'yjs'
import { useGridStore, getColWidth, getRowHeight, getCellKey } from '../../store/gridStore'
import { useUserStore, presenceColor } from '../../store/userStore'
import { useCollabProvider } from '../../hooks/useCollabProvider'
import { CellEditor } from './CellEditor'
import { useUIStore } from '../../store/uiStore'
import { SpecialViews } from './SpecialViews'

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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const dirtyRef = useRef(true)

  const store = useGridStore()
  const { collaborators, userId } = useUserStore()
  const { doc, provider } = useCollabProvider(sheetId)

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
    const canvas = canvasRef.current
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

    // Background
    ctx.fillStyle = colors.bg
    ctx.fillRect(0, 0, W, H)

    // ── Visible range ────────────────────────────────────────
    const firstVisibleRow = Math.max(0, Math.floor(store.scrollTop / DEFAULT_ROW_HEIGHT))
    const lastVisibleRow = Math.min(rowCount - 1, firstVisibleRow + Math.ceil(H / DEFAULT_ROW_HEIGHT) + 2)
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

      for (let col = firstVisibleCol; col <= lastVisibleCol; col++) {
        if (col >= columns.length) break
        const x = getX(col)
        const colW = store.colWidths.get(col) ?? DEFAULT_COL_WIDTH

        const key = getCellKey(row, col)
        const val = store.cellCache.get(key)
        const format = store.formatCache.get(key)

        if (val != null && val !== '') {
          // Truncate text to cell width
          const text = String(val)
          ctx.fillStyle = colors.cellText

          // Apply bold/italic
          let fontStr = FONT
          if (format?.bold && format?.italic) {
            fontStr = 'bold italic 13px Inter, system-ui, sans-serif'
          } else if (format?.bold) {
            fontStr = 'bold 13px Inter, system-ui, sans-serif'
          } else if (format?.italic) {
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

          ctx.fillText(text, textX, y + rowH / 2, colW - 12)
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
      const x1 = getX(Math.min(startCol, endCol))
      const y1 = getY(Math.min(startRow, endRow))
      const x2 = getX(Math.max(startCol, endCol) + 1)
      const y2 = getY(Math.max(startRow, endRow) + 1)

      ctx.fillStyle = colors.selection
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1)

      ctx.strokeStyle = colors.selBorder
      ctx.lineWidth = 2
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
    }

    // ── Collaborator cursors ─────────────────────────────────
    for (const [uid, collab] of collaborators) {
      if (uid === userId || !collab.cursor) continue
      const { row, col } = collab.cursor
      const x = getX(col)
      const y = getY(row)
      const w = store.colWidths.get(col) ?? DEFAULT_COL_WIDTH
      const h = store.rowHeights.get(row) ?? DEFAULT_ROW_HEIGHT
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
  }, [store, columns, rowCount, collaborators, userId, getX, getY])

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
      const canvas = canvasRef.current
      if (!canvas || !entry) return
      const { width, height } = entry.contentRect
      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      store.setViewport(width, height)
      dirtyRef.current = true
    })

    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // ─── Keyboard ────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { activeCell, isEditing } = store

    if (isEditing) {
      if (e.key === 'Escape') { store.stopEditing(false); e.preventDefault() }
      if (e.key === 'Enter') { store.stopEditing(true); e.preventDefault() }
      if (e.key === 'Tab')   { store.stopEditing(true); e.preventDefault() }
      return
    }

    if (!activeCell) return

    switch (e.key) {
      case 'ArrowUp':    store.setActiveCell(Math.max(0, activeCell.row - 1), activeCell.col); e.preventDefault(); break
      case 'ArrowDown':  store.setActiveCell(activeCell.row + 1, activeCell.col); e.preventDefault(); break
      case 'ArrowLeft':  store.setActiveCell(activeCell.row, Math.max(0, activeCell.col - 1)); e.preventDefault(); break
      case 'ArrowRight': store.setActiveCell(activeCell.row, activeCell.col + 1); e.preventDefault(); break
      case 'Enter':      store.setActiveCell(activeCell.row + 1, activeCell.col); e.preventDefault(); break
      case 'Tab':        store.setActiveCell(activeCell.row, activeCell.col + 1); e.preventDefault(); break
      case 'F2':         store.startEditing(); e.preventDefault(); break
      case 'Delete':
      case 'Backspace': {
        const key = getCellKey(activeCell.row, activeCell.col)
        if (doc) {
          const cellsMap = doc.getMap<Y.Map<unknown>>('cells')
          doc.transact(() => {
            let cellMap = cellsMap.get(key)
            if (!cellMap) {
              cellMap = new Y.Map()
              cellsMap.set(key, cellMap)
            }
            cellMap.set('value', null)
          })
        }
        store.setCellCache(key, null)
        dirtyRef.current = true
        break
      }
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          store.startEditing(e.key)
          e.preventDefault()
        }
    }
  }, [store, doc])

  // ─── Mouse ───────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
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

    let row = 0, ry = HEADER_HEIGHT - store.scrollTop
    while (row < rowCount) {
      const h = store.rowHeights.get(row) ?? DEFAULT_ROW_HEIGHT
      if (ry + h > y) break
      ry += h; row++
    }

    if (e.detail === 2) {
      // Double-click → edit
      store.setActiveCell(row, col)
      store.startEditing()
    } else {
      store.setActiveCell(row, col)
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

  const { viewMode } = useUIStore()

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-background" tabIndex={0} onKeyDown={handleKeyDown}>
      {viewMode === 'grid' ? (
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
              y={getY(store.activeCell.row)}
              width={store.colWidths.get(store.activeCell.col) ?? DEFAULT_COL_WIDTH}
              height={store.rowHeights.get(store.activeCell.row) ?? DEFAULT_ROW_HEIGHT}
              onCommit={(value, reason) => {
                const key = getCellKey(store.activeCell!.row, store.activeCell!.col)
                if (doc) {
                  const cellsMap = doc.getMap<Y.Map<unknown>>('cells')
                  doc.transact(() => {
                    let cellMap = cellsMap.get(key)
                    if (!cellMap) {
                      cellMap = new Y.Map()
                      cellsMap.set(key, cellMap)
                    }
                    cellMap.set('value', value)
                  })
                }
                store.setCellCache(key, value)
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
