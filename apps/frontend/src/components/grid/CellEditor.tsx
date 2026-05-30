'use client'

import { useEffect, useRef } from 'react'

interface CellEditorProps {
  row: number
  col: number
  initialValue: string
  x: number
  y: number
  width: number
  height: number
  onCommit: (value: string) => void
  onCancel: () => void
}

/**
 * Inline cell editor — an absolutely-positioned <textarea> overlaid on
 * the Canvas grid at the exact cell position.
 */
export function CellEditor({ row, col, initialValue, x, y, width, height, onCommit, onCancel }: CellEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    // Place cursor at end
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  return (
    <textarea
      ref={ref}
      className="absolute z-10 border-2 border-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100
                 text-[13px] font-sans resize-none outline-none overflow-hidden leading-5 px-1.5 py-0.5"
      style={{ left: x, top: y, width: Math.max(width, 120), minHeight: height }}
      defaultValue={initialValue}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onCommit(e.currentTarget.value) }
        if (e.key === 'Tab') { e.preventDefault(); onCommit(e.currentTarget.value) }
      }}
      onBlur={(e) => onCommit(e.currentTarget.value)}
    />
  )
}
