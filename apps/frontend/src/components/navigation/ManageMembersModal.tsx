'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
import { X, Users, Save, Check, UserPlus, Trash2 } from 'lucide-react'

interface ManageMembersModalProps {
  workspaceId: string
  type: 'project' | 'folder'
  targetId: string
  targetName: string
  isOpen: boolean
  onClose: () => void
}

export function ManageMembersModal({
  workspaceId,
  type,
  targetId,
  targetName,
  isOpen,
  onClose
}: ManageMembersModalProps) {
  const { accessToken } = useAuthStore()
  const [workspaceUsers, setWorkspaceUsers] = useState<any[]>([])
  const [currentMembers, setCurrentMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)

  // Selection states
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRole, setSelectedRole] = useState<'MANAGER' | 'MEMBER'>('MEMBER')

  const loadData = async () => {
    if (!accessToken || !workspaceId || !targetId) return
    try {
      setLoading(true)
      const usersRes = await api.users.list({ accessToken, workspaceId })
      setWorkspaceUsers(usersRes.data || [])

      if (type === 'project') {
        const membersRes = await api.pm.getProjectMembers(targetId, { accessToken, workspaceId })
        setCurrentMembers(membersRes.data || [])
      } else {
        const membersRes = await api.folders.getFolderMembers(targetId, { accessToken, workspaceId })
        setCurrentMembers(
          (membersRes.data || []).map(m => ({
            userId: m.userId,
            role: 'MEMBER', // Folders don't have role distinctions, just access
            name: m.name,
            email: m.email
          }))
        )
      }
    } catch (err) {
      console.error('Failed to load members data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadData()
      setSaved(false)
    }
  }, [isOpen, targetId, workspaceId, accessToken])

  if (!isOpen) return null

  const handleAddMember = () => {
    if (!selectedUserId) return
    const user = workspaceUsers.find(u => u.id === selectedUserId)
    if (!user) return

    // Avoid duplicates
    if (currentMembers.some(m => m.userId === selectedUserId)) {
      alert('User is already assigned.')
      return
    }

    setCurrentMembers(prev => [
      ...prev,
      {
        userId: user.id,
        role: selectedRole,
        name: user.name,
        email: user.email
      }
    ])
    setSelectedUserId('')
  }

  const handleRemoveMember = (userId: string) => {
    setCurrentMembers(prev => prev.filter(m => m.userId !== userId))
  }

  const handleRoleChange = (userId: string, role: 'MANAGER' | 'MEMBER') => {
    setCurrentMembers(prev =>
      prev.map(m => (m.userId === userId ? { ...m, role } : m))
    )
  }

  const handleSave = async () => {
    if (!accessToken) return
    try {
      setSubmitting(true)
      if (type === 'project') {
        await api.pm.updateProjectMembers(
          targetId,
          {
            members: currentMembers.map(m => ({
              userId: m.userId,
              role: m.role
            }))
          },
          { accessToken, workspaceId }
        )
      } else {
        await api.folders.updateFolderMembers(
          targetId,
          {
            userIds: currentMembers.map(m => m.userId)
          },
          { accessToken, workspaceId }
        )
      }
      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        onClose()
      }, 1000)
    } catch (err) {
      console.error('Failed to save members:', err)
      alert('Failed to save member assignments.')
    } finally {
      setSubmitting(false)
    }
  }

  // Filter out already added users for the select option
  const availableUsers = workspaceUsers.filter(
    usr => !currentMembers.some(m => m.userId === usr.id)
  )

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-2">
            <Users className="text-primary w-4 h-4" />
            <h2 className="text-sm font-bold truncate">
              Manage Access: {targetName}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-accent text-muted-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* Add member picker */}
          <div className="bg-accent/40 border border-border/50 rounded-lg p-3 space-y-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Assign User
            </span>
            <div className="flex items-center gap-2">
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                className="flex-1 h-8 px-2 rounded border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Select a user...</option>
                {availableUsers.map(usr => (
                  <option key={usr.id} value={usr.id}>
                    {usr.name} ({usr.email})
                  </option>
                ))}
              </select>

              {type === 'project' && (
                <select
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value as any)}
                  className="w-24 h-8 px-2 rounded border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="MEMBER">Member</option>
                  <option value="MANAGER">Manager</option>
                </select>
              )}

              <button
                type="button"
                onClick={handleAddMember}
                disabled={!selectedUserId}
                className="h-8 px-3 bg-primary hover:bg-primary/95 disabled:bg-muted disabled:text-muted-foreground text-primary-foreground font-semibold text-xs rounded transition-colors flex items-center gap-1 cursor-pointer"
              >
                <UserPlus size={12} />
                <span>Assign</span>
              </button>
            </div>
          </div>

          {/* Members list */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Assigned Members
            </span>

            {loading ? (
              <div className="text-center py-6 text-xs text-muted-foreground">
                Loading assignments...
              </div>
            ) : currentMembers.length === 0 ? (
              <div className="text-center py-6 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                No user assigned. Default access permission rules apply.
              </div>
            ) : (
              <div className="border border-border rounded-lg divide-y divide-border overflow-hidden bg-card">
                {currentMembers.map(member => (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between px-3 py-2 text-xs hover:bg-accent/10 transition-colors"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold truncate">{member.name}</span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {member.email}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {type === 'project' && (
                        <select
                          value={member.role}
                          onChange={e => handleRoleChange(member.userId, e.target.value as any)}
                          className="bg-transparent border border-border/50 rounded px-1.5 py-0.5 focus:outline-none text-[11px]"
                        >
                          <option value="MEMBER">Member</option>
                          <option value="MANAGER">Manager</option>
                        </select>
                      )}

                      <button
                        onClick={() => handleRemoveMember(member.userId)}
                        className="p-1 hover:bg-accent rounded text-red-500 transition-colors"
                        title="Remove Assignment"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border flex justify-end gap-2 bg-card">
          <button
            onClick={onClose}
            className="h-8 px-3.5 rounded text-xs hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={submitting}
            className="h-8 px-3.5 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs rounded transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            {saved ? (
              <>
                <Check size={12} />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save size={12} />
                <span>Save Assignments</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  )
}
