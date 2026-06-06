'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
import { X, UserPlus, Trash, Shield, Users, Save, Check } from 'lucide-react'

interface UserManagementModalProps {
  workspaceId: string
  isOpen: boolean
  onClose: () => void
}

export function UserManagementModal({ workspaceId, isOpen, onClose }: UserManagementModalProps) {
  const { accessToken, user: currentUser } = useAuthStore()
  const [usersList, setUsersList] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  // Invite states
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'EDITOR' | 'COMMENTER' | 'VIEWER'>('EDITOR')
  const [inviteGroup, setInviteGroup] = useState('')

  // Inline editing state tracking
  const [editedFields, setEditedFields] = useState<Record<string, { name?: string; role?: string; groupName?: string | null }>>({})
  const [savedUserIds, setSavedUserIds] = useState<Set<string>>(new Set())

  const loadUsers = async () => {
    if (!accessToken || !workspaceId) return
    try {
      setLoading(true)
      const res = await api.users.list({ accessToken, workspaceId })
      setUsersList(res.data || [])
    } catch (err) {
      console.error('Failed to load users:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadUsers()
    }
  }, [isOpen, workspaceId, accessToken])

  if (!isOpen) return null

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken || !inviteEmail.trim() || !inviteName.trim()) return
    try {
      await api.users.create(
        {
          email: inviteEmail.trim(),
          name: inviteName.trim(),
          role: inviteRole,
          groupName: inviteGroup.trim() || null,
        },
        { accessToken, workspaceId }
      )
      setInviteEmail('')
      setInviteName('')
      setInviteGroup('')
      await loadUsers()
      alert('User invited successfully!')
    } catch (err) {
      console.error('Failed to invite user:', err)
      alert('Failed to invite user. It might be already in the workspace.')
    }
  }

  const handleFieldChange = (userId: string, field: string, value: any) => {
    setEditedFields(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [field]: value
      }
    }))
  }

  const handleSave = async (userId: string) => {
    if (!accessToken) return
    const updates = editedFields[userId]
    if (!updates) return
    try {
      await api.users.update(userId, updates, { accessToken, workspaceId })
      
      // Update local item
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, ...updates } : u))
      
      // Clear edited state for this user
      setEditedFields(prev => {
        const copy = { ...prev }
        delete copy[userId]
        return copy
      })

      // Show temporary save check icon
      setSavedUserIds(prev => {
        const next = new Set(prev)
        next.add(userId)
        return next
      })
      setTimeout(() => {
        setSavedUserIds(prev => {
          const next = new Set(prev)
          next.delete(userId)
          return next
        })
      }, 2000)

    } catch (err) {
      console.error('Failed to update user:', err)
      alert('Failed to update user details.')
    }
  }

  const handleDelete = async (userId: string, name: string) => {
    if (!accessToken) return
    if (userId === currentUser?.id) {
      alert('You cannot delete yourself!')
      return
    }
    if (!confirm(`Are you sure you want to remove user "${name}" from this workspace?`)) return
    try {
      await api.users.delete(userId, { accessToken, workspaceId })
      await loadUsers()
    } catch (err) {
      console.error('Failed to delete user:', err)
      alert('Failed to remove user.')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-2">
            <Shield className="text-primary w-5 h-5" />
            <h2 className="text-lg font-bold">Workspace Administration</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-accent text-muted-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Invite User Panel */}
          <div className="bg-accent/40 border border-border/50 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <UserPlus size={14} />
              <span>Invite New Member</span>
            </h3>
            
            <form onSubmit={handleInvite} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div className="md:col-span-1.5">
                <label className="block text-[10px] text-muted-foreground mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full h-8 px-2.5 rounded border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="md:col-span-1.5">
                <label className="block text-[10px] text-muted-foreground mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full h-8 px-2.5 rounded border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">Group</label>
                <input
                  type="text"
                  value={inviteGroup}
                  onChange={(e) => setInviteGroup(e.target.value)}
                  placeholder="Sales, Eng"
                  className="w-full h-8 px-2.5 rounded border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">Workspace Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full h-8 px-2 rounded border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="EDITOR">Editor</option>
                  <option value="COMMENTER">Commenter</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="w-full h-8 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs rounded transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span>Add Member</span>
                </button>
              </div>
            </form>
          </div>

          {/* User Directory List */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Users size={14} />
              <span>Workspace Directory</span>
            </h3>

            {loading && usersList.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">Loading workspace members...</div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden bg-card">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted text-muted-foreground border-b border-border select-none">
                      <th className="p-3 font-semibold">User Details</th>
                      <th className="p-3 font-semibold">Group / Department</th>
                      <th className="p-3 font-semibold">Workspace Role</th>
                      <th className="p-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersList.map((usr) => {
                      const updates = editedFields[usr.id] || {}
                      const displayName = updates.name !== undefined ? updates.name : usr.name
                      const groupName = updates.groupName !== undefined ? (updates.groupName || '') : (usr.groupName || '')
                      const role = updates.role !== undefined ? updates.role : usr.role
                      const isEdited = Object.keys(updates).length > 0
                      const isSaved = savedUserIds.has(usr.id)

                      return (
                        <tr key={usr.id} className="border-b border-border/60 hover:bg-accent/10 transition-colors">
                          <td className="p-3">
                            <div className="flex flex-col">
                              <input
                                type="text"
                                value={displayName}
                                onChange={(e) => handleFieldChange(usr.id, 'name', e.target.value)}
                                className="font-semibold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none py-0.5 px-1 rounded-sm w-44"
                              />
                              <span className="text-[10px] text-muted-foreground px-1 mt-0.5">{usr.email}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={groupName}
                              onChange={(e) => handleFieldChange(usr.id, 'groupName', e.target.value || null)}
                              placeholder="Unassigned"
                              className="bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none py-0.5 px-1 rounded-sm text-xs w-40"
                            />
                          </td>
                          <td className="p-3">
                            <select
                              value={role}
                              onChange={(e) => handleFieldChange(usr.id, 'role', e.target.value)}
                              disabled={usr.role === 'OWNER'}
                              className="bg-transparent border border-border/50 rounded px-1.5 py-0.5 focus:outline-none text-xs"
                            >
                              {usr.role === 'OWNER' && <option value="OWNER">Owner</option>}
                              <option value="ADMIN">Admin</option>
                              <option value="EDITOR">Editor</option>
                              <option value="COMMENTER">Commenter</option>
                              <option value="VIEWER">Viewer</option>
                            </select>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isSaved && (
                                <span className="text-emerald-500 flex items-center gap-0.5 text-[10px] mr-2">
                                  <Check size={12} />
                                  <span>Saved</span>
                                </span>
                              )}
                              
                              {isEdited && (
                                <button
                                  onClick={() => handleSave(usr.id)}
                                  className="p-1 rounded bg-primary text-primary-foreground hover:bg-primary/95 flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-semibold cursor-pointer"
                                  title="Save Changes"
                                >
                                  <Save size={12} />
                                  <span>Save</span>
                                </button>
                              )}

                              <button
                                onClick={() => handleDelete(usr.id, usr.name)}
                                disabled={usr.id === currentUser?.id || usr.role === 'OWNER'}
                                className="p-1.5 rounded hover:bg-accent text-red-500 disabled:text-muted-foreground/30 disabled:hover:bg-transparent cursor-pointer transition-colors"
                                title="Remove User"
                              >
                                <Trash size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
