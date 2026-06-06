'use client'

import { useState, useEffect } from 'react'
import { X, File, Download, Trash, Paperclip, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { cn } from '../../lib/utils'

interface AttachmentsPanelProps {
  sheetId: string
  onClose?: () => void
}

export function AttachmentsPanel({ sheetId, onClose }: AttachmentsPanelProps) {
  const { accessToken, user } = useAuthStore()
  const [attachments, setAttachments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const workspaceId = user?.workspaceId ?? ''

  const loadAttachments = async () => {
    if (!accessToken || !workspaceId) return
    try {
      setLoading(true)
      const res = await api.attachments.list({ sheetId }, { accessToken, workspaceId })
      setAttachments(res.data ?? [])
    } catch (err) {
      console.error('Failed to load attachments:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAttachments()
  }, [sheetId, accessToken, workspaceId])

  const handleDownload = async (attachment: any) => {
    try {
      const res = await api.attachments.getDownloadUrl(attachment.id, { accessToken: accessToken!, workspaceId })
      window.open(res.data.url, '_blank')
    } catch (err) {
      alert('Failed to get download URL')
    }
  }

  const handleDelete = async (attachment: any) => {
    if (!confirm(`Delete ${attachment.filename}?`)) return
    try {
      await api.attachments.delete(attachment.id, { accessToken: accessToken!, workspaceId })
      setAttachments(prev => prev.filter(a => a.id !== attachment.id))
    } catch (err) {
      alert('Failed to delete attachment')
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const sheetAttachments = attachments.filter(a => a.scope === 'sheet')
  const rowAttachments = attachments.filter(a => a.scope === 'row')

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Paperclip size={16} className="text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Attachments</h2>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 hover:bg-accent rounded-md transition-colors">
            <X size={16} className="text-muted-foreground" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : attachments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 p-6 text-center">
            <Paperclip className="w-10 h-10 text-muted-foreground/30 mb-2" />
            <p className="text-xs font-medium text-muted-foreground">No attachments found</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Files linked to this sheet or its rows will appear here.</p>
          </div>
        ) : (
          <div className="p-4 space-y-6">
            {sheetAttachments.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Sheet Files</h3>
                <div className="space-y-2">
                  {sheetAttachments.map(a => (
                    <AttachmentItem 
                      key={a.id} 
                      attachment={a} 
                      onDownload={() => handleDownload(a)} 
                      onDelete={() => handleDelete(a)}
                      formatSize={formatSize}
                    />
                  ))}
                </div>
              </div>
            )}

            {rowAttachments.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Row Files</h3>
                <div className="space-y-2">
                  {rowAttachments.map(a => (
                    <AttachmentItem 
                      key={a.id} 
                      attachment={a} 
                      onDownload={() => handleDownload(a)} 
                      onDelete={() => handleDelete(a)}
                      formatSize={formatSize}
                      showRowInfo
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AttachmentItem({ attachment, onDownload, onDelete, formatSize, showRowInfo }: any) {
  return (
    <div className="group flex items-start gap-3 p-2 rounded-lg border border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all">
      <div className="mt-0.5 p-1.5 rounded bg-muted text-muted-foreground group-hover:text-primary transition-colors">
        <File size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-foreground truncate" title={attachment.filename}>
          {attachment.filename}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground/70">{formatSize(attachment.sizeBytes)}</span>
          {showRowInfo && attachment.rowId && (
             <span className="text-[10px] bg-muted px-1 rounded text-muted-foreground">Row Linked</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={onDownload}
          className="p-1 hover:bg-primary/10 rounded text-primary transition-colors"
          title="Download"
        >
          <Download size={14} />
        </button>
        <button 
          onClick={onDelete}
          className="p-1 hover:bg-destructive/10 rounded text-destructive transition-colors"
          title="Delete"
        >
          <Trash size={14} />
        </button>
      </div>
    </div>
  )
}
