'use client'

import React, { useState } from 'react'
import * as Y from 'yjs'
import { 
  Calendar as CalendarIcon, 
  User, 
  CheckCircle2, 
  Circle, 
  Clock, 
  Plus, 
  LayoutKanban, 
  GanttChart, 
  ChevronLeft, 
  ChevronRight, 
  AlertCircle 
} from 'lucide-react'
import { useGridStore, getCellKey } from '../../store/gridStore'
import { useUIStore } from '../../store/uiStore'

interface RowData {
  id: number
  name: string
  status: string
  assignee: string
  dueDate: string
}

interface SpecialViewsProps {
  sheetId: string
  doc: Y.Doc | null
  columns: any[]
}

export function SpecialViews({ sheetId, doc, columns }: SpecialViewsProps) {
  const store = useGridStore()
  const [formName, setFormName] = useState('')
  const [formStatus, setFormStatus] = useState('Todo')
  const [formAssignee, setFormAssignee] = useState('')
  const [formDueDate, setFormDueDate] = useState('')
  const [formSuccess, setFormSuccess] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 5, 3)) // June 2026 (0-indexed month)

  // 1. Get data from the store / CRDT
  const getRows = (): RowData[] => {
    const list: RowData[] = []
    // Scan up to 50 rows for data
    for (let r = 0; r < 50; r++) {
      const nameVal = store.cellCache.get(`r${r}c0`)
      const statusVal = store.cellCache.get(`r${r}c1`)
      const assigneeVal = store.cellCache.get(`r${r}c2`)
      const dueDateVal = store.cellCache.get(`r${r}c3`)

      if (nameVal != null || statusVal != null || assigneeVal != null || dueDateVal != null) {
        list.push({
          id: r,
          name: nameVal ? String(nameVal) : `Task #${r + 1}`,
          status: statusVal ? String(statusVal) : 'Todo',
          assignee: assigneeVal ? String(assigneeVal) : 'Unassigned',
          dueDate: dueDateVal ? String(dueDateVal) : '2026-06-03',
        })
      }
    }

    if (list.length === 0) {
      return [
        { id: 0, name: 'Setup database schema', status: 'In Progress', assignee: 'John Doe', dueDate: '2026-06-05' },
        { id: 1, name: 'Design dashboard UI', status: 'Todo', assignee: 'Jane Smith', dueDate: '2026-06-12' },
        { id: 2, name: 'Integrate API Gateway', status: 'Done', assignee: 'Alex Jones', dueDate: '2026-06-02' },
        { id: 3, name: 'Write automated tests', status: 'Todo', assignee: 'Jane Smith', dueDate: '2026-06-15' },
      ]
    }
    return list
  }

  const rows = getRows()

  // Helper to update a cell's value in CRDT and local store cache
  const updateCellValue = (rowId: number, colIndex: number, val: string) => {
    const key = getCellKey(rowId, colIndex)
    if (doc) {
      const cellsMap = doc.getMap<Y.Map<unknown>>('cells')
      doc.transact(() => {
        let cellMap = cellsMap.get(key)
        if (!cellMap) {
          cellMap = new Y.Map()
          cellsMap.set(key, cellMap)
        }
        cellMap.set('value', val)
      })
    }
    store.setCellCache(key, val)
  }

  // 2. Render Kanban View
  const renderKanban = () => {
    const statuses = ['Todo', 'In Progress', 'Done']
    
    return (
      <div className="flex gap-4 p-6 overflow-x-auto h-full bg-background/50">
        {statuses.map(status => {
          const statusRows = rows.filter(r => r.status.toLowerCase() === status.toLowerCase() || (status === 'Todo' && !['in progress', 'done'].includes(r.status.toLowerCase())))
          
          return (
            <div key={status} className="flex flex-col w-80 bg-accent/30 rounded-xl border border-border p-4 flex-shrink-0">
              <div className="flex items-center justify-between mb-4">
                <span className="font-semibold text-sm flex items-center gap-2">
                  <LayoutKanban size={16} className="text-primary" />
                  {status}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-accent text-muted-foreground">
                  {statusRows.length}
                </span>
              </div>
              
              <div className="flex flex-col gap-3 overflow-y-auto flex-1 pr-1">
                {statusRows.map(task => (
                  <div 
                    key={task.id} 
                    className="p-4 bg-background border border-border hover:border-primary/50 transition-all rounded-lg shadow-sm flex flex-col gap-3 group"
                  >
                    <div className="font-medium text-sm text-foreground">{task.name}</div>
                    
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User size={12} />
                        {task.assignee || 'Unassigned'}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarIcon size={12} />
                        {task.dueDate}
                      </span>
                    </div>

                    <div className="flex gap-1.5 mt-1 border-t border-border/50 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {statuses.filter(s => s !== status).map(nextStatus => (
                        <button
                          key={nextStatus}
                          onClick={() => updateCellValue(task.id, 1, nextStatus)}
                          className="text-[10px] px-2 py-1 bg-accent hover:bg-primary/10 hover:text-primary rounded transition-colors text-muted-foreground font-medium"
                        >
                          Move to {nextStatus}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // 3. Render Gantt View
  const renderGantt = () => {
    return (
      <div className="flex flex-col h-full bg-background overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <span className="text-sm font-semibold flex items-center gap-2">
            <GanttChart size={16} className="text-primary" />
            Project Schedule Timeline
          </span>
        </div>
        
        <div className="flex flex-1 overflow-auto">
          {/* Sidebar */}
          <div className="w-64 border-r border-border flex-shrink-0 bg-accent/10">
            <div className="h-10 border-b border-border flex items-center px-4 text-xs font-semibold text-muted-foreground uppercase">
              Task Details
            </div>
            {rows.map(task => (
              <div key={task.id} className="h-12 border-b border-border/60 flex flex-col justify-center px-4 truncate">
                <span className="font-medium text-sm text-foreground truncate">{task.name}</span>
                <span className="text-[10px] text-muted-foreground truncate">{task.assignee}</span>
              </div>
            ))}
          </div>

          {/* Timeline Grid */}
          <div className="flex-1 min-w-[600px]">
            <div className="h-10 border-b border-border bg-accent/20 flex text-xs text-muted-foreground">
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className="flex-1 border-r border-border/40 flex items-center justify-center font-medium">
                  June {i + 1}
                </div>
              ))}
            </div>
            
            {rows.map((task, idx) => {
              // Parse day from due date (fallback to day idx + 2)
              const dueDay = parseInt(task.dueDate.split('-')[2]) || (idx + 2)
              const startDay = Math.max(1, dueDay - 3)
              const widthPct = 3 * (100 / 14)
              const leftPct = (startDay - 1) * (100 / 14)
              
              let barColor = 'bg-blue-500'
              if (task.status.toLowerCase() === 'done') barColor = 'bg-emerald-500'
              if (task.status.toLowerCase() === 'in progress') barColor = 'bg-amber-500'

              return (
                <div key={task.id} className="h-12 border-b border-border/60 relative flex items-center">
                  <div 
                    className={`h-6 rounded-md ${barColor} text-white text-[10px] font-semibold px-2 flex items-center truncate shadow-sm cursor-pointer hover:brightness-105 transition-all`}
                    style={{
                      position: 'absolute',
                      left: `${leftPct}%`,
                      width: `${widthPct}%`
                    }}
                  >
                    <span className="truncate">{task.status}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // 4. Render Calendar View
  const renderCalendar = () => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    
    // Days in Month
    const totalDays = new Date(year, month + 1, 0).getDate()
    // First day of month (0 = Sun, 1 = Mon...)
    const firstDayIdx = new Date(year, month, 1).getDay()

    const days = []
    for (let i = 0; i < firstDayIdx; i++) {
      days.push(null)
    }
    for (let i = 1; i <= totalDays; i++) {
      days.push(i)
    }

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]

    return (
      <div className="flex flex-col h-full bg-background p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <CalendarIcon className="text-primary" />
            {monthNames[month]} {year}
          </h2>
          <div className="flex gap-2">
            <button 
              onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
              className="p-2 border border-border hover:bg-accent rounded-lg transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button 
              onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
              className="p-2 border border-border hover:bg-accent rounded-lg transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-muted-foreground mb-2">
          <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
        </div>

        <div className="grid grid-cols-7 gap-2 flex-1 min-h-[300px]">
          {days.map((day, idx) => {
            const dateStr = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : ''
            const dayTasks = day ? rows.filter(r => r.dueDate === dateStr) : []

            return (
              <div 
                key={idx} 
                className={`border border-border/80 rounded-xl p-2 min-h-[80px] flex flex-col gap-1 transition-all ${
                  day ? 'bg-background hover:border-primary/40' : 'bg-accent/10 opacity-30'
                }`}
              >
                {day && (
                  <span className="text-xs font-bold text-muted-foreground self-start">
                    {day}
                  </span>
                )}
                <div className="flex flex-col gap-1 overflow-y-auto max-h-[70px]">
                  {dayTasks.map(task => {
                    let dotColor = 'bg-blue-500'
                    if (task.status.toLowerCase() === 'done') dotColor = 'bg-emerald-500'
                    if (task.status.toLowerCase() === 'in progress') dotColor = 'bg-amber-500'
                    return (
                      <div 
                        key={task.id} 
                        className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-accent/20 truncate flex items-center gap-1"
                        title={task.name}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${dotColor} flex-shrink-0`} />
                        <span className="truncate">{task.name}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // 5. Render Form View
  const renderForm = () => {
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault()
      if (!formName.trim()) return

      const nextRowIdx = rows.length ? Math.max(...rows.map(r => r.id)) + 1 : 0
      
      updateCellValue(nextRowIdx, 0, formName)
      updateCellValue(nextRowIdx, 1, formStatus)
      updateCellValue(nextRowIdx, 2, formAssignee || 'Unassigned')
      updateCellValue(nextRowIdx, 3, formDueDate || '2026-06-03')

      setFormName('')
      setFormStatus('Todo')
      setFormAssignee('')
      setFormDueDate('')
      setFormSuccess(true)
      setTimeout(() => setFormSuccess(false), 3000)
    }

    return (
      <div className="flex items-center justify-center p-6 h-full bg-accent/10 overflow-y-auto">
        <div className="w-full max-w-lg bg-background rounded-2xl border border-border p-8 shadow-lg">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-foreground">Add New Task Form</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Submit this form to insert a record directly into the shared spreadsheet in real-time.
            </p>
          </div>

          {formSuccess && (
            <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 size={16} />
              Task successfully added to the sheet!
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Task Name *</label>
              <input
                type="text"
                required
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Implement user authentication"
                className="w-full h-10 px-3 border border-border rounded-xl bg-background text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Status</label>
                <select
                  value={formStatus}
                  onChange={e => setFormStatus(e.target.value)}
                  className="w-full h-10 px-3 border border-border rounded-xl bg-background text-sm focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="Todo">Todo</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Done">Done</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Assignee</label>
                <input
                  type="text"
                  value={formAssignee}
                  onChange={e => setFormAssignee(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full h-10 px-3 border border-border rounded-xl bg-background text-sm focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Due Date</label>
              <input
                type="date"
                value={formDueDate}
                onChange={e => setFormDueDate(e.target.value)}
                className="w-full h-10 px-3 border border-border rounded-xl bg-background text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            <button
              type="submit"
              className="h-10 mt-2 bg-primary text-primary-foreground font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-primary/95 active:scale-95 transition-all text-sm shadow-sm"
            >
              <Plus size={16} />
              Add Task
            </button>
          </form>
        </div>
      </div>
    )
  }

  // 6. Render Dashboard View
  const renderDashboard = () => {
    const total = rows.length
    const done = rows.filter(r => r.status.toLowerCase() === 'done').length
    const inProgress = rows.filter(r => r.status.toLowerCase() === 'in progress').length
    const todo = rows.filter(r => r.status.toLowerCase() === 'todo' || !['done', 'in progress'].includes(r.status.toLowerCase())).length

    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0

    return (
      <div className="p-6 bg-background/50 h-full overflow-y-auto flex flex-col gap-6">
        <h2 className="text-xl font-bold text-foreground">Project Summary Dashboard</h2>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-background border border-border rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Total Tasks</span>
            <span className="text-3xl font-extrabold mt-2 text-foreground">{total}</span>
          </div>
          <div className="bg-background border border-border rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Todo</span>
            <span className="text-3xl font-extrabold mt-2 text-blue-500">{todo}</span>
          </div>
          <div className="bg-background border border-border rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase">In Progress</span>
            <span className="text-3xl font-extrabold mt-2 text-amber-500">{inProgress}</span>
          </div>
          <div className="bg-background border border-border rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Completed</span>
            <span className="text-3xl font-extrabold mt-2 text-emerald-500">{done}</span>
          </div>
        </div>

        {/* Progress & Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-background border border-border rounded-2xl p-6 shadow-sm flex flex-col gap-4">
            <span className="text-sm font-semibold text-foreground">Project Completion Progress</span>
            <div className="relative pt-1">
              <div className="flex mb-2 items-center justify-between">
                <div>
                  <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-emerald-600 bg-emerald-200/50">
                    Done
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-emerald-600">
                    {completionRate}%
                  </span>
                </div>
              </div>
              <div className="overflow-hidden h-3 text-xs flex rounded-full bg-accent/40">
                <div 
                  style={{ width: `${completionRate}%` }} 
                  className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-emerald-500 transition-all duration-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-background border border-border rounded-2xl p-6 shadow-sm flex flex-col gap-4">
            <span className="text-sm font-semibold text-foreground">Task Status Breakdown</span>
            <div className="flex gap-2 h-6 rounded-full overflow-hidden w-full bg-accent/30 text-white text-xs font-semibold">
              <div 
                className="bg-blue-500 flex items-center justify-center transition-all" 
                style={{ width: `${total > 0 ? (todo / total) * 100 : 0}%` }}
                title={`Todo: ${todo}`}
              >
                {todo > 0 && `${Math.round((todo / total) * 100)}%`}
              </div>
              <div 
                className="bg-amber-500 flex items-center justify-center transition-all" 
                style={{ width: `${total > 0 ? (inProgress / total) * 100 : 0}%` }}
                title={`In Progress: ${inProgress}`}
              >
                {inProgress > 0 && `${Math.round((inProgress / total) * 100)}%`}
              </div>
              <div 
                className="bg-emerald-500 flex items-center justify-center transition-all" 
                style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
                title={`Done: ${done}`}
              >
                {done > 0 && `${Math.round((done / total) * 100)}%`}
              </div>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Todo</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> In Progress</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Done</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 7. Render Timeline View
  const renderTimeline = () => {
    // Sort rows chronologically
    const sortedTasks = [...rows].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    
    return (
      <div className="p-6 bg-background/50 h-full overflow-y-auto">
        <h2 className="text-xl font-bold text-foreground mb-6">Activity Timeline</h2>
        
        <div className="relative border-l-2 border-border/80 pl-6 ml-4 flex flex-col gap-6">
          {sortedTasks.map((task, idx) => {
            let iconColor = 'text-blue-500 border-blue-500 bg-blue-50/20'
            let StatusIcon = Circle
            
            if (task.status.toLowerCase() === 'done') {
              iconColor = 'text-emerald-500 border-emerald-500 bg-emerald-50/20'
              StatusIcon = CheckCircle2
            } else if (task.status.toLowerCase() === 'in progress') {
              iconColor = 'text-amber-500 border-amber-500 bg-amber-50/20'
              StatusIcon = Clock
            }

            return (
              <div key={task.id} className="relative group">
                {/* Timeline dot */}
                <div className={`absolute -left-[37px] top-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center bg-background shadow-sm ${iconColor}`}>
                  <StatusIcon size={12} />
                </div>
                
                <div className="bg-background border border-border hover:border-primary/50 transition-all rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="font-semibold text-sm text-foreground">{task.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/60 font-semibold text-muted-foreground">
                      {task.status}
                    </span>
                  </div>
                  <div className="flex gap-4 items-center mt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <User size={12} />
                      {task.assignee}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CalendarIcon size={12} />
                      Due: {task.dueDate}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Determine current active component based on UI Store
  const { viewMode } = useUIStore()

  switch (viewMode) {
    case 'kanban':
      return renderKanban()
    case 'gantt':
      return renderGantt()
    case 'calendar':
      return renderCalendar()
    case 'form':
      return renderForm()
    case 'dashboard':
      return renderDashboard()
    case 'timeline':
      return renderTimeline()
    case 'grid':
    default:
      return null
  }
}
