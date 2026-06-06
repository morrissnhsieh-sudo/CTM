'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { MessageCircle, X, Send, Pin, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { useUserStore } from '../../store/userStore'
import { api } from '../../lib/api'

interface ProofPin {
  id: string
  pinXPct: number
  pinYPct: number
  body: string
  authorId: string
  authorName?: string
  resolved: boolean
  createdAt: string
  comments?: Array<{ id: string; body: string; authorId: string; createdAt: string }>
}

interface ProofCanvasProps {
  /** The attachment being proofed */
  attachmentId: string
  /** Presigned download URL for the image */
  imageUrl: string
  /** Sheet that owns this attachment (needed for discussions endpoint) */
  sheetId: string
  filename?: string
  onClose?: () => void
}

export function ProofCanvas({ attachmentId, imageUrl, sheetId, filename, onClose }: ProofCanvasProps) {
  const { accessToken, workspaceId } = useUserStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const [pins, setPins] = useState<ProofPin[]>([])
  const [loading, setLoading] = useState(true)

  // Draft pin state (while user is typing a comment)
  const [draftPin, setDraftPin] = useState<{ xPct: number; yPct: number } | null>(null)
  const [draftBody, setDraftBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Selected pin for thread panel
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [expandedPins, setExpandedPins] = useState<Set<string>>(new Set())

  // Image natural dimensions (for display coordinate mapping)
  const imgRef = useRef<HTMLImageElement>(null)

  // Load existing proof-pin discussions
  const loadPins = useCallback(async () => {
    if (!accessToken || !workspaceId) return
    setLoading(true)
    try {
      const res = await api.sheets.listDiscussions(sheetId, attachmentId, { accessToken, workspaceId })
      setPins(res.data ?? [])
    } catch {
      setPins([])
    } finally {
      setLoading(false)
    }
  }, [sheetId, attachmentId, accessToken, workspaceId])

  useEffect(() => { loadPins() }, [loadPins])

  // Click on canvas → place draft pin
  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (submitting) return
    const rect = e.currentTarget.getBoundingClientRect()
    const xPct = (e.clientX - rect.left) / rect.width
    const yPct = (e.clientY - rect.top)  / rect.height
    setDraftPin({ xPct, yPct })
    setDraftBody('')
    setSelectedPinId(null)
  }, [submitting])

  // Submit the draft pin as a new proof discussion
  const handleSubmitPin = async () => {
    if (!draftPin || !draftBody.trim() || !accessToken || !workspaceId) return
    setSubmitting(true)
    try {
      await api.sheets.createDiscussion(sheetId, {
        body: draftBody.trim(),
        proofAttachmentId: attachmentId,
        pinXPct: draftPin.xPct,
        pinYPct: draftPin.yPct,
      }, { accessToken, workspaceId })
      setDraftPin(null)
      setDraftBody('')
      await loadPins()
    } catch (err) {
      console.error('Failed to create proof pin:', err)
    } finally {
      setSubmitting(false)
    }
  }

  // Submit a reply to an existing pin thread
  const handleSubmitReply = async (pinId: string) => {
    if (!replyBody.trim() || !accessToken || !workspaceId) return
    try {
      await api.sheets.addDiscussionComment(sheetId, pinId, replyBody.trim(), { accessToken, workspaceId })
      setReplyBody('')
      await loadPins()
    } catch (err) {
      console.error('Failed to add reply:', err)
    }
  }

  // Resolve / unresolve a pin
  const handleResolvePin = async (pinId: string, resolved: boolean) => {
    if (!accessToken || !workspaceId) return
    try {
      await api.sheets.resolveDiscussion(sheetId, pinId, !resolved, { accessToken, workspaceId })
      await loadPins()
    } catch (err) {
      console.error('Failed to resolve pin:', err)
    }
  }

  const selectedPin = pins.find(p => p.id === selectedPinId)

  return (
    <div className="fixed inset-0 z-50 flex bg-black/80 items-stretch" onClick={e => e.target === e.currentTarget && onClose?.()}>
      {/* Image pane */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3 text-white">
            <Pin size={16} className="text-primary" />
            <span className="font-semibold text-sm truncate max-w-xs">{filename ?? 'Proof Review'}</span>
            <span className="text-xs text-gray-400">{pins.length} annotation{pins.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Click image to add annotation</span>
            {onClose && (
              <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors text-gray-300 hover:text-white">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-auto flex items-center justify-center bg-gray-950 cursor-crosshair select-none"
          onClick={handleImageClick}
        >
          <div className="relative inline-block">
            {/* The proof image */}
            <img
              ref={imgRef}
              src={imageUrl}
              alt={filename ?? 'proof'}
              className="max-w-none block"
              style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 100px)' }}
              draggable={false}
            />

            {/* SVG overlay for pins */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {pins.map((pin, idx) => (
                <g key={pin.id}>
                  <circle
                    cx={pin.pinXPct * 100}
                    cy={pin.pinYPct * 100}
                    r="1.8"
                    fill={pin.resolved ? '#10b981' : selectedPinId === pin.id ? '#3b82f6' : '#ef4444'}
                    stroke="white"
                    strokeWidth="0.4"
                    style={{ pointerEvents: 'all', cursor: 'pointer' }}
                    onClick={e => { e.stopPropagation(); setSelectedPinId(pin.id === selectedPinId ? null : pin.id); setDraftPin(null) }}
                  />
                  <text
                    x={pin.pinXPct * 100}
                    y={pin.pinYPct * 100 + 0.5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="1.4"
                    fill="white"
                    fontWeight="bold"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {idx + 1}
                  </text>
                </g>
              ))}
            </svg>

            {/* Draft pin marker */}
            {draftPin && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${draftPin.xPct * 100}%`,
                  top: `${draftPin.yPct * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div className="w-6 h-6 rounded-full bg-primary border-2 border-white shadow-lg flex items-center justify-center animate-pulse">
                  <span className="text-white text-[10px] font-bold">{pins.length + 1}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Side panel */}
      <div className="w-80 bg-gray-900 border-l border-gray-700 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <h3 className="font-semibold text-white text-sm flex items-center gap-2">
            <MessageCircle size={14} className="text-primary" />
            {selectedPin ? 'Thread' : 'All Annotations'}
          </h3>
          {selectedPin && (
            <button
              onClick={() => setSelectedPinId(null)}
              className="mt-1 text-xs text-gray-400 hover:text-white transition-colors"
            >
              ← Back to all
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Draft pin comment form */}
          {draftPin && !selectedPin && (
            <div className="p-4 border-b border-gray-700 bg-primary/10">
              <p className="text-xs text-gray-300 mb-2 font-semibold">
                New annotation at ({Math.round(draftPin.xPct * 100)}%, {Math.round(draftPin.yPct * 100)}%)
              </p>
              <textarea
                autoFocus
                value={draftBody}
                onChange={e => setDraftBody(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && e.metaKey && handleSubmitPin()}
                placeholder="Add your comment…"
                className="w-full h-20 p-2 text-xs bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 resize-none focus:outline-none focus:border-primary"
              />
              <div className="flex gap-2 mt-2 justify-end">
                <button
                  onClick={() => setDraftPin(null)}
                  className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitPin}
                  disabled={submitting || !draftBody.trim()}
                  className="px-3 py-1.5 text-xs bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                >
                  <Send size={11} />
                  {submitting ? 'Saving…' : 'Add Pin'}
                </button>
              </div>
            </div>
          )}

          {/* Single pin thread view */}
          {selectedPin ? (
            <div className="p-4 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-white leading-relaxed">{selectedPin.body}</p>
                <button
                  onClick={() => handleResolvePin(selectedPin.id, selectedPin.resolved)}
                  className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${
                    selectedPin.resolved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-700 text-gray-400 hover:text-emerald-400'
                  }`}
                  title={selectedPin.resolved ? 'Mark unresolved' : 'Mark resolved'}
                >
                  <Check size={13} />
                </button>
              </div>

              {(selectedPin.comments ?? []).length > 0 && (
                <div className="flex flex-col gap-3 border-t border-gray-700 pt-3">
                  {selectedPin.comments!.map(c => (
                    <div key={c.id} className="text-xs text-gray-300 bg-gray-800/50 rounded-lg p-2.5">
                      {c.body}
                    </div>
                  ))}
                </div>
              )}

              {/* Reply box */}
              <div className="border-t border-gray-700 pt-3 flex gap-2 items-end">
                <textarea
                  value={replyBody}
                  onChange={e => setReplyBody(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && e.metaKey && handleSubmitReply(selectedPin.id)}
                  placeholder="Reply…"
                  rows={2}
                  className="flex-1 p-2 text-xs bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 resize-none focus:outline-none focus:border-primary"
                />
                <button
                  onClick={() => handleSubmitReply(selectedPin.id)}
                  disabled={!replyBody.trim()}
                  className="p-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  <Send size={13} />
                </button>
              </div>
            </div>
          ) : (
            /* All pins list */
            <div className="flex flex-col divide-y divide-gray-700/50">
              {loading ? (
                <div className="p-6 text-center text-xs text-gray-400 animate-pulse">Loading annotations…</div>
              ) : pins.length === 0 && !draftPin ? (
                <div className="p-6 text-center text-xs text-gray-400">
                  <Pin size={20} className="mx-auto mb-2 opacity-40" />
                  Click anywhere on the image to add an annotation
                </div>
              ) : (
                pins.map((pin, idx) => (
                  <button
                    key={pin.id}
                    onClick={() => { setSelectedPinId(pin.id); setDraftPin(null) }}
                    className={`w-full text-left p-4 hover:bg-gray-800/60 transition-colors flex gap-3 items-start ${
                      selectedPinId === pin.id ? 'bg-gray-800' : ''
                    }`}
                  >
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                      pin.resolved ? 'bg-emerald-500' : 'bg-red-500'
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-200 truncate leading-relaxed">{pin.body}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {pin.resolved && (
                          <span className="text-[10px] text-emerald-400 font-semibold">Resolved</span>
                        )}
                        {(pin.comments?.length ?? 0) > 0 && (
                          <span className="text-[10px] text-gray-500">
                            {pin.comments!.length} repl{pin.comments!.length !== 1 ? 'ies' : 'y'}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
