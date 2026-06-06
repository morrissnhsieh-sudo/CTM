'use client'

import {
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
  Hash,
  Calendar,
  ChevronDown,
  Undo2,
  Redo2,
  User,
  Highlighter,
  Sidebar,
  FilePlus,
  FolderPlus,
  Copy,
  FileSpreadsheet,
  ChevronRight,
  Edit3,
  Trash,
  FolderSymlink,
  Cloud,
  Users,
  HelpCircle,
  Sparkles,
  Paperclip,
} from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { useGridStore } from '../../store/gridStore'
import { useUIStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'
import type { ColumnType } from '@ctm/shared-types'
import { ManageMembersModal } from '../navigation/ManageMembersModal'

const COLUMN_TYPES: { type: ColumnType; label: string; icon: React.ReactNode }[] = [
  { type: 'text', label: 'Text', icon: <Type size={12} /> },
  { type: 'number', label: 'Number', icon: <Hash size={12} /> },
  { type: 'currency', label: 'Currency', icon: <span className="font-semibold text-[10px] w-3 h-3 flex items-center justify-center">$</span> },
  { type: 'date', label: 'Date', icon: <Calendar size={12} /> },
  { type: 'datetime', label: 'Date & Time', icon: <Calendar size={12} /> },
  { type: 'checkbox', label: 'Checkbox', icon: <span className="text-[10px] w-3 h-3 flex items-center justify-center">☑</span> },
  { type: 'dropdown', label: 'Dropdown', icon: <ChevronDown size={12} /> },
  { type: 'multi_select', label: 'Multi-select', icon: <ChevronDown size={12} /> },
  { type: 'contact', label: 'Contact', icon: <User size={12} /> },
  { type: 'attachment', label: 'Attachment', icon: <span className="text-[10px] w-3 h-3 flex items-center justify-center">📎</span> },
  { type: 'formula', label: 'Formula', icon: <span className="font-mono text-[10px] w-3 h-3 flex items-center justify-center">fx</span> },
  { type: 'url', label: 'URL', icon: <span className="text-[10px] w-3 h-3 flex items-center justify-center">🔗</span> },
  { type: 'auto_number', label: 'Auto-number', icon: <span className="text-[10px] w-3 h-3 flex items-center justify-center">🔢</span> },
  { type: 'ai_generated', label: 'AI Generated', icon: <span className="text-[10px] w-3 h-3 flex items-center justify-center">🤖</span> },
]

export function SheetToolbar() {
  const { activeCell, applyFormat, undo, redo, formatCache, columns, updateColumn } = useGridStore()
  const {
    toggleRightPanel,
    rightPanelOpen,
    highlightChangesEnabled,
    highlightChangesTimeframe,
    setHighlightChangesEnabled,
    setHighlightChangesTimeframe,
    leftSidebarOpen,
    toggleLeftSidebar,
    attachmentsPanelOpen,
    toggleAttachmentsPanel,
  } = useUIStore()
  const params = useParams()
  const router = useRouter()
  const sheetId = params?.sheetId as string
  const workspaceId = params?.workspaceId as string
  const { accessToken, user, setAuth } = useAuthStore()

  // Profile modal state
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileAvatar, setProfileAvatar] = useState('')
  const [profileOrg, setProfileOrg] = useState('')
  const [profileEmpId, setProfileEmpId] = useState('')
  const [profileTel, setProfileTel] = useState('')

  // State to track if title editing
  const [sheetTitle, setSheetTitle] = useState('')
  const [currentSheet, setCurrentSheet] = useState<any>(null)
  const [allSheets, setAllSheets] = useState<any[]>([])
  const [openSheetSubmenuOpen, setOpenSheetSubmenuOpen] = useState(false)
  const [membersModalOpen, setMembersModalOpen] = useState(false)

  // Custom Create Sheet / Folder Dialog state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createType, setCreateType] = useState<'sheet' | 'folder'>('sheet')
  const [createName, setCreateName] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [projectsList, setProjectsList] = useState<any[]>([])
  const [allFolders, setAllFolders] = useState<any[]>([])

  // Menu bar states
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const menuBarRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Column types & highlight states
  const [columnDropdownOpen, setColumnDropdownOpen] = useState(false)
  const [highlightDropdownOpen, setHighlightDropdownOpen] = useState(false)
  
  const columnDropdownRef = useRef<HTMLDivElement>(null)
  const highlightDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (user) {
      setProfileName(user.name || '')
      setProfileAvatar(user.avatarUrl || '')
      setProfileOrg(user.organizationName || '')
      setProfileEmpId(user.employeeId || '')
      setProfileTel(user.tel || '')
    }
  }, [user])

  useEffect(() => {
    if (!accessToken || !sheetId || !workspaceId) return
    api.sheets.get(sheetId, { accessToken, workspaceId })
      .then(res => {
        setCurrentSheet(res.data)
        if (res.data) setSheetTitle(res.data.title || '')
      })
      .catch(err => console.error(err))
  }, [sheetId, accessToken, workspaceId])

  const fetchAllSheets = async () => {
    if (!accessToken || !workspaceId) return
    try {
      const res = await api.sheets.list({ accessToken, workspaceId })
      setAllSheets(res.data || [])
    } catch (err) {
      console.error(err)
    }
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken || !user || !workspaceId) return
    try {
      const res = await api.users.updateMe(
        {
          name: profileName,
          avatarUrl: profileAvatar || null,
          organizationName: profileOrg || null,
          employeeId: profileEmpId || null,
          tel: profileTel || null,
        },
        { accessToken, workspaceId }
      )
      if (res.data) {
        setAuth({
          ...user,
          name: res.data.name,
          avatarUrl: res.data.avatarUrl,
          organizationName: res.data.organizationName,
          employeeId: res.data.employeeId,
          tel: res.data.tel,
        }, accessToken)
        setProfileModalOpen(false)
        alert('Profile updated successfully!')
      }
    } catch (err) {
      console.error('Failed to update profile:', err)
      alert('Failed to update profile.')
    }
  }

  const openCreateModal = async (type: 'sheet' | 'folder') => {
    setCreateType(type)
    setCreateName(type === 'sheet' ? 'Untitled Sheet' : 'New Folder')
    setSelectedProjectId('')
    setCreateModalOpen(true)
    setActiveMenu(null)
    if (accessToken && workspaceId) {
      try {
        const [projectsRes, foldersRes, sheetsRes] = await Promise.all([
          api.pm.listProjects({ accessToken, workspaceId }).catch(() => ({ data: [] })),
          api.folders.list({ accessToken, workspaceId }).catch(() => ({ data: [] })),
          api.sheets.list({ accessToken, workspaceId }).catch(() => ({ data: [] }))
        ])
        setProjectsList(projectsRes.data || [])
        setAllFolders(foldersRes.data || [])
        setAllSheets(sheetsRes.data || [])
      } catch (err) {
        console.error('Failed to load projects for creation modal:', err)
      }
    }
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken || !createName.trim()) return
    const nameOrTitle = createName.trim()
    const projectId = selectedProjectId

    if (!projectId) {
      alert('Please select a project. Folders/sheets cannot exist in General.')
      return
    }

    try {
      if (createType === 'sheet') {
        // Uniqueness validation
        const isDuplicate = allSheets.some(s => 
          s.projectId === projectId && 
          s.folderId === null && 
          s.title.toLowerCase() === nameOrTitle.toLowerCase()
        )
        if (isDuplicate) {
          alert(`A sheet named "${nameOrTitle}" already exists in this location. Please choose a different name.`)
          return
        }

        const res = await api.sheets.create(
          { title: nameOrTitle, projectId },
          { accessToken, workspaceId }
        )
        if (res.data?.id) {
          router.push(`/${workspaceId}/sheets/${res.data.id}`)
        }
      } else {
        // Uniqueness validation
        const isDuplicate = allFolders.some(f => 
          (f.projectId || f.ProjectID || f.projectId) === projectId && 
          f.parentId === null && 
          f.name.toLowerCase() === nameOrTitle.toLowerCase()
        )
        if (isDuplicate) {
          alert(`A folder named "${nameOrTitle}" already exists in this location. Please choose a different name.`)
          return
        }

        await api.folders.create(
          { name: nameOrTitle, projectId },
          { accessToken, workspaceId }
        )
        alert(`Folder "${nameOrTitle}" created successfully.`)
        router.refresh()
      }
      setCreateModalOpen(false)
    } catch (err) {
      console.error(`Failed to create ${createType}:`, err)
      alert(`Failed to create ${createType}.`)
    }
  }

  const handleNewProject = async () => {
    if (!accessToken) return
    const name = prompt('Enter name for the new project:')
    if (!name) return
    try {
      await api.pm.createProject({ name }, { accessToken, workspaceId })
      setActiveMenu(null)
      alert(`Project "${name}" created successfully.`)
    } catch (err) {
      console.error('Failed to create project:', err)
      alert('Failed to create project. Verify you have administrator or project manager privileges.')
    }
  }

  const handleSaveAsNew = async () => {
    if (!accessToken || !sheetId) return
    const originalTitle = currentSheet?.title || 'Sheet'
    const promptTitle = prompt('Enter title for the new copied sheet:', `Copy of ${originalTitle}`)
    if (promptTitle === null) return
    try {
      const res = await api.sheets.copy(
        sheetId,
        { title: promptTitle, includeData: true },
        { accessToken, workspaceId }
      )
      if (res.data?.sheet?.id) {
        router.push(`/${workspaceId}/sheets/${res.data.sheet.id}`)
      }
      setActiveMenu(null)
    } catch (err) {
      console.error('Failed to copy sheet:', err)
      alert('Failed to copy sheet.')
    }
  }

  const handleSaveAsTemplate = async () => {
    if (!accessToken || !sheetId) return
    const originalTitle = currentSheet?.title || 'Sheet'
    const promptTitle = prompt('Enter title for the new template sheet:', `${originalTitle} Template`)
    if (promptTitle === null) return
    try {
      const res = await api.sheets.copy(
        sheetId,
        { title: promptTitle, includeData: false },
        { accessToken, workspaceId }
      )
      if (res.data?.sheet?.id) {
        router.push(`/${workspaceId}/sheets/${res.data.sheet.id}`)
      }
      setActiveMenu(null)
    } catch (err) {
      console.error('Failed to save as template:', err)
      alert('Failed to save as template.')
    }
  }

  const handleRenameActiveSheet = () => {
    setActiveMenu(null)
    titleInputRef.current?.focus()
    titleInputRef.current?.select()
  }

  const handleRenameSubmit = async () => {
    if (!sheetTitle.trim() || sheetTitle === currentSheet?.title || !accessToken || !sheetId) return
    try {
      const res = await api.sheets.update(sheetId, { title: sheetTitle }, { accessToken, workspaceId })
      if (res.data) {
        setCurrentSheet(res.data)
        router.refresh()
      }
    } catch (err) {
      console.error('Failed to rename sheet:', err)
      setSheetTitle(currentSheet?.title || '')
    }
  }

  const handleDeleteActiveSheet = async () => {
    if (!accessToken || !sheetId) return
    const currentTitle = currentSheet?.title || 'this sheet'
    if (!confirm(`Are you sure you want to delete the sheet "${currentTitle}"?`)) return
    try {
      await api.sheets.delete(sheetId, { accessToken, workspaceId })
      setActiveMenu(null)
      router.push(`/${workspaceId}`)
    } catch (err) {
      console.error('Failed to delete sheet:', err)
      alert('Failed to delete sheet.')
    }
  }

  const handleShareClick = () => {
    if (currentSheet?.projectId || currentSheet?.folderId) {
      setMembersModalOpen(true)
    } else {
      alert(
        'This sheet is currently stored at the root of the workspace and is accessible to all workspace members. To customize sharing, please move the sheet into a specific folder or project using the Workspace Explorer.'
      )
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuBarRef.current && !menuBarRef.current.contains(event.target as Node)) {
        setActiveMenu(null)
        setOpenSheetSubmenuOpen(false)
      }
      if (columnDropdownRef.current && !columnDropdownRef.current.contains(event.target as Node)) {
        setColumnDropdownOpen(false)
      }
      if (highlightDropdownRef.current && !highlightDropdownRef.current.contains(event.target as Node)) {
        setHighlightDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const cellRef = activeCell
    ? `${String.fromCharCode(65 + activeCell.col)}${activeCell.row + 1}`
    : ''

  const activeKey = activeCell ? `r${activeCell.row}c${activeCell.col}` : ''
  const activeFormat = activeKey ? formatCache.get(activeKey) || {} : {}

  const isBold = !!activeFormat.bold
  const isItalic = !!activeFormat.italic
  const textAlign = activeFormat.textAlign || 'left'

  const activeCol = activeCell && columns[activeCell.col]

  const handleTypeChange = async (type: ColumnType) => {
    if (!activeCol || !accessToken || !sheetId || !workspaceId) return
    setColumnDropdownOpen(false)
    setActiveMenu(null)
    const originalType = activeCol.type
    try {
      updateColumn(activeCol.id, { type })
      await api.columns.update(sheetId, activeCol.id, { type }, { accessToken, workspaceId })
    } catch (err) {
      console.error('Failed to update column type:', err)
      updateColumn(activeCol.id, { type: originalType })
    }
  }

  const handleMenuHeaderClick = (menu: string) => {
    if (activeMenu === menu) {
      setActiveMenu(null)
    } else {
      setActiveMenu(menu)
      if (menu === 'file') {
        fetchAllSheets()
      }
    }
  }

  const handleMenuHeaderMouseEnter = (menu: string) => {
    if (activeMenu !== null) {
      setActiveMenu(menu)
      if (menu === 'file') {
        fetchAllSheets()
      }
    }
  }

  const showShortcutAlert = (action: string) => {
    setActiveMenu(null)
    alert(`To ${action}, please use the keyboard shortcut (Ctrl+${action[0].toUpperCase()} or Cmd+${action[0].toUpperCase()}).`)
  }

  return (
    <div className="flex flex-col border-b border-border bg-card select-none flex-shrink-0 font-sans text-xs">
      
      {/* ─── ROW 1: Menu Bar & Info ─────────────────────────────────────── */}
      <div className="h-11 px-3 flex items-center justify-between border-b border-border/40 gap-4 bg-card">
        
        {/* Left Side: Logo, Title, Saved Status, and Menu Bar */}
        <div className="flex items-center gap-2.5">
          {/* Logo */}
          <div className="text-emerald-600 dark:text-emerald-500 p-1.5 rounded-lg hover:bg-accent/40 transition-colors">
            <FileSpreadsheet size={18} />
          </div>

          <div className="flex flex-col">
            {/* Sheet Title + Cloud Status */}
            <div className="flex items-center gap-2 h-5 mt-0.5">
              <input
                ref={titleInputRef}
                type="text"
                value={sheetTitle}
                onChange={(e) => setSheetTitle(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRenameSubmit()
                    e.currentTarget.blur()
                  }
                }}
                className="h-5 px-1 py-0.5 text-xs font-semibold bg-transparent border border-transparent hover:border-border/60 focus:border-primary focus:bg-background rounded outline-none transition-all w-40 text-foreground"
                placeholder="Untitled Sheet"
              />
              
              <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-500 font-medium">
                <Cloud size={11} />
                <span>Saved to cloud</span>
              </div>
            </div>

            {/* Menu Bar (File, Edit, View, Insert, Format, Help) */}
            <div className="flex items-center gap-0.5 -ml-1 mt-0.5 relative" ref={menuBarRef}>
              
              {/* FILE MENU */}
              <div className="relative">
                <button
                  onClick={() => handleMenuHeaderClick('file')}
                  onMouseEnter={() => handleMenuHeaderMouseEnter('file')}
                  className={cn(
                    "h-5 px-2 rounded text-[11px] font-medium text-foreground/80 hover:bg-accent transition-colors hover:text-foreground",
                    activeMenu === 'file' && "bg-accent text-foreground font-semibold"
                  )}
                >
                  File
                </button>
                {activeMenu === 'file' && (
                  <div className="absolute left-0 mt-1 w-52 bg-popover text-popover-foreground border border-border rounded shadow-md z-50 py-1 text-xs">
                    <button onClick={() => openCreateModal('sheet')} className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center gap-2">
                      <FilePlus size={13} className="text-muted-foreground" />
                      <span>New Sheet...</span>
                    </button>
                    <button onClick={() => openCreateModal('folder')} className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center gap-2 border-b border-border/50 pb-2 mb-1">
                      <FolderPlus size={13} className="text-muted-foreground" />
                      <span>New Folder...</span>
                    </button>

                    {(user?.role === 'ADMIN' || user?.role === 'OWNER' || user?.role === 'EDITOR') && (
                      <button onClick={handleNewProject} className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center gap-2 border-b border-border/50 pb-2 mb-1">
                        <FolderSymlink size={13} className="text-blue-500" />
                        <span>New Project...</span>
                      </button>
                    )}

                    <button onClick={handleRenameActiveSheet} className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center gap-2 border-b border-border/50 pb-2 mb-1">
                      <Edit3 size={13} className="text-muted-foreground" />
                      <span>Rename Sheet...</span>
                    </button>

                    <button onClick={handleSaveAsNew} className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center gap-2">
                      <Copy size={13} className="text-muted-foreground" />
                      <span>Save as New (Copy)...</span>
                    </button>
                    <button onClick={handleSaveAsTemplate} className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center gap-2 border-b border-border/50 pb-2 mb-1">
                      <Copy size={13} className="text-muted-foreground" />
                      <span>Save as Template...</span>
                    </button>

                    <button onClick={handleDeleteActiveSheet} className="w-full px-3 py-1.5 text-left hover:bg-accent text-red-500 hover:text-red-600 flex items-center gap-2 border-b border-border/50 pb-2 mb-1">
                      <Trash size={13} className="text-red-500" />
                      <span>Delete Sheet</span>
                    </button>

                    {/* Open Sheet Submenu */}
                    <div className="relative">
                      <button
                        onMouseEnter={() => setOpenSheetSubmenuOpen(true)}
                        onClick={() => setOpenSheetSubmenuOpen(!openSheetSubmenuOpen)}
                        className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet size={13} className="text-muted-foreground" />
                          <span>Open Sheet</span>
                        </div>
                        <ChevronRight size={12} className="text-muted-foreground" />
                      </button>

                      {openSheetSubmenuOpen && (
                        <div 
                          className="absolute left-full top-0 ml-1 w-52 max-h-60 overflow-y-auto bg-popover text-popover-foreground border border-border rounded shadow-md z-50 py-1"
                          onMouseLeave={() => setOpenSheetSubmenuOpen(false)}
                        >
                          <div className="px-2.5 py-1 text-[10px] text-muted-foreground font-semibold border-b border-border/50 mb-1">
                            SELECT SHEET
                          </div>
                          {allSheets.length === 0 ? (
                            <div className="px-3 py-1.5 text-muted-foreground text-[11px]">No other sheets</div>
                          ) : (
                            allSheets.map((s) => (
                              <button
                                key={s.id}
                                onClick={() => {
                                  router.push(`/${workspaceId}/sheets/${s.id}`)
                                  setActiveMenu(null)
                                  setOpenSheetSubmenuOpen(false)
                                }}
                                className={cn(
                                  "w-full px-3 py-1.5 text-left hover:bg-accent flex items-center gap-2 truncate",
                                  s.id === sheetId && "bg-accent/50 font-semibold"
                                )}
                              >
                                <FileSpreadsheet size={12} className="text-emerald-500 flex-shrink-0" />
                                <span className="truncate">{s.title}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* EDIT MENU */}
              <div className="relative">
                <button
                  onClick={() => handleMenuHeaderClick('edit')}
                  onMouseEnter={() => handleMenuHeaderMouseEnter('edit')}
                  className={cn(
                    "h-5 px-2 rounded text-[11px] font-medium text-foreground/80 hover:bg-accent transition-colors hover:text-foreground",
                    activeMenu === 'edit' && "bg-accent text-foreground font-semibold"
                  )}
                >
                  Edit
                </button>
                {activeMenu === 'edit' && (
                  <div className="absolute left-0 mt-1 w-44 bg-popover text-popover-foreground border border-border rounded shadow-md z-50 py-1 text-xs">
                    <button onClick={() => { undo(); setActiveMenu(null) }} className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center justify-between">
                      <span>Undo</span>
                      <span className="text-[10px] text-muted-foreground">⌘Z</span>
                    </button>
                    <button onClick={() => { redo(); setActiveMenu(null) }} className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center justify-between border-b border-border/50 pb-2 mb-1">
                      <span>Redo</span>
                      <span className="text-[10px] text-muted-foreground">⌘Y</span>
                    </button>
                    <button onClick={() => showShortcutAlert('cut')} className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center justify-between">
                      <span>Cut</span>
                      <span className="text-[10px] text-muted-foreground">⌘X</span>
                    </button>
                    <button onClick={() => showShortcutAlert('copy')} className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center justify-between">
                      <span>Copy</span>
                      <span className="text-[10px] text-muted-foreground">⌘C</span>
                    </button>
                    <button onClick={() => showShortcutAlert('paste')} className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center justify-between">
                      <span>Paste</span>
                      <span className="text-[10px] text-muted-foreground">⌘V</span>
                    </button>
                  </div>
                )}
              </div>

              {/* VIEW MENU */}
              <div className="relative">
                <button
                  onClick={() => handleMenuHeaderClick('view')}
                  onMouseEnter={() => handleMenuHeaderMouseEnter('view')}
                  className={cn(
                    "h-5 px-2 rounded text-[11px] font-medium text-foreground/80 hover:bg-accent transition-colors hover:text-foreground",
                    activeMenu === 'view' && "bg-accent text-foreground font-semibold"
                  )}
                >
                  View
                </button>
                {activeMenu === 'view' && (
                  <div className="absolute left-0 mt-1 w-52 bg-popover text-popover-foreground border border-border rounded shadow-md z-50 py-1 text-xs">
                    <button onClick={() => { toggleLeftSidebar(); setActiveMenu(null) }} className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center justify-between">
                      <span>Workspace Explorer</span>
                      <span className="text-[10px] text-muted-foreground">{leftSidebarOpen ? "Visible" : "Hidden"}</span>
                    </button>
                    <button onClick={() => { toggleRightPanel(); setActiveMenu(null) }} className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center justify-between border-b border-border/50 pb-2 mb-1">
                      <span>AI Copilot Panel</span>
                      <span className="text-[10px] text-muted-foreground">{rightPanelOpen ? "Visible" : "Hidden"}</span>
                    </button>

                    <button onClick={() => { toggleAttachmentsPanel(); setActiveMenu(null) }} className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center justify-between border-b border-border/50 pb-2 mb-1">
                      <span>Attachments Panel</span>
                      <span className="text-[10px] text-muted-foreground">{attachmentsPanelOpen ? "Visible" : "Hidden"}</span>
                    </button>
                    
                    <button onClick={() => { setHighlightChangesEnabled(!highlightChangesEnabled); setActiveMenu(null) }} className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center justify-between">
                      <span>Highlight Changes</span>
                      <span className="text-[10px] text-muted-foreground">{highlightChangesEnabled ? "On" : "Off"}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* INSERT MENU */}
              <div className="relative">
                <button
                  onClick={() => handleMenuHeaderClick('insert')}
                  onMouseEnter={() => handleMenuHeaderMouseEnter('insert')}
                  className={cn(
                    "h-5 px-2 rounded text-[11px] font-medium text-foreground/80 hover:bg-accent transition-colors hover:text-foreground",
                    activeMenu === 'insert' && "bg-accent text-foreground font-semibold"
                  )}
                >
                  Insert
                </button>
                {activeMenu === 'insert' && (
                  <div className="absolute left-0 mt-1 w-52 bg-popover text-popover-foreground border border-border rounded shadow-md z-50 py-1 text-xs">
                    <button onClick={() => { alert("Right click any row number header in the grid canvas to insert new rows."); setActiveMenu(null) }} className="w-full px-3 py-1.5 text-left hover:bg-accent">
                      Insert Row Above / Below
                    </button>
                    <button onClick={() => { alert("Right click any column letter header to edit or add columns."); setActiveMenu(null) }} className="w-full px-3 py-1.5 text-left hover:bg-accent border-b border-border/50 pb-2 mb-1">
                      Insert Column Left / Right
                    </button>
                    <button onClick={() => { handleNewSheet(); setActiveMenu(null) }} className="w-full px-3 py-1.5 text-left hover:bg-accent">
                      New Sheet Tab
                    </button>
                  </div>
                )}
              </div>

              {/* FORMAT MENU */}
              <div className="relative">
                <button
                  onClick={() => handleMenuHeaderClick('format')}
                  onMouseEnter={() => handleMenuHeaderMouseEnter('format')}
                  className={cn(
                    "h-5 px-2 rounded text-[11px] font-medium text-foreground/80 hover:bg-accent transition-colors hover:text-foreground",
                    activeMenu === 'format' && "bg-accent text-foreground font-semibold"
                  )}
                >
                  Format
                </button>
                {activeMenu === 'format' && (
                  <div className="absolute left-0 mt-1 w-52 bg-popover text-popover-foreground border border-border rounded shadow-md z-50 py-1 text-xs">
                    <button onClick={() => { applyFormat({ bold: !isBold }); setActiveMenu(null) }} className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center justify-between font-bold">
                      <span>Bold</span>
                      <span className="text-[10px] text-muted-foreground font-normal">⌘B</span>
                    </button>
                    <button onClick={() => { applyFormat({ italic: !isItalic }); setActiveMenu(null) }} className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center justify-between italic border-b border-border/50 pb-2 mb-1">
                      <span>Italic</span>
                      <span className="text-[10px] text-muted-foreground font-normal">⌘I</span>
                    </button>

                    <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground">ALIGNMENT</div>
                    <button onClick={() => { applyFormat({ textAlign: 'left' }); setActiveMenu(null) }} className="w-full px-3 py-1.5 text-left hover:bg-accent pl-5">Left</button>
                    <button onClick={() => { applyFormat({ textAlign: 'center' }); setActiveMenu(null) }} className="w-full px-3 py-1.5 text-left hover:bg-accent pl-5">Center</button>
                    <button onClick={() => { applyFormat({ textAlign: 'right' }); setActiveMenu(null) }} className="w-full px-3 py-1.5 text-left hover:bg-accent pl-5 border-b border-border/50 pb-2 mb-1">Right</button>

                    <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground">COLUMN DATA TYPE</div>
                    {COLUMN_TYPES.slice(0, 7).map((opt) => (
                      <button
                        key={opt.type}
                        onClick={() => handleTypeChange(opt.type)}
                        className="w-full px-3 py-1.5 text-left hover:bg-accent pl-5 flex items-center gap-2"
                      >
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* HELP MENU */}
              <div className="relative">
                <button
                  onClick={() => handleMenuHeaderClick('help')}
                  onMouseEnter={() => handleMenuHeaderMouseEnter('help')}
                  className={cn(
                    "h-5 px-2 rounded text-[11px] font-medium text-foreground/80 hover:bg-accent transition-colors hover:text-foreground",
                    activeMenu === 'help' && "bg-accent text-foreground font-semibold"
                  )}
                >
                  Help
                </button>
                {activeMenu === 'help' && (
                  <div className="absolute left-0 mt-1 w-56 bg-popover text-popover-foreground border border-border rounded shadow-md z-50 py-1 text-xs">
                    <button 
                      onClick={() => {
                        setActiveMenu(null)
                        alert(
                          `Keyboard Shortcuts:\n\n• Enter: Focus / Save edit cell\n• Escape: Cancel editing cell\n• F2: Edit cell\n• Tab: Indent spreadsheet row\n• Shift+Tab: Outdent spreadsheet row\n• Ctrl+Z: Undo last change\n• Ctrl+Y: Redo last change\n• Delete/Backspace: Clear cell data`
                        )
                      }} 
                      className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center gap-2"
                    >
                      <HelpCircle size={13} className="text-muted-foreground" />
                      <span>Keyboard Shortcuts</span>
                    </button>
                    <button 
                      onClick={() => {
                        setActiveMenu(null)
                        alert("CTM Collaborative Spreadsheet Platform\nVersion 1.2.0 (Stable)\nBuilt with Next.js, Yjs CRDTs, and CanvasRenderingContext2D.")
                      }} 
                      className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center gap-2 border-t border-border/50 mt-1 pt-1.5"
                    >
                      <Sparkles size={13} className="text-amber-500" />
                      <span>About CTM Sheet</span>
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>

        {/* Right Side: Share, AI Panel, Profile */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Share Button */}
          <button
            onClick={handleShareClick}
            className="h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-md flex items-center gap-1.5 transition-colors cursor-pointer border-none shadow-sm shadow-emerald-950/20"
          >
            <Users size={13} />
            <span>Share</span>
          </button>
          
          {/* Attachments Toggle */}
          <button
            onClick={toggleAttachmentsPanel}
            className={cn(
              'h-7 px-2.5 rounded text-xs transition-colors font-medium border border-border flex items-center gap-1.5',
              attachmentsPanelOpen
                ? 'bg-primary text-primary-foreground border-transparent'
                : 'text-muted-foreground hover:bg-accent bg-transparent',
            )}
          >
            <Paperclip size={13} />
            <span>Files</span>
          </button>
          
          {/* AI Panel Toggle */}
          <button
            onClick={toggleRightPanel}
            className={cn(
              'h-7 px-2.5 rounded text-xs transition-colors font-medium border border-border',
              rightPanelOpen
                ? 'bg-primary text-primary-foreground border-transparent'
                : 'text-muted-foreground hover:bg-accent bg-transparent',
            )}
          >
            AI Panel
          </button>
          
          {/* User Profile Button */}
          <button
            onClick={() => setProfileModalOpen(true)}
            className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors border border-border overflow-hidden bg-muted"
            title="Edit Profile"
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User size={13} />
            )}
          </button>
        </div>
      </div>

      {/* ─── ROW 2: Action Shortcuts Toolbar ─────────────────────────────── */}
      <div className="h-9 px-2 flex items-center gap-0.5 bg-muted/15 border-b border-transparent">
        
        {/* Toggle Workspace Explorer */}
        <ToolbarButton
          icon={<Sidebar size={13} />}
          title="Toggle Workspace Explorer"
          active={leftSidebarOpen}
          onClick={toggleLeftSidebar}
        />

        <div className="w-px h-5 bg-border/60 mx-1" />

        {/* Cell reference box */}
        <div className="w-16 h-6 border border-border/80 rounded bg-background px-1.5 text-[11px] font-mono text-muted-foreground flex items-center justify-center select-text">
          {cellRef || 'A1'}
        </div>

        <div className="w-px h-5 bg-border/60 mx-1" />

        {/* Undo/Redo */}
        <ToolbarButton icon={<Undo2 size={13} />} title="Undo (Ctrl+Z)" onClick={undo} />
        <ToolbarButton icon={<Redo2 size={13} />} title="Redo (Ctrl+Y)" onClick={redo} />

        <div className="w-px h-5 bg-border/60 mx-1" />

        {/* Format Bold/Italic */}
        <ToolbarButton
          icon={<Bold size={13} />}
          title="Bold (Ctrl+B)"
          active={isBold}
          onClick={() => applyFormat({ bold: !isBold })}
        />
        <ToolbarButton
          icon={<Italic size={13} />}
          title="Italic (Ctrl+I)"
          active={isItalic}
          onClick={() => applyFormat({ italic: !isItalic })}
        />

        <div className="w-px h-5 bg-border/60 mx-1" />

        {/* Alignment */}
        <ToolbarButton
          icon={<AlignLeft size={13} />}
          title="Align left"
          active={textAlign === 'left'}
          onClick={() => applyFormat({ textAlign: 'left' })}
        />
        <ToolbarButton
          icon={<AlignCenter size={13} />}
          title="Align center"
          active={textAlign === 'center'}
          onClick={() => applyFormat({ textAlign: 'center' })}
        />
        <ToolbarButton
          icon={<AlignRight size={13} />}
          title="Align right"
          active={textAlign === 'right'}
          onClick={() => applyFormat({ textAlign: 'right' })}
        />

        <div className="w-px h-5 bg-border/60 mx-1" />

        {/* Column Type Dropdown */}
        <div className="relative" ref={columnDropdownRef}>
          <button
            onClick={() => {
              if (activeCol) {
                setColumnDropdownOpen(!columnDropdownOpen)
              }
            }}
            disabled={!activeCol}
            className={cn(
              "h-6 px-1.5 rounded text-[11px] flex items-center gap-1 transition-colors border border-transparent",
              activeCol
                ? "text-muted-foreground hover:bg-accent hover:border-border/50 cursor-pointer"
                : "text-muted-foreground/40 cursor-not-allowed"
            )}
          >
            {activeCol ? (
              <>
                {COLUMN_TYPES.find((t) => t.type === activeCol.type)?.icon ?? <Type size={11} />}
                <span>{COLUMN_TYPES.find((t) => t.type === activeCol.type)?.label ?? activeCol.type}</span>
              </>
            ) : (
              <>
                <Type size={11} />
                <span>Text</span>
              </>
            )}
            <ChevronDown size={9} />
          </button>

          {columnDropdownOpen && activeCol && (
            <div className="absolute left-0 mt-1 w-44 bg-popover text-popover-foreground border border-border rounded shadow-md z-50 py-1 font-sans text-xs">
              {COLUMN_TYPES.map((opt) => (
                <button
                  key={opt.type}
                  onClick={() => handleTypeChange(opt.type)}
                  className={cn(
                    "w-full px-3 py-1.5 text-left hover:bg-accent hover:text-accent-foreground flex items-center gap-2",
                    activeCol.type === opt.type && "bg-accent/50 font-semibold"
                  )}
                >
                  <span className="w-4 flex items-center justify-center">{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-border/60 mx-1" />

        {/* Highlight Changes Toggle & Dropdown */}
        <div className="relative flex items-center rounded border border-border/80 bg-background h-6" ref={highlightDropdownRef}>
          <button
            title="Highlight Changes"
            onClick={() => setHighlightChangesEnabled(!highlightChangesEnabled)}
            className={cn(
              "h-full px-1.5 flex items-center gap-1 text-[11px] transition-colors rounded-l",
              highlightChangesEnabled
                ? "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300 font-medium"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            <Highlighter size={12} className={highlightChangesEnabled ? "text-amber-500" : ""} />
            <span>Changes</span>
          </button>
          <button
            onClick={() => setHighlightDropdownOpen(!highlightDropdownOpen)}
            className="h-full px-1 flex items-center justify-center transition-colors rounded-r border-l border-border/60 text-muted-foreground hover:bg-accent"
          >
            <ChevronDown size={9} />
          </button>

          {highlightDropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-40 bg-popover text-popover-foreground border border-border rounded shadow-md z-50 py-1 font-sans text-xs">
              <div className="px-2 py-1 text-[10px] text-muted-foreground font-semibold border-b border-border/50 mb-1">TIMEFRAME</div>
              {(
                [
                  { value: 'today', label: 'Today' },
                  { value: '3days', label: 'Last 3 Days' },
                  { value: '7days', label: 'Last 7 Days' },
                  { value: 'last_login', label: 'Since Last Login' },
                ] as const
              ).map((tf) => (
                <button
                  key={tf.value}
                  onClick={() => {
                    setHighlightChangesTimeframe(tf.value)
                    setHighlightChangesEnabled(true)
                    setHighlightDropdownOpen(false)
                  }}
                  className={cn(
                    "w-full px-3 py-1.5 text-left hover:bg-accent hover:text-accent-foreground flex items-center justify-between",
                    highlightChangesTimeframe === tf.value && "bg-accent/50 font-semibold"
                  )}
                >
                  <span>{tf.label}</span>
                  {highlightChangesTimeframe === tf.value && <span className="text-[10px]">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Edit Profile Modal */}
      {profileModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-popover text-popover-foreground border border-border rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-sm font-semibold mb-4">Edit Profile</h3>
            
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full h-8 rounded border border-border bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                  Email (Read-only)
                </label>
                <input
                  type="email"
                  disabled
                  value={user?.email || ''}
                  className="w-full h-8 rounded border border-border bg-muted px-2.5 text-xs text-muted-foreground cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                  Organization Name
                </label>
                <input
                  type="text"
                  value={profileOrg}
                  onChange={(e) => setProfileOrg(e.target.value)}
                  className="w-full h-8 rounded border border-border bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                  Employee ID
                </label>
                <input
                  type="text"
                  value={profileEmpId}
                  onChange={(e) => setProfileEmpId(e.target.value)}
                  className="w-full h-8 rounded border border-border bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                  Tel (Phone Number)
                </label>
                <input
                  type="tel"
                  value={profileTel}
                  onChange={(e) => setProfileTel(e.target.value)}
                  className="w-full h-8 rounded border border-border bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setProfileModalOpen(false)}
                  className="h-8 px-3.5 rounded text-xs hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-8 px-3.5 rounded text-xs bg-primary text-primary-foreground font-medium hover:bg-primary/95 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share / Members Modal */}
      {membersModalOpen && (
        <ManageMembersModal
          workspaceId={workspaceId}
          type={currentSheet?.projectId ? 'project' : 'folder'}
          targetId={currentSheet?.projectId || currentSheet?.folderId || ''}
          targetName={currentSheet?.title || 'Sheet'}
          isOpen={membersModalOpen}
          onClose={() => setMembersModalOpen(false)}
        />
      )}

      {/* Custom Creation Modal with Project selector */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-popover text-popover-foreground border border-border w-96 rounded-lg shadow-lg p-5">
            <h2 className="text-sm font-semibold mb-4 text-foreground">
              Create New {createType === 'sheet' ? 'Sheet' : 'Folder'}
            </h2>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                  {createType === 'sheet' ? 'Sheet Title' : 'Folder Name'}
                </label>
                <input
                  autoFocus
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full h-8 rounded border border-border bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                  Assign to Project
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full h-8 rounded border border-border bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                  required
                >
                  <option value="" disabled>Select a Project...</option>
                  {projectsList.map((project) => {
                    const pId = project.id || project.ID
                    const pName = project.name || project.Name
                    return (
                      <option key={pId} value={pId}>
                        {pName}
                      </option>
                    )
                  })}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="h-8 px-3.5 rounded text-xs hover:bg-accent transition-colors text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-8 px-3.5 rounded text-xs bg-primary text-primary-foreground font-medium hover:bg-primary/95 transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

function ToolbarButton({
  icon,
  title,
  active,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        'h-6 w-6 rounded flex items-center justify-center transition-colors border border-transparent',
        active ? 'bg-accent text-accent-foreground font-semibold border-border/80' : 'text-muted-foreground hover:bg-accent',
      )}
    >
      {icon}
    </button>
  )
}
