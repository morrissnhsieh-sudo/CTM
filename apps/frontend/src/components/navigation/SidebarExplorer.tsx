'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Folder,
  FolderOpen,
  FileSpreadsheet,
  Star,
  Clock,
  Plus,
  MoreVertical,
  Trash,
  Edit3,
  FolderPlus,
  ChevronDown,
  ChevronRight,
  Loader2,
  FolderSymlink,
  Copy,
  Shield,
  Users
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'
import { UserManagementModal } from '../admin/UserManagementModal'
import { ManageMembersModal } from './ManageMembersModal'

interface SidebarExplorerProps {
  workspaceId: string
  activeSheetId?: string
}

export function SidebarExplorer({ workspaceId, activeSheetId }: SidebarExplorerProps) {
  const router = useRouter()
  const { accessToken, user } = useAuthStore()
  const userRole = user?.role?.toUpperCase()
  console.log('[SidebarExplorer] Current User:', user, 'userRole:', userRole)

  const [sheets, setSheets] = useState<any[]>([])
  const [folders, setFolders] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [favorites, setFavorites] = useState<any[]>([])
  const [recents, setRecents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [adminOpen, setAdminOpen] = useState(false)

  // UI state
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState('')
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)

  // Modal / Input states
  const [showNewFolderInput, setShowNewFolderInput] = useState<string | null>(null) // parentId | 'root' | null
  const [newFolderName, setNewFolderName] = useState('')
  const [membersModalTarget, setMembersModalTarget] = useState<{ id: string; name: string; type: 'project' | 'folder' } | null>(null)

  // Custom Create Sheet / Folder Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createType, setCreateType] = useState<'sheet' | 'folder'>('sheet')
  const [createName, setCreateName] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [selectedParentId, setSelectedParentId] = useState<string>('')

  const loadData = async () => {
    if (!accessToken || !workspaceId) return
    try {
      setLoading(true)
      const [sheetsRes, foldersRes, favoritesRes, recentsRes, projectsRes] = await Promise.all([
        api.sheets.list({ accessToken, workspaceId }),
        api.folders.list({ accessToken, workspaceId }),
        api.sheets.favorites({ accessToken, workspaceId }),
        api.sheets.recents({ accessToken, workspaceId }),
        api.pm.listProjects({ accessToken, workspaceId }).catch(() => ({ data: [] })),
      ])

      setSheets(sheetsRes.data ?? [])
      setFolders(foldersRes.data ?? [])
      setFavorites(favoritesRes.data ?? [])
      setRecents(recentsRes.data ?? [])
      setProjects(projectsRes.data ?? [])
    } catch (err) {
      console.error('Failed to load explorer sidebar data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [workspaceId, accessToken, activeSheetId])

  const toggleProject = (projectId: string) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }))
  }

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }))
  }

  const openCreateModal = (type: 'sheet' | 'folder', initProjectId: string = '', initParentId: string = '') => {
    setCreateType(type)
    setCreateName(type === 'sheet' ? 'Untitled Sheet' : 'New Folder')
    setSelectedProjectId(initProjectId)
    setSelectedParentId(initParentId)
    setCreateModalOpen(true)
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

    // Name uniqueness validation
    if (createType === 'folder') {
      const isDuplicate = folders.some(f => 
        (f.projectId || f.ProjectID || f.projectId) === projectId && 
        f.parentId === (selectedParentId || null) && 
        f.name.toLowerCase() === nameOrTitle.toLowerCase()
      )
      if (isDuplicate) {
        alert(`A folder named "${nameOrTitle}" already exists in this location. Please choose a different name.`)
        return
      }

      try {
        await api.folders.create(
          { name: nameOrTitle, projectId, parentId: selectedParentId || null },
          { accessToken, workspaceId }
        )
        setCreateModalOpen(false)
        await loadData()
      } catch (err) {
        console.error('Failed to create folder:', err)
        alert('Failed to create folder.')
      }
    } else {
      // Sheet validation
      const isDuplicate = sheets.some(s => 
        s.projectId === projectId && 
        s.folderId === (selectedParentId || null) && 
        s.title.toLowerCase() === nameOrTitle.toLowerCase()
      )
      if (isDuplicate) {
        alert(`A sheet named "${nameOrTitle}" already exists in this location. Please choose a different name.`)
        return
      }

      try {
        const res = await api.sheets.create(
          { title: nameOrTitle, projectId, folderId: selectedParentId || null },
          { accessToken, workspaceId }
        )
        setCreateModalOpen(false)
        await loadData()
        if (res.data?.id) {
          router.push(`/${workspaceId}/sheets/${res.data.id}`)
        }
      } catch (err) {
        console.error('Failed to create sheet:', err)
        alert('Failed to create sheet.')
      }
    }
  }

  const handleNewProjectPrompt = async () => {
    if (!accessToken) return
    const name = prompt('Enter name for the new project:')
    if (!name || !name.trim()) return
    try {
      await api.pm.createProject({ name: name.trim() }, { accessToken, workspaceId })
      await loadData()
    } catch (err) {
      console.error('Failed to create project:', err)
      alert('Failed to create project. Verify you have administrator or project manager privileges.')
    }
  }

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (!accessToken) return
    if (!confirm(`Are you sure you want to delete the project "${projectName}"? All sheets, folders, and tasks within this project will be deleted permanently.`)) return
    try {
      setLoading(true)
      await api.pm.deleteProject(projectId, { accessToken, workspaceId })
      setActiveMenuId(null)
      await loadData()
    } catch (err) {
      console.error('Failed to delete project:', err)
      alert('Failed to delete project. Verify you have administrator or project owner privileges.')
    } finally {
      setLoading(false)
    }
  }

  const handleRenameFolder = async (folderId: string) => {
    if (!editingFolderName.trim() || !accessToken) return
    try {
      await api.folders.update(folderId, { name: editingFolderName }, { accessToken, workspaceId })
      setEditingFolderId(null)
      setEditingFolderName('')
      await loadData()
    } catch (err) {
      console.error('Failed to rename folder:', err)
    }
  }

  const handleDeleteFolder = async (folderId: string) => {
    if (!accessToken || !confirm('Are you sure you want to delete this folder? All contents will be moved to the workspace root.')) return
    try {
      await api.folders.delete(folderId, { accessToken, workspaceId })
      await loadData()
    } catch (err) {
      console.error('Failed to delete folder:', err)
    }
  }

  const handleToggleFavorite = async (sheetId: string, isFav: boolean) => {
    if (!accessToken) return
    try {
      await api.sheets.toggleFavorite(sheetId, isFav, { accessToken, workspaceId })
      await loadData()
    } catch (err) {
      console.error('Failed to toggle favorite:', err)
    }
  }

  const handleMoveSheet = async (sheetId: string, targetFolderId: string | null) => {
    if (!accessToken) return
    try {
      await api.sheets.update(sheetId, { folderId: targetFolderId }, { accessToken, workspaceId })
      setActiveMenuId(null)
      await loadData()
    } catch (err) {
      console.error('Failed to move sheet:', err)
    }
  }

  const handleRenameSheet = async (sheetId: string, currentTitle: string) => {
    if (!accessToken) return
    const newTitle = prompt('Enter new title for this sheet:', currentTitle)
    if (!newTitle || !newTitle.trim()) return
    try {
      await api.sheets.update(sheetId, { title: newTitle }, { accessToken, workspaceId })
      setActiveMenuId(null)
      await loadData()
    } catch (err) {
      console.error('Failed to rename sheet:', err)
      alert('Failed to rename sheet.')
    }
  }

  const handleDeleteSheet = async (sheetId: string, sheetTitle: string) => {
    if (!accessToken) return
    if (!confirm(`Are you sure you want to delete the sheet "${sheetTitle}"?`)) return
    try {
      setLoading(true)
      await api.sheets.delete(sheetId, { accessToken, workspaceId })
      setActiveMenuId(null)
      await loadData()
      if (activeSheetId === sheetId) {
        router.push(`/${workspaceId}`)
      }
    } catch (err) {
      console.error('Failed to delete sheet:', err)
      alert('Failed to delete sheet.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopySheet = async (sheetId: string, originalTitle: string, includeData: boolean) => {
    if (!accessToken) return
    const actionName = includeData ? 'copy' : 'template'
    const defaultTitle = includeData ? `Copy of ${originalTitle}` : `${originalTitle} Template`
    const promptTitle = prompt(`Enter title for the new sheet:`, defaultTitle)
    if (promptTitle === null) return

    try {
      setLoading(true)
      const res = await api.sheets.copy(
        sheetId,
        { title: promptTitle, includeData },
        { accessToken, workspaceId }
      )
      setActiveMenuId(null)
      await loadData()
      if (res.data?.sheet?.id) {
        router.push(`/${workspaceId}/sheets/${res.data.sheet.id}`)
      }
    } catch (err) {
      console.error(`Failed to ${actionName} sheet:`, err)
      alert(`Failed to ${actionName} sheet.`)
    } finally {
      setLoading(false)
    }
  }

  // Helper to render sheets matching folderId (or null for root) and projectId
  const renderSheetsList = (projectId: string | null, folderId: string | null) => {
    const folderSheets = sheets.filter(s => s.projectId === projectId && s.folderId === folderId)
    return (
      <div className="space-y-0.5 pl-4">
        {folderSheets.map((sheet, index) => {
          const isActive = sheet.id === activeSheetId
          const isStarred = favorites.some(fav => fav.id === sheet.id)
          const menuId = `sheet-${sheet.id || index}`

          return (
            <div
              key={sheet.id || `sheet-${index}`}
              className={cn(
                "group flex items-center justify-between px-2 py-1 rounded text-xs transition-colors relative",
                isActive
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <button
                onClick={() => router.push(`/${workspaceId}/sheets/${sheet.id}`)}
                className="flex-1 flex items-center gap-2 text-left truncate"
              >
                <FileSpreadsheet size={13} className="text-emerald-500 flex-shrink-0" />
                <span className="truncate">{sheet.title}</span>
              </button>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleToggleFavorite(sheet.id, !isStarred)}
                  className="p-0.5 hover:bg-muted rounded text-muted-foreground hover:text-amber-500"
                >
                  <Star size={11} className={cn(isStarred && "fill-amber-500 text-amber-500")} />
                </button>
                <div className="relative">
                  <button
                    onClick={() => setActiveMenuId(activeMenuId === menuId ? null : menuId)}
                    className="p-0.5 hover:bg-muted rounded text-muted-foreground"
                  >
                    <MoreVertical size={11} />
                  </button>
                  {activeMenuId === menuId && (
                    <div className="absolute right-0 mt-1 w-44 bg-popover text-popover-foreground border border-border rounded shadow-lg z-50 py-1 text-[11px]">
                      <div className="px-2 py-1 text-[10px] text-muted-foreground font-semibold border-b border-border mb-1">
                        Move to Folder
                      </div>
                      {folderId !== null && (
                        <button
                          onClick={() => handleMoveSheet(sheet.id, null)}
                          className="w-full px-3 py-1 text-left hover:bg-accent flex items-center gap-1.5"
                        >
                          <FolderSymlink size={11} />
                          <span>[Root workspace]</span>
                        </button>
                      )}
                      {folders.filter(f => f.id !== folderId).map((f, index) => (
                        <button
                          key={f.id || `folder-move-${index}`}
                          onClick={() => handleMoveSheet(sheet.id, f.id)}
                          className="w-full px-3 py-1 text-left hover:bg-accent flex items-center gap-1.5 truncate"
                        >
                          <Folder size={11} />
                          <span className="truncate">{f.name}</span>
                        </button>
                      ))}
                       <div className="border-t border-border mt-1 pt-1">
                        <button
                          onClick={() => handleRenameSheet(sheet.id, sheet.title)}
                          className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center gap-1.5 text-foreground"
                        >
                          <Edit3 size={11} />
                          <span>Rename Sheet...</span>
                        </button>
                        <button
                          onClick={() => handleCopySheet(sheet.id, sheet.title, true)}
                          className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center gap-1.5 text-foreground"
                        >
                          <Copy size={11} />
                          <span>Copy Sheet (with Data)</span>
                        </button>
                        <button
                          onClick={() => handleCopySheet(sheet.id, sheet.title, false)}
                          className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center gap-1.5 text-foreground"
                        >
                          <Copy size={11} />
                          <span>Save as Template (Structure)</span>
                        </button>
                        <button
                          onClick={() => handleDeleteSheet(sheet.id, sheet.title)}
                          className="w-full px-3 py-1.5 text-left hover:bg-accent text-red-500 hover:text-red-600 flex items-center gap-1.5 border-t border-border/50 mt-1 pt-1"
                        >
                          <Trash size={11} />
                          <span>Delete Sheet</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Recursive folder renderer
  const renderFoldersTree = (projectId: string | null, parentId: string | null = null, depth = 0) => {
    const currentFolders = folders.filter(f => f.projectId === projectId && f.parentId === parentId)

    return (
      <div className={cn("space-y-1", depth > 0 && "pl-3")}>
        {currentFolders.map((folder, index) => {
          const isExpanded = !!expandedFolders[folder.id]
          const isEditing = editingFolderId === folder.id
          const menuId = `folder-${folder.id || index}`

          const parentProject = projects.find(p => (p.id || p.ID) === projectId)
          const isProjectCreator = parentProject && (parentProject.createdBy === user?.id || parentProject.CreatedBy === user?.id)
          const isAdminOrOwner = userRole === 'ADMIN' || userRole === 'OWNER'
          const isFolderCreator = folder.createdBy === user?.id || folder.CreatedBy === user?.id
          const canManageFolder = isAdminOrOwner || isProjectCreator || isFolderCreator

          return (
            <div key={folder.id || `folder-${index}`} className="space-y-1">
              <div className="group flex items-center justify-between px-2 py-1 rounded hover:bg-accent/50 text-xs transition-colors">
                <div className="flex-1 flex items-center gap-1.5 min-w-0">
                  <button
                    onClick={() => toggleFolder(folder.id)}
                    className="p-0.5 hover:bg-muted rounded text-muted-foreground"
                  >
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>

                  {isExpanded ? (
                    <FolderOpen size={13} className="text-amber-500 flex-shrink-0" />
                  ) : (
                    <Folder size={13} className="text-amber-500 flex-shrink-0" />
                  )}

                  {isEditing ? (
                    <input
                      autoFocus
                      type="text"
                      value={editingFolderName}
                      onChange={(e) => setEditingFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameFolder(folder.id)
                        if (e.key === 'Escape') setEditingFolderId(null)
                      }}
                      onBlur={() => handleRenameFolder(folder.id)}
                      className="bg-background border border-border rounded px-1 text-xs py-0.5 outline-none w-full"
                    />
                  ) : (
                    <span className="truncate font-medium text-foreground">{folder.name}</span>
                  )}
                </div>

                {!isEditing && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openCreateModal('sheet', projectId || '', folder.id)}
                      title="New Sheet inside folder"
                      className="p-0.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                    >
                      <Plus size={11} />
                    </button>
                    {canManageFolder && (
                      <div className="relative">
                        <button
                          onClick={() => setActiveMenuId(activeMenuId === menuId ? null : menuId)}
                          className="p-0.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                        >
                          <MoreVertical size={11} />
                        </button>
                        {activeMenuId === menuId && (
                          <div className="absolute right-0 mt-1 w-32 bg-popover text-popover-foreground border border-border rounded shadow-lg z-50 py-1 text-[11px]">
                            <button
                              onClick={() => {
                                setEditingFolderId(folder.id)
                                setEditingFolderName(folder.name)
                                setActiveMenuId(null)
                              }}
                              className="w-full px-3 py-1 text-left hover:bg-accent flex items-center gap-1.5"
                            >
                              <Edit3 size={11} />
                              <span>Rename</span>
                            </button>
                            <button
                              onClick={() => {
                                openCreateModal('folder', projectId || '', folder.id)
                                setActiveMenuId(null)
                              }}
                              className="w-full px-3 py-1 text-left hover:bg-accent flex items-center gap-1.5"
                            >
                              <FolderPlus size={11} />
                              <span>New Subfolder</span>
                            </button>
                            <button
                              onClick={() => {
                                setMembersModalTarget({ id: folder.id, name: folder.name, type: 'folder' })
                                setActiveMenuId(null)
                              }}
                              className="w-full px-3 py-1 text-left hover:bg-accent flex items-center gap-1.5"
                            >
                              <Users size={11} />
                              <span>Manage Members</span>
                            </button>
                            <button
                              onClick={() => {
                                handleDeleteFolder(folder.id)
                                setActiveMenuId(null)
                              }}
                              className="w-full px-3 py-1 text-left hover:bg-accent text-red-500 hover:text-red-600 flex items-center gap-1.5"
                            >
                              <Trash size={11} />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>



              {/* Expanded folder contents */}
              {isExpanded && (
                <div className="border-l border-border/60 ml-2.5 my-0.5">
                  {renderFoldersTree(projectId, folder.id, depth + 1)}
                  {renderSheetsList(projectId, folder.id)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  if (loading && sheets.length === 0) {
    return (
      <div className="p-4 flex items-center justify-center text-muted-foreground text-xs gap-2">
        <Loader2 size={14} className="animate-spin" />
        <span>Loading sheets...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-card select-none">
      {/* Header section with Create Buttons */}
      <div className="p-3 border-b border-border flex items-center justify-between flex-shrink-0">
        <span className="font-semibold text-xs text-muted-foreground tracking-wider uppercase">Workspace Explorer ({userRole})</span>
        <div className="flex items-center gap-1">
          {(userRole === 'ADMIN' || userRole === 'OWNER' || userRole === 'EDITOR') && (
            <button
              onClick={handleNewProjectPrompt}
              title="New Project"
              className="p-1 hover:bg-accent text-muted-foreground hover:text-foreground rounded transition-colors"
            >
              <FolderSymlink size={14} className="text-blue-500" />
            </button>
          )}
          <button
            onClick={() => openCreateModal('folder')}
            title="New Folder"
            className="p-1 hover:bg-accent text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            <FolderPlus size={14} />
          </button>
          <button
            onClick={() => openCreateModal('sheet')}
            title="New Sheet"
            className="p-1 hover:bg-accent text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Explorer Tree contents */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4">

        {/* Workspace Explorer Projects and Root Elements */}
        <div className="space-y-3">
          {projects.map((project, index) => {
            const pId = project.id || project.ID
            const pName = project.name || project.Name
            const isProjectExpanded = !!expandedProjects[pId]
            const projectMenuId = `project-${pId || index}`
            return (
              <div key={pId || `project-${index}`} className="space-y-1">
                <div className="group flex items-center justify-between px-2 py-1 rounded hover:bg-accent/50 text-xs font-semibold text-foreground">
                  <button
                    onClick={() => toggleProject(pId)}
                    className="flex-1 flex items-center gap-1.5 text-left truncate"
                  >
                    {isProjectExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <FolderSymlink size={13} className="text-blue-500 flex-shrink-0" />
                    <span className="truncate">{pName}</span>
                  </button>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openCreateModal('folder', pId)}
                      title="New Folder in Project"
                      className="p-0.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                    >
                      <FolderPlus size={11} />
                    </button>
                    <button
                      onClick={() => openCreateModal('sheet', pId)}
                      title="New Sheet in Project"
                      className="p-0.5 hover:bg-muted rounded text-muted-foreground"
                    >
                      <Plus size={11} />
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setActiveMenuId(activeMenuId === projectMenuId ? null : projectMenuId)}
                        className="p-0.5 hover:bg-muted rounded text-muted-foreground"
                      >
                        <MoreVertical size={11} />
                      </button>
                      {activeMenuId === projectMenuId && (
                        <div className="absolute right-0 mt-1 w-32 bg-popover text-popover-foreground border border-border rounded shadow-lg z-50 py-1 text-[11px] font-normal">
                          <button
                            onClick={() => {
                              setMembersModalTarget({ id: pId, name: pName, type: 'project' })
                              setActiveMenuId(null)
                            }}
                            className="w-full px-3 py-1 text-left hover:bg-accent flex items-center gap-1.5"
                          >
                            <Users size={11} />
                            <span>Manage Members</span>
                          </button>
                          {(userRole === 'ADMIN' || userRole === 'OWNER' || project.createdBy === user?.id) && (
                            <button
                              onClick={() => {
                                handleDeleteProject(pId, pName)
                                setActiveMenuId(null)
                              }}
                              className="w-full px-3 py-1.5 text-left hover:bg-accent text-red-500 hover:text-red-600 flex items-center gap-1.5 border-t border-border mt-1 pt-1"
                            >
                              <Trash size={11} />
                              <span>Delete Project</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {isProjectExpanded && (
                  <div className="border-l border-border/60 ml-2.5 my-0.5 pl-3">
                    {renderFoldersTree(pId, null, 0)}
                    {renderSheetsList(pId, null)}
                  </div>
                )}
              </div>
            )
          })}

          {/* Root Sheets/Folders (Unassigned) */}
          {(sheets.some(s => !s.projectId) || folders.some(f => !f.projectId)) && (
            <div className="space-y-1 pt-2 border-t border-border/60">
              <div className="px-2 py-1 text-[10px] text-muted-foreground font-bold tracking-wider uppercase">
                General
              </div>
              {renderFoldersTree(null, null, 0)}
              {renderSheetsList(null, null)}
            </div>
          )}
        </div>

        {/* Favorites section */}
        {favorites.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border/60">
            <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-muted-foreground font-bold tracking-wider uppercase">
              <Star size={11} className="text-amber-500 fill-amber-500" />
              <span>Favorites</span>
            </div>
            <div className="space-y-0.5">
              {favorites.map((sheet) => (
                <button
                  key={`fav-${sheet.id}`}
                  onClick={() => router.push(`/${workspaceId}/sheets/${sheet.id}`)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors text-left truncate text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    sheet.id === activeSheetId && "bg-primary/10 text-primary font-semibold"
                  )}
                >
                  <FileSpreadsheet size={12} className="text-emerald-500 flex-shrink-0" />
                  <span className="truncate">{sheet.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recents section */}
        {recents.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border/60">
            <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-muted-foreground font-bold tracking-wider uppercase">
              <Clock size={11} className="text-blue-500" />
              <span>Recents</span>
            </div>
            <div className="space-y-0.5">
              {recents.map((sheet) => (
                <button
                  key={`recent-${sheet.id}`}
                  onClick={() => router.push(`/${workspaceId}/sheets/${sheet.id}`)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors text-left truncate text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    sheet.id === activeSheetId && "bg-primary/10 text-primary font-semibold"
                  )}
                >
                  <FileSpreadsheet size={12} className="text-emerald-500 flex-shrink-0" />
                  <span className="truncate">{sheet.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Admin Settings section at the bottom */}
      {(userRole === 'ADMIN' || userRole === 'OWNER') && (
        <div className="p-3 border-t border-border flex-shrink-0 bg-accent/20">
          <button
            onClick={() => setAdminOpen(true)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-primary font-semibold hover:bg-primary hover:text-primary-foreground transition-all cursor-pointer border border-primary/20 hover:border-transparent"
          >
            <Shield size={13} />
            <span>Admin Settings</span>
          </button>
        </div>
      )}

      {/* User Management Modal */}
      <UserManagementModal
        workspaceId={workspaceId}
        isOpen={adminOpen}
        onClose={() => setAdminOpen(false)}
      />

      {/* Project/Folder Member Assignment Modal */}
      {membersModalTarget && (
        <ManageMembersModal
          workspaceId={workspaceId}
          type={membersModalTarget.type}
          targetId={membersModalTarget.id}
          targetName={membersModalTarget.name}
          isOpen={!!membersModalTarget}
          onClose={() => setMembersModalTarget(null)}
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
                  {projects.map((project) => {
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
