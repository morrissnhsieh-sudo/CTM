'use client'

import { Grid, GanttChart, Columns, Calendar, FileText, LayoutDashboard, AlignLeft, Users } from 'lucide-react'
import { useUIStore, type ViewMode } from '../../store/uiStore'
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

  return (
    <div className="h-8 border-b border-border bg-background flex items-center gap-0.5 px-2 flex-shrink-0 overflow-x-auto">
      {VIEWS.map(({ mode, label, icon }) => (
        <button
          key={mode}
          onClick={() => setViewMode(mode)}
          className={cn(
            'h-6 px-3 rounded flex items-center gap-1.5 text-xs whitespace-nowrap transition-colors',
            viewMode === mode
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent',
          )}
        >
          {icon}
          {label}
        </button>
      ))}
    </div>
  )
}
