'use client'

import React, { useState, useEffect, useRef } from 'react'
import * as Y from 'yjs'
import { 
  Calendar as CalendarIcon, 
  User, 
  CheckCircle2, 
  Circle, 
  Clock, 
  Plus, 
  Columns, 
  GanttChart, 
  ChevronLeft, 
  ChevronRight, 
  AlertCircle,
  Briefcase,
  Users,
  TrendingUp,
  Percent,
  CalendarDays
} from 'lucide-react'
import { useGridStore, getCellKey } from '../../store/gridStore'
import { useUIStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
import { GanttCanvas } from './GanttCanvas'

const ROW_HEIGHT = 36

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

  // ─── PM / Resource Management State ───────────────────────
  const { accessToken, user } = useAuthStore()
  const workspaceId = user?.workspaceId ?? ''
  const [sheet, setSheet] = useState<any>(null)
  const [projects, setProjects] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [dbRows, setDbRows] = useState<any[]>([])
  const [allocations, setAllocations] = useState<any[]>([])
  const [resourceLoads, setResourceLoads] = useState<any>({})
  const [rollup, setRollup] = useState<any>(null)
  
  const [loadingResources, setLoadingResources] = useState(false)
  const [creatingAllocation, setCreatingAllocation] = useState(false)
  const [loggingTime, setLoggingTime] = useState(false)

  const [allocResource, setAllocResource] = useState('')
  const [allocPercent, setAllocPercent] = useState(50)
  const [allocStart, setAllocStart] = useState('2026-06-01')
  const [allocEnd, setAllocEnd] = useState('2026-06-30')
  const [timeRowId, setTimeRowId] = useState('')
  const [timeNote, setTimeNote] = useState('')
  const [timeHours, setTimeHours] = useState(8)
  const [timeSuccess, setTimeSuccess] = useState(false)
  const [allocSuccess, setAllocSuccess] = useState(false)

  // ─── Kanban & Calendar dynamic state ──────────────────────
  const [groupByColId, setGroupByColId] = useState<string>('')
  const [dateColId, setDateColId] = useState<string>('')

  // ─── Gantt States ───────────────────────────────────────────
  const [pmTasks, setPmTasks] = useState<any[]>([])
  const [baselines, setBaselines] = useState<any[]>([])
  const [zoomScale, setZoomScale] = useState<'day' | 'week' | 'month'>('day')
  const [selectedBaselineId, setSelectedBaselineId] = useState<string>('')
  const [baselineTasks, setBaselineTasks] = useState<any[] | null>(null)
  const [leftPaneWidth, setLeftPaneWidth] = useState(300)
  const leftScrollRef = useRef<HTMLDivElement>(null)
  const [ganttScrollTop, setGanttScrollTop] = useState(0)

  const { viewMode } = useUIStore()

  useEffect(() => {
    if (!accessToken || !workspaceId) return
    
    api.sheets.get(sheetId, { accessToken, workspaceId })
      .then(res => setSheet(res.data))
      .catch(err => console.error("Error loading sheet details:", err))

    api.users.list({ accessToken, workspaceId })
      .then(res => setUsers(res.data || []))
      .catch(err => {
        console.error("Error listing workspace users:", err)
        const uniqueAssignees = Array.from(new Set(getRows().map(r => r.assignee).filter(a => a && a !== 'Unassigned')))
        const fallbackUsers = uniqueAssignees.map((name, i) => ({
          id: `fallback-user-${i}`,
          name,
          email: `${name.toLowerCase().replace(/\s+/g, '')}@example.com`
        }))
        setUsers(fallbackUsers.length > 0 ? fallbackUsers : [{ id: 'current-user', name: 'John Doe', email: 'john@example.com' }])
      })

    api.pm.listProjects({ accessToken, workspaceId })
      .then(res => setProjects(res.data || []))
      .catch(err => console.error("Error listing projects:", err))
  }, [sheetId, accessToken, workspaceId])

  useEffect(() => {
    if ((viewMode === 'resources' || viewMode === 'gantt') && accessToken && workspaceId) {
      api.rows.list(sheetId, { accessToken, workspaceId })
        .then(res => setDbRows(res.data || []))
        .catch(err => console.error("Error loading db rows:", err))
    }
  }, [viewMode, sheetId, accessToken, workspaceId])

  const loadTasksAndBaselines = async (projectId: string) => {
    if (!accessToken || !workspaceId || !projectId) return
    try {
      const [tasksRes, baselinesRes] = await Promise.all([
        api.pm.listTasks(projectId, { accessToken, workspaceId }),
        api.pm.listBaselines(projectId, { accessToken, workspaceId })
      ])
      setPmTasks(tasksRes.data || [])
      setBaselines(baselinesRes.data || [])
    } catch (err) {
      console.error("Error loading tasks and baselines:", err)
    }
  }

  useEffect(() => {
    if (sheet?.projectId) {
      loadTasksAndBaselines(sheet.projectId)
    }
  }, [sheet?.projectId, accessToken, workspaceId])

  const loadPMData = async (projectId: string) => {
    if (!accessToken || !workspaceId || !projectId) return
    setLoadingResources(true)
    try {
      const [resAlloc, resRollup] = await Promise.all([
        api.pm.getResources(projectId, { accessToken, workspaceId }),
        api.pm.getRollup(projectId, { accessToken, workspaceId })
      ])
      setAllocations(resAlloc.data.allocations || [])
      setResourceLoads(resAlloc.data.resourceLoads || {})
      setRollup(resRollup.data || null)
    } catch (err) {
      console.error("Error loading PM resources/rollup:", err)
    } finally {
      setLoadingResources(false)
    }
  }

  useEffect(() => {
    if (viewMode === 'resources' && sheet?.projectId) {
      loadPMData(sheet.projectId)
    }
  }, [viewMode, sheet?.projectId])

  const handleLinkProject = async (projId: string) => {
    if (!accessToken || !workspaceId) return
    try {
      const res = await api.sheets.update(sheetId, { projectId: projId }, { accessToken, workspaceId })
      setSheet(res.data)
    } catch (err) {
      console.error("Error linking project:", err)
    }
  }

  const handleCreateProjectAndLink = async () => {
    if (!accessToken || !workspaceId || !sheet) return
    try {
      const resProj = await api.pm.createProject({ name: sheet.title }, { accessToken, workspaceId })
      if (resProj.data?.id) {
        const resSheet = await api.sheets.update(sheetId, { projectId: resProj.data.id }, { accessToken, workspaceId })
        setSheet(resSheet.data)
      }
    } catch (err) {
      console.error("Error creating and linking project:", err)
    }
  }

  const handleTaskChange = async (taskId: string, dates: { startDate: string; endDate: string }) => {
    if (!accessToken || !workspaceId || !sheet?.projectId) return
    try {
      const res = await api.pm.cascadeTask(sheet.projectId, taskId, dates, { accessToken, workspaceId })
      if (res.data?.updatedTasks) {
        setPmTasks(res.data.updatedTasks)
        loadPMData(sheet.projectId)
      }

      // Sync the updated end date back to the spreadsheet cell so Grid,
      // Calendar, Timeline, and all other views reflect the Gantt drag.
      const dateColIndex = columns.findIndex((c: any) => c.type === 'date' || c.type === 'datetime')
      const effectiveDateColIndex = dateColIndex >= 0 ? dateColIndex : 3

      const pmTask = pmTasks.find(t => t.id === taskId)
      if (pmTask?.rowId) {
        const dbRow = dbRows.find(r => r.id === pmTask.rowId)
        if (dbRow != null) {
          updateCellValue(dbRow.position, effectiveDateColIndex, dates.endDate)
        }
      } else if (taskId.startsWith('task-')) {
        // Fallback task ID format "task-{rowIndex}" used when pmTasks aren't loaded yet
        const rowIndex = parseInt(taskId.slice(5), 10)
        if (!isNaN(rowIndex)) {
          updateCellValue(rowIndex, effectiveDateColIndex, dates.endDate)
        }
      }
    } catch (err) {
      console.error("Failed to cascade task dates:", err)
      throw err
    }
  }

  const handleCreateBaseline = async () => {
    if (!accessToken || !workspaceId || !sheet?.projectId) return
    const name = prompt("Enter baseline name:", `Baseline ${new Date().toLocaleDateString()}`)
    if (!name) return
    try {
      await api.pm.createBaseline(sheet.projectId, { name }, { accessToken, workspaceId })
      const baselinesRes = await api.pm.listBaselines(sheet.projectId, { accessToken, workspaceId })
      setBaselines(baselinesRes.data || [])
    } catch (err) {
      console.error("Failed to create baseline:", err)
    }
  }

  const handleSelectBaseline = async (baselineId: string) => {
    setSelectedBaselineId(baselineId)
    if (!baselineId) {
      setBaselineTasks(null)
      return
    }
    if (!accessToken || !workspaceId || !sheet?.projectId) return
    try {
      const res = await api.pm.getBaseline(sheet.projectId, baselineId, { accessToken, workspaceId })
      if (res.data?.snapshot) {
        const snapshot = typeof res.data.snapshot === 'string' ? JSON.parse(res.data.snapshot) : res.data.snapshot
        setBaselineTasks(snapshot)
      }
    } catch (err) {
      console.error("Failed to load baseline snapshot:", err)
    }
  }

  const handleInjectTemplate = async (templateId: string) => {
    if (!accessToken || !workspaceId || !sheet?.projectId) return
    
    let rowIdsToUse = dbRows.map(r => r.id)
    if (rowIdsToUse.length < 5) {
      try {
        const rowsToInsert = Array.from({ length: 5 - rowIdsToUse.length }).map((_, i) => ({
          position: rowIdsToUse.length + i,
          cells: []
        }))
        const resInsert = await api.rows.insert(sheetId, rowsToInsert, { accessToken, workspaceId })
        if (resInsert.data) {
          const newRowIds = resInsert.data.map(r => r.id)
          rowIdsToUse = [...rowIdsToUse, ...newRowIds]
          const updatedRowsRes = await api.rows.list(sheetId, { accessToken, workspaceId })
          setDbRows(updatedRowsRes.data || [])
        }
      } catch (err) {
        console.error("Failed to create template rows:", err)
        return
      }
    }

    try {
      const res = await api.pm.injectTemplate(sheet.projectId, templateId, {
        sheetId,
        rowIds: rowIdsToUse.slice(0, 5)
      }, { accessToken, workspaceId })
      
      if (res.data) {
        res.data.forEach((t: any, idx: number) => {
          const rowObj = dbRows.find(r => r.id === t.rowId) || { position: idx }
          const pos = rowObj.position
          
          updateCellValue(pos, 0, t.name)
          updateCellValue(pos, 1, t.status || 'Todo')
          if (t.startDate) {
            updateCellValue(pos, 3, t.startDate.split('T')[0])
          }
        })
      }

      loadTasksAndBaselines(sheet.projectId)
      loadPMData(sheet.projectId)
    } catch (err) {
      console.error("Failed to inject template:", err)
    }
  }

  const handleLeftScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setGanttScrollTop((e.currentTarget as HTMLDivElement).scrollTop)
  }

  const handleResizerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = leftPaneWidth

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      setLeftPaneWidth(Math.max(150, Math.min(600, startWidth + deltaX)))
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }


  const handleCreateAllocation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken || !workspaceId || !sheet?.projectId || !allocResource) return
    setCreatingAllocation(true)
    try {
      await api.pm.createAllocation(sheet.projectId, {
        resourceId: allocResource,
        allocationPercent: Number(allocPercent),
        startDate: allocStart,
        endDate: allocEnd,
      }, { accessToken, workspaceId })
      setAllocSuccess(true)
      setTimeout(() => setAllocSuccess(false), 3000)
      loadPMData(sheet.projectId)
    } catch (err) {
      console.error("Failed to create allocation:", err)
    } finally {
      setCreatingAllocation(false)
    }
  }

  const handleLogTime = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken || !workspaceId || !sheet?.projectId || !timeRowId) return
    setLoggingTime(true)
    try {
      const tasksRes = await api.pm.listTasks(sheet.projectId, { accessToken, workspaceId })
      const taskExists = tasksRes.data?.some(t => t.rowId === timeRowId)
      if (!taskExists) {
        const dbRow = dbRows.find(r => r.id === timeRowId)
        const rowName = dbRow ? (getRows().find(gr => gr.id === dbRow.position)?.name || `Row #${dbRow.position + 1}`) : `Row`
        await api.pm.createTask(sheet.projectId, {
          sheetId,
          rowId: timeRowId,
          name: rowName,
        }, { accessToken, workspaceId })
      }

      const started = new Date()
      const ended = new Date()
      const startedAtStr = new Date(started.getTime() - timeHours * 3600 * 1000).toISOString()
      const endedAtStr = ended.toISOString()

      await api.pm.logTime({
        rowId: timeRowId,
        note: timeNote || `Logged ${timeHours} hours`,
        startedAt: startedAtStr,
        endedAt: endedAtStr,
      }, { accessToken, workspaceId })

      setTimeSuccess(true)
      setTimeNote('')
      setTimeout(() => setTimeSuccess(false), 3000)
      loadPMData(sheet.projectId)
    } catch (err) {
      console.error("Failed to log time:", err)
    } finally {
      setLoggingTime(false)
    }
  }

  // ─── Dynamic row reader (uses real column indices) ─────────
  const getDynamicRows = (): Array<{ rowIndex: number; cellValues: Record<number, string | null> }> => {
    const result: Array<{ rowIndex: number; cellValues: Record<number, string | null> }> = []
    const colCount = columns.length || 10
    for (let r = 0; r < 500; r++) {
      let hasData = false
      const cellValues: Record<number, string | null> = {}
      for (let c = 0; c < colCount; c++) {
        const val = store.cellCache.get(`r${r}c${c}`)
        if (val != null && val !== '') {
          hasData = true
          cellValues[c] = String(val)
        } else {
          cellValues[c] = null
        }
      }
      if (hasData) result.push({ rowIndex: r, cellValues })
    }
    return result
  }

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

  // 2. Render Kanban View (dynamic group-by)
  const renderKanban = () => {
    // Pick the group-by column (user choice or first dropdown/contact/text column)
    const groupableCols = columns.filter((c: any) => ['dropdown', 'contact', 'text', 'multi_select'].includes(c.type))
    const effectiveGroupColId = groupByColId || groupableCols[0]?.id || ''
    const groupByCol = columns.find((c: any) => c.id === effectiveGroupColId)
    const groupByColIndex = columns.findIndex((c: any) => c.id === effectiveGroupColId)

    // Pick the "name" column — first text col, or col 0
    const nameColIndex = Math.max(0, columns.findIndex((c: any) => c.type === 'text'))
    // Secondary info: first contact col (assignee) and first date col (due date)
    const assigneeColIndex = columns.findIndex((c: any) => c.type === 'contact')
    const dateColIndex = columns.findIndex((c: any) => c.type === 'date')

    // Lane values — from dropdown options, or unique values in cells
    const dropdownLanes: string[] = (groupByCol?.format?.dropdownOptions ?? []).map((o: any) => o.label)
    const dynamicRows = getDynamicRows()
    const usedLanes = Array.from(new Set(dynamicRows.map(r => r.cellValues[groupByColIndex] ?? ''))).filter(Boolean)
    const lanes: string[] = dropdownLanes.length > 0 ? dropdownLanes
      : usedLanes.length > 0 ? usedLanes
      : ['Todo', 'In Progress', 'Done']

    return (
      <div className="relative flex flex-col h-full bg-background/50 overflow-hidden">
        {/* Group-by picker */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-accent/5 text-xs flex-shrink-0">
          <span className="font-semibold text-muted-foreground">Group by:</span>
          {groupableCols.length > 0 ? (
            <select
              value={effectiveGroupColId}
              onChange={e => setGroupByColId(e.target.value)}
              className="h-7 px-2 border border-border rounded-lg bg-background text-xs focus:outline-none focus:border-primary transition-colors"
            >
              {groupableCols.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <span className="text-muted-foreground italic">No groupable columns — add a Dropdown or Contact column</span>
          )}
          <span className="ml-auto text-muted-foreground">{dynamicRows.length} rows · {lanes.length} lanes</span>
        </div>

        {/* Lanes */}
        <div className="flex gap-4 p-6 overflow-x-auto flex-1">
          {lanes.map(lane => {
            const laneRows = dynamicRows.filter(r =>
              (r.cellValues[groupByColIndex] ?? '') === lane
            )
            const noLaneRows = lane === lanes[0]
              ? dynamicRows.filter(r => !r.cellValues[groupByColIndex])
              : []
            const allLaneRows = [...laneRows, ...noLaneRows]

            return (
              <div key={lane} className="flex flex-col w-72 bg-accent/20 rounded-xl border border-border p-4 flex-shrink-0 min-h-[200px]">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-semibold text-sm flex items-center gap-2">
                    <Columns size={14} className="text-primary" />
                    {lane}
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-accent text-muted-foreground">
                    {allLaneRows.length}
                  </span>
                </div>

                <div className="flex flex-col gap-3 overflow-y-auto flex-1 pr-1">
                  {allLaneRows.map(row => {
                    const taskName = row.cellValues[nameColIndex] || `Row ${row.rowIndex + 1}`
                    const assignee = assigneeColIndex >= 0 ? (row.cellValues[assigneeColIndex] ?? '') : ''
                    const dueDate  = dateColIndex >= 0    ? (row.cellValues[dateColIndex]    ?? '') : ''

                    return (
                      <div
                        key={row.rowIndex}
                        className="p-3 bg-background border border-border hover:border-primary/50 transition-all rounded-lg shadow-sm flex flex-col gap-2 group"
                      >
                        <div className="font-medium text-sm text-foreground leading-snug">{taskName}</div>

                        {(assignee || dueDate) && (
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            {assignee && (
                              <span className="flex items-center gap-1 truncate">
                                <User size={11} />
                                <span className="truncate">{assignee}</span>
                              </span>
                            )}
                            {dueDate && (
                              <span className="flex items-center gap-1 ml-auto flex-shrink-0">
                                <CalendarIcon size={11} />
                                {dueDate}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Move buttons — shown on hover */}
                        <div className="flex flex-wrap gap-1 pt-2 border-t border-border/50 opacity-0 group-hover:opacity-100 transition-opacity">
                          {lanes.filter(l => l !== lane).map(targetLane => (
                            <button
                              key={targetLane}
                              onClick={() => updateCellValue(row.rowIndex, groupByColIndex, targetLane)}
                              className="text-[10px] px-2 py-1 bg-accent hover:bg-primary/10 hover:text-primary rounded transition-colors text-muted-foreground font-medium"
                            >
                              → {targetLane}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}

                  {allLaneRows.length === 0 && (
                    <div className="text-xs text-muted-foreground italic text-center py-6">No items</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // 3. Render Gantt View
  const renderGantt = () => {
    if (!sheet) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm bg-background">
          Loading sheet metadata...
        </div>
      )
    }

    if (!sheet.projectId) {
      return (
        <div className="flex items-center justify-center p-6 h-full bg-accent/5 overflow-y-auto">
          <div className="w-full max-w-lg bg-background rounded-2xl border border-border p-8 shadow-lg text-center flex flex-col gap-6 items-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Briefcase size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Project Management Integration Required</h2>
              <p className="text-xs text-muted-foreground mt-2 max-w-sm mx-auto">
                This sheet is not yet linked to a Project Management service project. Link it now to view and edit the interactive Gantt chart.
              </p>
            </div>

            <div className="w-full flex flex-col gap-3">
              <button
                onClick={handleCreateProjectAndLink}
                className="w-full h-10 bg-primary text-primary-foreground font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-primary/95 transition-all text-sm shadow-sm"
              >
                <Plus size={16} />
                Create New Project Named "{sheet.title}"
              </button>

              {projects.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border w-full text-left">
                  <label className="block text-xs font-semibold text-muted-foreground mb-2">Or link to an existing project:</label>
                  <div className="flex gap-2">
                    <select
                      onChange={(e) => {
                        if (e.target.value) handleLinkProject(e.target.value)
                      }}
                      className="flex-1 h-10 px-3 border border-border rounded-xl bg-background text-sm focus:outline-none focus:border-primary transition-colors"
                      defaultValue=""
                    >
                      <option value="" disabled>Select project...</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }

    const tasksToRender = pmTasks.length > 0 ? pmTasks : rows.map(r => {
      let startDate = '2026-06-01'
      let endDate = '2026-06-03'
      
      try {
        const d = new Date(r.dueDate)
        if (!isNaN(d.getTime())) {
          endDate = d.toISOString().split('T')[0]
          startDate = new Date(d.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        }
      } catch (e) {
        // Fallback to defaults
      }

      return {
        id: `task-${r.id}`,
        name: r.name,
        startDate,
        endDate,
        durationDays: 3,
        status: r.status,
        isCritical: false,
        floatDays: 0,
      }
    })

    const handleFitToProject = () => {
      if (tasksToRender.length === 0) return
      let minDate = new Date()
      let maxDate = new Date()
      let first = true
      tasksToRender.forEach(t => {
        if (t.startDate && t.endDate) {
          const s = new Date(t.startDate)
          const e = new Date(t.endDate)
          if (first || s < minDate) minDate = s
          if (first || e > maxDate) maxDate = e
          first = false
        }
      })
      if (first) return
      const days = (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24) + 1
      
      // Target width is roughly 800px
      if (days <= 30) {
        setZoomScale('day')
      } else if (days <= 180) {
        setZoomScale('week')
      } else {
        setZoomScale('month')
      }
    }

    const criticalIds = pmTasks.filter(t => t.isCritical).map(t => t.id)

    return (
      <div className="flex flex-col h-full bg-background overflow-hidden" ref={leftScrollRef}>
        {/* Gantt Toolbar */}
        <div className="flex items-center justify-between p-3 border-b border-border bg-accent/5 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold flex items-center gap-2">
              <GanttChart size={16} className="text-primary animate-pulse" />
              Project Schedule Timeline
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            {/* Scale controls */}
            <div className="flex bg-accent/40 p-0.5 rounded-lg border border-border">
              {(['day', 'week', 'month'] as const).map(scale => (
                <button
                  key={scale}
                  onClick={() => setZoomScale(scale)}
                  className={`px-3 py-1 rounded-md font-medium capitalize transition-colors ${
                    zoomScale === scale ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-accent text-muted-foreground'
                  }`}
                >
                  {scale}
                </button>
              ))}
            </div>

            <button
              onClick={handleFitToProject}
              className="px-3 py-1.5 border border-border hover:bg-accent rounded-lg font-medium text-muted-foreground transition-colors"
            >
              Fit Timeline
            </button>

            {/* Template picker */}
            <select
              onChange={(e) => {
                if (e.target.value) {
                  handleInjectTemplate(e.target.value)
                  e.target.value = ''
                }
              }}
              className="h-8 px-2 border border-border rounded-lg bg-background font-medium text-muted-foreground focus:outline-none focus:border-primary transition-colors"
              defaultValue=""
            >
              <option value="" disabled>Apply Template...</option>
              <option value="waterfall">Waterfall Phases</option>
              <option value="sprint">2-Week Sprint Cycle</option>
              <option value="product-launch">Product Launch Tracks</option>
              <option value="it-infrastructure">IT Infrastructure Setup</option>
            </select>

            {/* Baseline comparison */}
            <div className="flex items-center gap-1.5 border-l border-border pl-2">
              <button
                onClick={handleCreateBaseline}
                className="px-3 py-1.5 bg-accent/60 hover:bg-accent border border-border rounded-lg font-medium text-muted-foreground transition-colors flex items-center gap-1"
              >
                Save Baseline
              </button>

              {baselines.length > 0 && (
                <select
                  value={selectedBaselineId}
                  onChange={(e) => handleSelectBaseline(e.target.value)}
                  className="h-8 px-2 border border-border rounded-lg bg-background font-medium text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="">No Baseline Compare</option>
                  {baselines.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Resizable Split-Pane View */}
        <div className="flex flex-1 overflow-hidden relative">
          {/* Left Pane (Task Details Sidebar) */}
          <div
            ref={leftScrollRef}
            onScroll={handleLeftScroll}
            style={{ width: `${leftPaneWidth}px` }}
            className="border-r border-border flex-shrink-0 bg-accent/5 overflow-y-auto select-none"
          >
            <div className="h-10 border-b border-border flex items-center px-4 text-xs font-semibold text-muted-foreground uppercase bg-accent/10">
              Task Details
            </div>
            {tasksToRender.map((task, idx) => (
              <div
                key={task.id}
                style={{ height: `${ROW_HEIGHT}px` }}
                className="border-b border-border/40 flex items-center justify-between px-4 truncate hover:bg-accent/10"
              >
                <div className="flex flex-col truncate">
                  <span className="font-semibold text-xs text-foreground truncate">
                    {task.name || `Task #${idx + 1}`}
                  </span>
                  <span className="text-[9px] text-muted-foreground truncate uppercase font-bold">
                    {task.status || 'Todo'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Resizer Divider */}
          <div
            onMouseDown={handleResizerMouseDown}
            className="w-1 bg-border hover:bg-primary/50 cursor-col-resize flex-shrink-0 transition-colors relative z-10"
            title="Drag to resize sidebar"
          />

          {/* Right Pane (Gantt Canvas) */}
          <GanttCanvas
            tasks={tasksToRender}
            zoomScale={zoomScale}
            criticalPathTaskIds={criticalIds}
            baselineTasks={baselineTasks}
            scrollTop={ganttScrollTop}
            onScroll={setGanttScrollTop}
            onTaskChange={handleTaskChange}
          />
        </div>
      </div>
    )
  }

  // 4. Render Calendar View (dynamic date column)
  const renderCalendar = () => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const today = new Date()

    // Determine the date column to display
    const dateCols = columns.filter((c: any) => c.type === 'date' || c.type === 'datetime')
    const effectiveDateColId = dateColId || dateCols[0]?.id || ''
    const dateColIndex = columns.findIndex((c: any) => c.id === effectiveDateColId)
    // Name column — first text column or col 0
    const nameColIndex = Math.max(0, columns.findIndex((c: any) => c.type === 'text'))
    // Status column — first dropdown/text column after name
    const statusColIndex = columns.findIndex((c: any, i: number) => i > nameColIndex && ['dropdown', 'text'].includes(c.type))

    const dynamicRows = getDynamicRows()

    // Build a day → rows map for the current month
    const dayRowsMap = new Map<string, typeof dynamicRows>()
    for (const row of dynamicRows) {
      const rawDate = dateColIndex >= 0 ? (row.cellValues[dateColIndex] ?? '') : ''
      if (!rawDate) continue
      // Normalise to YYYY-MM-DD
      const dayKey = rawDate.slice(0, 10)
      if (!dayRowsMap.has(dayKey)) dayRowsMap.set(dayKey, [])
      dayRowsMap.get(dayKey)!.push(row)
    }

    // Build calendar grid
    const totalDays = new Date(year, month + 1, 0).getDate()
    const firstDayIdx = new Date(year, month, 1).getDay()
    const days: (number | null)[] = []
    for (let i = 0; i < firstDayIdx; i++) days.push(null)
    for (let i = 1; i <= totalDays; i++) days.push(i)

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ]

    return (
      <div className="flex flex-col h-full bg-background overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-border bg-accent/5 flex-shrink-0 flex-wrap">
          <h2 className="text-base font-bold flex items-center gap-2">
            <CalendarIcon size={16} className="text-primary" />
            {monthNames[month]} {year}
          </h2>

          <div className="flex gap-1.5 ml-1">
            <button
              onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
              className="p-1.5 border border-border hover:bg-accent rounded-lg transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
              className="p-1.5 border border-border hover:bg-accent rounded-lg transition-colors"
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => setCurrentMonth(new Date())}
              className="px-3 py-1.5 text-xs border border-border hover:bg-accent rounded-lg transition-colors font-medium text-muted-foreground"
            >
              Today
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto text-xs">
            <span className="text-muted-foreground font-semibold">Date column:</span>
            {dateCols.length > 0 ? (
              <select
                value={effectiveDateColId}
                onChange={e => setDateColId(e.target.value)}
                className="h-7 px-2 border border-border rounded-lg bg-background text-xs focus:outline-none focus:border-primary transition-colors"
              >
                {dateCols.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            ) : (
              <span className="text-muted-foreground italic">No date columns</span>
            )}
          </div>
        </div>

        {/* Calendar grid */}
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-muted-foreground mb-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5" style={{ gridAutoRows: 'minmax(80px, auto)' }}>
            {days.map((day, idx) => {
              const dateStr = day
                ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                : ''
              const isToday = day != null
                && today.getFullYear() === year
                && today.getMonth() === month
                && today.getDate() === day
              const dayRows = dateStr ? (dayRowsMap.get(dateStr) ?? []) : []

              return (
                <div
                  key={idx}
                  className={`border rounded-lg p-1.5 flex flex-col gap-1 transition-all text-xs ${
                    !day
                      ? 'bg-accent/5 border-transparent opacity-0 pointer-events-none'
                      : isToday
                        ? 'bg-primary/5 border-primary/40'
                        : 'bg-background border-border/60 hover:border-primary/30'
                  }`}
                >
                  {day && (
                    <span className={`font-bold self-start leading-none mb-0.5 ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                      {day}
                    </span>
                  )}
                  <div className="flex flex-col gap-0.5 overflow-y-auto max-h-[72px]">
                    {dayRows.map(row => {
                      const name   = row.cellValues[nameColIndex]   ?? `Row ${row.rowIndex + 1}`
                      const status = statusColIndex >= 0 ? (row.cellValues[statusColIndex] ?? '') : ''
                      const dotColor =
                        /done|complete/i.test(status) ? 'bg-emerald-500' :
                        /progress/i.test(status)      ? 'bg-amber-500'   : 'bg-blue-500'
                      return (
                        <div
                          key={row.rowIndex}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-accent/20 truncate flex items-center gap-1 cursor-default"
                          title={`${name}${status ? ` · ${status}` : ''}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
                          <span className="truncate">{name}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
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

  // 8. Render Resources & Workload View
  const renderResources = () => {
    if (!sheet) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Loading sheet metadata...
        </div>
      )
    }

    if (!sheet.projectId) {
      return (
        <div className="flex items-center justify-center p-6 h-full bg-accent/5 overflow-y-auto">
          <div className="w-full max-w-lg bg-background rounded-2xl border border-border p-8 shadow-lg text-center flex flex-col gap-6 items-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Briefcase size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Project Management Integration Required</h2>
              <p className="text-xs text-muted-foreground mt-2 max-w-sm mx-auto">
                This sheet is not yet linked to a Project Management service project. Link it now to track resource capacities, workloads, and timesheets.
              </p>
            </div>

            <div className="w-full flex flex-col gap-3">
              <button
                onClick={handleCreateProjectAndLink}
                className="w-full h-10 bg-primary text-primary-foreground font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-primary/95 transition-all text-sm shadow-sm"
              >
                <Plus size={16} />
                Create New Project Named "{sheet.title}"
              </button>

              {projects.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border w-full text-left">
                  <label className="block text-xs font-semibold text-muted-foreground mb-2">Or link to an existing project:</label>
                  <div className="flex gap-2">
                    <select
                      onChange={(e) => {
                        if (e.target.value) handleLinkProject(e.target.value)
                      }}
                      className="flex-1 h-10 px-3 border border-border rounded-xl bg-background text-sm focus:outline-none focus:border-primary transition-colors"
                      defaultValue=""
                    >
                      <option value="" disabled>Select project...</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-col lg:flex-row h-full bg-background overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-6 border-r border-border h-full">
          <div className="flex items-center justify-between border-b border-border/80 pb-4">
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Users className="text-primary" size={20} />
                Resource Workload & Capacity Planning
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Monitor team member allocations across projects and detect resource bottlenecks.
              </p>
            </div>
            {loadingResources && (
              <span className="text-xs text-muted-foreground animate-pulse font-medium">Refreshing...</span>
            )}
          </div>

          {/* Rollup Statistics */}
          {rollup && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-accent/10 border border-border rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  Completed Tasks
                </span>
                <span className="text-3xl font-extrabold mt-2 text-foreground">
                  {rollup.completedTasks} <span className="text-sm font-medium text-muted-foreground">/ {rollup.totalTasks}</span>
                </span>
              </div>
              <div className="bg-accent/10 border border-border rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
                  <TrendingUp size={14} className="text-primary" />
                  Project Rollup Progress
                </span>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-3xl font-extrabold text-foreground">{Math.round(rollup.progressPercent)}%</span>
                  <div className="w-24 h-2 bg-accent rounded-full overflow-hidden">
                    <div 
                      className="bg-primary h-full transition-all duration-300"
                      style={{ width: `${rollup.progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="bg-accent/10 border border-border rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
                  <Clock size={14} className="text-amber-500" />
                  Effort Rollup
                </span>
                <div className="flex flex-col mt-2">
                  <span className="text-3xl font-extrabold text-foreground">{rollup.actualLoggedHours.toFixed(1)} <span className="text-sm font-medium text-muted-foreground">hrs logged</span></span>
                  <span className="text-[10px] text-muted-foreground mt-1">Scheduled: {rollup.totalScheduledDays * 8} hours ({rollup.totalScheduledDays} days)</span>
                </div>
              </div>
            </div>
          )}

          {/* Allocated workloads per resource */}
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-bold text-foreground">Team Resource Capacity Loads</h3>
            
            {users.length === 0 ? (
              <div className="text-center py-6 text-xs text-muted-foreground">
                No users found in this workspace.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {users.map(u => {
                  const load = resourceLoads[u.id] || { totalLoad: 0, allocations: [], isOverAllocated: false }
                  const barColor = load.totalLoad > 100 ? 'bg-rose-500' : 'bg-emerald-500'
                  
                  return (
                    <div 
                      key={u.id}
                      className="border border-border/80 rounded-xl p-4 bg-background hover:border-primary/30 transition-all flex flex-col gap-3 shadow-sm"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-accent text-accent-foreground font-bold flex items-center justify-center text-xs">
                            {u.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-sm text-foreground">{u.name}</div>
                            <div className="text-[10px] text-muted-foreground">{u.email}</div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {load.totalLoad > 100 && (
                            <span className="flex items-center gap-1 text-xs font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                              <AlertCircle size={12} />
                              Over-allocated
                            </span>
                          )}
                          <span className="text-sm font-bold text-foreground">{load.totalLoad}% capacity</span>
                        </div>
                      </div>

                      {/* Progress load bar */}
                      <div className="w-full h-2 bg-accent/40 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all ${barColor}`}
                          style={{ width: `${Math.min(100, load.totalLoad)}%` }}
                        />
                      </div>

                      {/* Detail list of allocations */}
                      {load.allocations && load.allocations.length > 0 ? (
                        <div className="mt-2 border-t border-border/50 pt-2 flex flex-col gap-2">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground">Allocation Periods:</span>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {load.allocations.map((a: any) => {
                              const isCurrentProj = a.projectId === sheet.projectId
                              return (
                                <div 
                                  key={a.id}
                                  className={`text-xs p-2 rounded-lg border flex flex-col gap-1 ${
                                    isCurrentProj ? 'bg-primary/5 border-primary/20' : 'bg-accent/5 border-border'
                                  }`}
                                >
                                  <div className="flex justify-between font-semibold">
                                    <span className="text-muted-foreground truncate">
                                      {isCurrentProj ? 'This Project' : `Other Project (${a.projectId.slice(0, 5)})`}
                                    </span>
                                    <span className="text-foreground">{a.allocationPercent}%</span>
                                  </div>
                                  <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                    <CalendarDays size={10} />
                                    {new Date(a.startDate).toLocaleDateString()} - {new Date(a.endDate).toLocaleDateString()}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-muted-foreground italic">No allocations assigned.</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Panel for Forms */}
        <div className="w-full lg:w-96 p-6 overflow-y-auto h-full flex flex-col gap-6 bg-accent/5">
          {/* Form 1: Create Resource Allocation */}
          <div className="bg-background rounded-2xl border border-border p-5 shadow-sm">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-1">
              <Percent className="text-primary" size={16} />
              Allocate Workload
            </h3>
            <p className="text-[10px] text-muted-foreground mb-4">
              Assign capacity allocation percentage to a resource for a specific time range.
            </p>

            {allocSuccess && (
              <div className="mb-4 p-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs rounded-xl flex items-center gap-1.5">
                <CheckCircle2 size={14} />
                Workload allocation created!
              </div>
            )}

            <form onSubmit={handleCreateAllocation} className="flex flex-col gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Team Member *</label>
                <select
                  required
                  value={allocResource}
                  onChange={e => setAllocResource(e.target.value)}
                  className="w-full h-9 px-2 border border-border rounded-lg bg-background text-xs focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="" disabled>Select resource...</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground mb-1 font-medium">Allocation Percent * ({allocPercent}%)</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={allocPercent}
                  onChange={e => setAllocPercent(Number(e.target.value))}
                  className="w-full h-8 accent-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={allocStart}
                    onChange={e => setAllocStart(e.target.value)}
                    className="w-full h-9 px-2 border border-border rounded-lg bg-background text-xs focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground mb-1">End Date *</label>
                  <input
                    type="date"
                    required
                    value={allocEnd}
                    onChange={e => setAllocEnd(e.target.value)}
                    className="w-full h-9 px-2 border border-border rounded-lg bg-background text-xs focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={creatingAllocation}
                className="w-full h-9 mt-1 bg-primary text-primary-foreground font-semibold rounded-lg text-xs hover:bg-primary/95 transition-all shadow-sm flex items-center justify-center gap-1.5"
              >
                {creatingAllocation ? 'Allocating...' : 'Assign Allocation'}
              </button>
            </form>
          </div>

          {/* Form 2: Log Task Time */}
          <div className="bg-background rounded-2xl border border-border p-5 shadow-sm">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-1">
              <Clock className="text-primary" size={16} />
              Log Effort Time
            </h3>
            <p className="text-[10px] text-muted-foreground mb-4">
              Log actual spent hours against a row task to calculate project rollup stats.
            </p>

            {timeSuccess && (
              <div className="mb-4 p-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs rounded-xl flex items-center gap-1.5">
                <CheckCircle2 size={14} />
                Time logged successfully!
              </div>
            )}

            <form onSubmit={handleLogTime} className="flex flex-col gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Select Task / Row *</label>
                <select
                  required
                  value={timeRowId}
                  onChange={e => setTimeRowId(e.target.value)}
                  className="w-full h-9 px-2 border border-border rounded-lg bg-background text-xs focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="" disabled>Select row...</option>
                  {dbRows.map(r => {
                    const rowName = getRows().find(gr => gr.id === r.position)?.name || `Row #${r.position + 1}`
                    return (
                      <option key={r.id} value={r.id}>
                        {rowName} (Row {r.position + 1})
                      </option>
                    )
                  })}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Logged Hours *</label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    required
                    value={timeHours}
                    onChange={e => setTimeHours(Number(e.target.value))}
                    className="w-full h-9 px-2 border border-border rounded-lg bg-background text-xs focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Logged By</label>
                  <input
                    type="text"
                    disabled
                    value="Current User"
                    className="w-full h-9 px-2 border border-border rounded-lg bg-accent/40 text-muted-foreground text-xs cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Task Note / Comment</label>
                <textarea
                  value={timeNote}
                  onChange={e => setTimeNote(e.target.value)}
                  placeholder="e.g. Worked on styling the grid..."
                  className="w-full h-16 p-2 border border-border rounded-lg bg-background text-xs focus:outline-none focus:border-primary transition-colors resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={loggingTime}
                className="w-full h-9 mt-1 bg-primary text-primary-foreground font-semibold rounded-lg text-xs hover:bg-primary/95 transition-all shadow-sm flex items-center justify-center gap-1.5"
              >
                {loggingTime ? 'Logging Time...' : 'Submit Log Entry'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

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
    case 'resources':
      return renderResources()
    case 'grid':
    default:
      return null
  }
}
