'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Grid, GanttChart, Columns, Calendar, FileText, LayoutDashboard, AlignLeft, Users } from 'lucide-react'
import { useUIStore, type ViewMode } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'

const VIEWS: { mode: ViewMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'grid',      label: 'Grid',      icon: <Grid size={14} /> },
  { mode: 'gantt',     label: 'Gantt',     icon: <GanttChart size={14} /> },
  { mode: 'kanban',    label: 'Kanban',    icon: <Columns size={14} /> },
  { mode: 'calendar',  label: 'Calendar',  icon: <Calendar size={14} /> },
  { mode: 'form',      label: 'Form',      icon: <FileText size={14} /> },
  { mode: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
  { mode: 'timeline',  label: 'Timeline',  icon: <AlignLeft size={14} /> },
  { mode: 'resources', label: 'Resources', icon: <Users size={14} /> },
]

export function ViewPicker() {
  const { viewMode, setViewMode } = useUIStore()
  const { accessToken, user } = useAuthStore()
  const params = useParams()
  const sheetId = params?.sheetId as string
  const workspaceId = params?.workspaceId as string || user?.workspaceId || ''
  const [sheetType, setSheetType] = useState<string | null>(null)

  useEffect(() => {
    if (!sheetId || !accessToken || !workspaceId) {
      setSheetType(null)
      return
    }
    
    api.sheets.get(sheetId, { accessToken, workspaceId })
      .then(res => {
        setSheetType(res.data?.type || 'SPREADSHEET')
      })
      .catch(() => {
        setSheetType('SPREADSHEET')
      })
  }, [sheetId, accessToken, workspaceId])

  const isDisabled = (mode: ViewMode) => {
    if (sheetType === 'SPREADSHEET') {
      return ['gantt', 'timeline', 'resources'].includes(mode)
    }
    return false
  }

  // Auto-switch away from disabled views
  useEffect(() => {
    if (sheetType === 'SPREADSHEET' && ['gantt', 'timeline', 'resources'].includes(viewMode)) {
      setViewMode('grid')
    }
  }, [sheetType, viewMode, setViewMode])

  return (
    <div className="h-8 border-b border-border bg-background flex items-center gap-0.5 px-2 flex-shrink-0 overflow-x-auto">
      {VIEWS.map(({ mode, label, icon }) => {
        const disabled = isDisabled(mode)
        return (
          <button
            key={mode}
            disabled={disabled}
            onClick={() => !disabled && setViewMode(mode)}
            title={disabled ? `View not available for ${sheetType} type` : label}
            className={cn(
              'h-6 px-3 rounded flex items-center gap-1.5 text-xs whitespace-nowrap transition-colors',
              viewMode === mode
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              disabled && 'opacity-30 cursor-not-allowed grayscale'
            )}
          >
            {icon}
            {label}
          </button>
        )
      })}
    </div>
  )
}

