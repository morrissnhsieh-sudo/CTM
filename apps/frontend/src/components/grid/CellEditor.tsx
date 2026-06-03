'use client'

import { useEffect, useRef, useState } from 'react'

interface CellEditorProps {
  row: number
  col: number
  initialValue: string
  x: number
  y: number
  width: number
  height: number
  onCommit: (value: string, reason: 'keyboard' | 'blur') => void
  onCancel: (reason: 'keyboard') => void
}

/**
 * Inline cell editor — an absolutely-positioned <textarea> overlaid on
 * the Canvas grid at the exact cell position.
 */
export function CellEditor({ row, col, initialValue, x, y, width, height, onCommit, onCancel }: CellEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState(initialValue)
  const isFirstChangeRef = useRef(true)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const timer = setTimeout(() => {
      el.focus()
      // Place cursor at end
      el.setSelectionRange(el.value.length, el.value.length)
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  // Clear first-change check window after 50ms
  useEffect(() => {
    const timer = setTimeout(() => {
      isFirstChangeRef.current = false
    }, 50)
    return () => clearTimeout(timer)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    let newVal = e.target.value
    // Deduplicate automatically inserted duplicate character on mount/focus
    if (isFirstChangeRef.current && initialValue && newVal === initialValue + initialValue) {
      newVal = initialValue
    }
    isFirstChangeRef.current = false
    setValue(newVal)
  }

  return (
    <textarea
      ref={ref}
      className="absolute z-10 border-2 border-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100
                 text-[13px] font-sans resize-none outline-none overflow-hidden leading-5 px-1.5 py-0.5"
      style={{ left: x, top: y, width: Math.max(width, 120), minHeight: height }}
      value={value}
      onChange={handleChange}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); onCancel('keyboard') }
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onCommit(value, 'keyboard') }
        if (e.key === 'Tab') { e.preventDefault(); onCommit(value, 'keyboard') }
      }}
      onBlur={() => onCommit(value, 'blur')}
    />
  )
}
