'use client'

import { useEffect, useRef, useState, MouseEvent } from 'react'

interface Task {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  durationDays: number
  status: string
  isCritical: boolean
  floatDays: number | null
}

interface GanttCanvasProps {
  tasks: Task[]
  zoomScale: 'day' | 'week' | 'month'
  criticalPathTaskIds: string[]
  baselineTasks: any[] | null
  scrollTop: number
  onScroll: (scrollTop: number) => void
  onTaskChange: (taskId: string, dates: { startDate: string; endDate: string }) => Promise<void>
}

const HEADER_HEIGHT = 40
const ROW_HEIGHT = 36
const BAR_HEIGHT = 20

export function GanttCanvas({
  tasks,
  zoomScale,
  criticalPathTaskIds,
  baselineTasks,
  scrollTop,
  onScroll,
  onTaskChange,
}: GanttCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scrollLeft, setScrollLeft] = useState(0)

  // Drag state
  const [dragState, setDragState] = useState<{
    taskId: string
    type: 'left' | 'right' | 'center'
    startX: number
    startStartDate: Date
    startEndDate: Date
  } | null>(null)

  // Optimistic date overrides during active drag
  const [optimisticDates, setOptimisticDates] = useState<Record<string, { startDate: string; endDate: string }>>({})

  // Determine timeline parameters
  const getPxPerDay = () => {
    switch (zoomScale) {
      case 'day': return 24
      case 'week': return 4
      case 'month': return 1.5
      default: return 24
    }
  }

  // Anchor date (origin D0) is 5 days before the earliest task date or today
  const getOriginDate = (): Date => {
    let minDate = new Date()
    minDate.setDate(minDate.getDate() - 5)

    tasks.forEach(t => {
      if (t.startDate) {
        const d = new Date(t.startDate)
        if (d < minDate) minDate = d
      }
    })
    
    // Reset to start of day
    minDate.setHours(0, 0, 0, 0)
    return minDate
  }

  const originDate = getOriginDate()
  const pxPerDay = getPxPerDay()

  // Convert date string to X coordinate
  const getX = (dateStr: string | null): number => {
    if (!dateStr) return 0
    const d = new Date(dateStr)
    d.setHours(0, 0, 0, 0)
    const diffTime = d.getTime() - originDate.getTime()
    const diffDays = diffTime / (1000 * 60 * 60 * 24)
    return diffDays * pxPerDay
  }

  // Convert X coordinate back to date string (YYYY-MM-DD)
  const getDateFromX = (x: number): string => {
    const diffDays = x / pxPerDay
    const d = new Date(originDate.getTime() + diffDays * 24 * 60 * 60 * 1000)
    return d.toISOString().split('T')[0]
  }

  // Sync scroll
  const handleScroll = () => {
    if (containerRef.current) {
      setScrollLeft(containerRef.current.scrollLeft)
      onScroll(containerRef.current.scrollTop)
    }
  }

  useEffect(() => {
    if (containerRef.current && containerRef.current.scrollTop !== scrollTop) {
      containerRef.current.scrollTop = scrollTop
    }
  }, [scrollTop])

  // Canvas paint loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const W = rect.width
    const H = Math.max(rect.height, tasks.length * ROW_HEIGHT + HEADER_HEIGHT)

    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    const isDark = document.documentElement.classList.contains('dark')
    const colors = {
      bg: isDark ? '#0b0f19' : '#ffffff',
      headerBg: isDark ? '#111827' : '#f9fafb',
      headerText: isDark ? '#9ca3af' : '#4b5563',
      gridLine: isDark ? '#1f2937' : '#f3f4f6',
      gridLineMajor: isDark ? '#374151' : '#e5e7eb',
      todayLine: '#3b82f6',
      baseline: isDark ? 'rgba(156, 163, 175, 0.25)' : 'rgba(156, 163, 175, 0.4)',
    }

    ctx.clearRect(0, 0, W, H)

    // Draw grid background
    ctx.fillStyle = colors.bg
    ctx.fillRect(0, 0, W, H)

    const totalDays = Math.ceil(W / pxPerDay) + 10
    const viewStartDay = Math.floor(scrollLeft / pxPerDay)

    // Draw vertical timeline grid lines
    ctx.strokeStyle = colors.gridLine
    ctx.lineWidth = 0.5
    ctx.beginPath()
    for (let i = viewStartDay; i < viewStartDay + totalDays; i++) {
      const x = i * pxPerDay - scrollLeft
      if (x < 0 || x > W) continue
      
      const d = new Date(originDate.getTime() + i * 24 * 60 * 60 * 1000)
      let isMajor = false

      if (zoomScale === 'day') {
        isMajor = d.getDay() === 0 // Sunday
      } else if (zoomScale === 'week') {
        isMajor = d.getDay() === 1 // Monday
      } else if (zoomScale === 'month') {
        isMajor = d.getDate() === 1 // 1st of month
      }

      ctx.strokeStyle = isMajor ? colors.gridLineMajor : colors.gridLine
      ctx.beginPath()
      ctx.moveTo(x, HEADER_HEIGHT)
      ctx.lineTo(x, H)
      ctx.stroke()
    }

    // Draw horizontal grid lines
    ctx.strokeStyle = colors.gridLine
    ctx.lineWidth = 0.5
    for (let i = 0; i <= tasks.length; i++) {
      const y = HEADER_HEIGHT + i * ROW_HEIGHT
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }

    // Draw Today Line
    const todayX = getX(new Date().toISOString().split('T')[0]) - scrollLeft
    if (todayX >= 0 && todayX <= W) {
      ctx.strokeStyle = colors.todayLine
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(todayX, HEADER_HEIGHT)
      ctx.lineTo(todayX, H)
      ctx.stroke()
      ctx.setLineDash([])

      // Label Today
      ctx.fillStyle = colors.todayLine
      ctx.font = '9px Inter, sans-serif'
      ctx.fillText('TODAY', todayX + 4, HEADER_HEIGHT - 6)
    }

    // ─── Draw Task Bars ───
    tasks.forEach((t, idx) => {
      const y = HEADER_HEIGHT + idx * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2
      
      // Get current dates (potentially overridden by optimistic drag dates)
      const dateOverride = optimisticDates[t.id]
      const startDate = dateOverride ? dateOverride.startDate : t.startDate
      const endDate = dateOverride ? dateOverride.endDate : t.endDate

      if (!startDate || !endDate) return

      const x1 = getX(startDate) - scrollLeft
      const x2 = getX(endDate) - scrollLeft + pxPerDay
      const barWidth = Math.max(pxPerDay, x2 - x1)

      // Draw Baseline Ghost Bar if present
      if (baselineTasks) {
        const baseTask = baselineTasks.find(bt => bt.id === t.id || bt.rowId === t.rowId)
        if (baseTask && baseTask.startDate && baseTask.endDate) {
          const bx1 = getX(baseTask.startDate) - scrollLeft
          const bx2 = getX(baseTask.endDate) - scrollLeft + pxPerDay
          const bWidth = Math.max(pxPerDay, bx2 - bx1)
          
          ctx.fillStyle = colors.baseline
          ctx.fillRect(bx1, y + 2, bWidth, BAR_HEIGHT)
          ctx.strokeStyle = isDark ? '#4b5563' : '#9ca3af'
          ctx.lineWidth = 1
          ctx.setLineDash([2, 2])
          ctx.strokeRect(bx1, y + 2, bWidth, BAR_HEIGHT)
          ctx.setLineDash([])
        }
      }

      // Determine bar colors based on status and critical path
      const isCritical = criticalPathTaskIds.includes(t.id) || t.isCritical
      let fillStyle = '#3b82f6' // Blue (In Progress)
      let strokeStyle = '#2563eb'

      if (t.status === 'Complete' || t.status === 'done' || t.status === 'APPROVED') {
        fillStyle = '#10b981' // Green
        strokeStyle = '#059669'
      } else if (t.status === 'Not Started' || t.status === 'todo') {
        fillStyle = '#94a3b8' // Slate/Grey
        strokeStyle = '#64748b'
      }

      if (isCritical) {
        fillStyle = '#ef4444' // Red override for critical path
        strokeStyle = '#dc2626'
      }

      // Draw Main Bar
      ctx.fillStyle = fillStyle
      ctx.fillRect(x1, y, barWidth, BAR_HEIGHT)

      // Highlight critical border
      ctx.strokeStyle = strokeStyle
      ctx.lineWidth = isCritical ? 2 : 1
      ctx.strokeRect(x1, y, barWidth, BAR_HEIGHT)

      // Draw progress indicator for In Progress tasks
      if (t.status === 'In Progress' || t.status === 'in progress') {
        ctx.fillStyle = 'rgba(255,255,255,0.2)'
        ctx.fillRect(x1, y, barWidth * 0.5, BAR_HEIGHT)
      }

      // Renders text label inside or next to the bar
      ctx.fillStyle = isDark ? '#ffffff' : '#111827'
      ctx.font = '11px Inter, sans-serif'
      ctx.textBaseline = 'middle'
      
      const textX = x2 + 8
      if (textX + 100 < W) {
        ctx.fillText(t.name || `Task #${idx + 1}`, textX, y + BAR_HEIGHT / 2)
      }
    });

    // ─── Draw Critical Path Arrow Overlays ───
    if (criticalPathTaskIds.length > 1) {
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2
      ctx.fillStyle = '#ef4444'

      for (let i = 0; i < criticalPathTaskIds.length - 1; i++) {
        const t1 = tasks.find(t => t.id === criticalPathTaskIds[i])
        const t2 = tasks.find(t => t.id === criticalPathTaskIds[i+1])

        if (t1 && t2 && t1.startDate && t2.startDate) {
          const idx1 = tasks.indexOf(t1)
          const idx2 = tasks.indexOf(t2)

          const xStart = getX(t1.endDate) - scrollLeft + pxPerDay
          const yStart = HEADER_HEIGHT + idx1 * ROW_HEIGHT + ROW_HEIGHT / 2

          const xEnd = getX(t2.startDate) - scrollLeft
          const yEnd = HEADER_HEIGHT + idx2 * ROW_HEIGHT + ROW_HEIGHT / 2

          ctx.beginPath()
          ctx.moveTo(xStart, yStart)
          ctx.lineTo(xStart + 8, yStart)
          ctx.lineTo(xStart + 8, yEnd)
          ctx.lineTo(xEnd, yEnd)
          ctx.stroke()

          // Draw Arrow Head
          ctx.beginPath()
          ctx.moveTo(xEnd, yEnd)
          ctx.lineTo(xEnd - 5, yEnd - 4)
          ctx.lineTo(xEnd - 5, yEnd + 4)
          ctx.closePath()
          ctx.fill()
        }
      }
    }

    // Draw Header
    ctx.fillStyle = colors.headerBg
    ctx.fillRect(0, 0, W, HEADER_HEIGHT)

    // Bottom border of header
    ctx.strokeStyle = colors.gridLineMajor
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, HEADER_HEIGHT)
    ctx.lineTo(W, HEADER_HEIGHT)
    ctx.stroke()

    // Render Timeline Date Labels in Header
    ctx.fillStyle = colors.headerText
    ctx.font = '10px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    for (let i = viewStartDay; i < viewStartDay + totalDays; i++) {
      const x = i * pxPerDay - scrollLeft
      const d = new Date(originDate.getTime() + i * 24 * 60 * 60 * 1000)

      if (zoomScale === 'day') {
        if (i % 2 === 0) {
          ctx.fillText(`${d.getDate()} ${monthNames[d.getMonth()]}`, x, HEADER_HEIGHT / 2)
        }
      } else if (zoomScale === 'week') {
        if (d.getDay() === 1) { // Monday
          ctx.fillText(`Wk ${Math.ceil(d.getDate() / 7)} ${monthNames[d.getMonth()]}`, x + (pxPerDay * 3.5), HEADER_HEIGHT / 2)
        }
      } else if (zoomScale === 'month') {
        if (d.getDate() === 15) { // Middle of month
          ctx.fillText(`${monthNames[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`, x, HEADER_HEIGHT / 2)
        }
      }
    }

  }, [tasks, zoomScale, scrollLeft, criticalPathTaskIds, baselineTasks, pxPerDay, originDate, optimisticDates])

  // Drag handlers
  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left + scrollLeft
    const y = e.clientY - rect.top

    // Find row
    const rowIdx = Math.floor((y - HEADER_HEIGHT) / ROW_HEIGHT)
    if (rowIdx < 0 || rowIdx >= tasks.length) return

    const task = tasks[rowIdx]
    if (!task.startDate || !task.endDate) return

    const x1 = getX(task.startDate)
    const x2 = getX(task.endDate) + pxPerDay
    
    // Check if clicked inside the bar
    if (x >= x1 && x <= x2) {
      let type: 'left' | 'right' | 'center' = 'center'
      if (x - x1 < 10) {
        type = 'left'
      } else if (x2 - x < 10) {
        type = 'right'
      }

      setDragState({
        taskId: task.id,
        type,
        startX: e.clientX,
        startStartDate: new Date(task.startDate),
        startEndDate: new Date(task.endDate),
      })
    }
  }

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!dragState) return

    const deltaX = e.clientX - dragState.startX
    const deltaDays = Math.round(deltaX / pxPerDay)

    const newStart = new Date(dragState.startStartDate)
    const newEnd = new Date(dragState.startEndDate)

    if (dragState.type === 'left') {
      newStart.setDate(newStart.getDate() + deltaDays)
      if (newStart > newEnd) newStart.setTime(newEnd.getTime())
    } else if (dragState.type === 'right') {
      newEnd.setDate(newEnd.getDate() + deltaDays)
      if (newEnd < newStart) newEnd.setTime(newStart.getTime())
    } else {
      newStart.setDate(newStart.getDate() + deltaDays)
      newEnd.setDate(newEnd.getDate() + deltaDays)
    }

    setOptimisticDates({
      ...optimisticDates,
      [dragState.taskId]: {
        startDate: newStart.toISOString().split('T')[0],
        endDate: newEnd.toISOString().split('T')[0],
      }
    })
  }

  const handleMouseUp = async () => {
    if (!dragState) return

    const override = optimisticDates[dragState.taskId]
    setDragState(null)
    
    if (override) {
      try {
        await onTaskChange(dragState.taskId, override)
      } catch (err) {
        console.error("Failed to commit date change:", err)
      } finally {
        setOptimisticDates(prev => {
          const next = { ...prev }
          delete next[dragState.taskId]
          return next
        })
      }
    }
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-auto bg-background"
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          minWidth: '1000px',
          cursor: dragState ? (dragState.type === 'center' ? 'grabbing' : 'ew-resize') : 'default'
        }}
      />
    </div>
  )
}
