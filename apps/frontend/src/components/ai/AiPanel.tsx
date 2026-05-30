'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Sparkles, X, ChevronDown } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { cn } from '../../lib/utils'

type AiMode = 'ask' | 'analyze' | 'generate' | 'automate'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  type?: 'text' | 'result' | 'hitl'
  formulaSuggestion?: string
  pendingActions?: unknown[]
}

interface AiPanelProps {
  sheetId: string
  onClose?: () => void
}

const MODES: { mode: AiMode; label: string; description: string }[] = [
  { mode: 'ask',      label: 'Ask',      description: 'Query data with natural language' },
  { mode: 'analyze',  label: 'Analyze',  description: 'Run AI analysis on sheet data' },
  { mode: 'generate', label: 'Generate', description: 'Generate formulas from description' },
  { mode: 'automate', label: 'Automate', description: 'Set up workflow automations' },
]

export function AiPanel({ sheetId, onClose }: AiPanelProps) {
  const { data: session } = useSession()
  const [mode, setMode] = useState<AiMode>('ask')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)

    const accessToken = (session as Record<string, unknown>)?.['accessToken'] as string
    const workspaceId = (session as Record<string, unknown>)?.['workspaceId'] as string

    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
    const endpoint = mode === 'generate' ? `${apiUrl}/v1/ai/formula` : `${apiUrl}/v1/ai/query`

    try {
      const body = mode === 'generate'
        ? { sheetId, description: input.trim(), targetCell: 'A1', contextColumns: [] }
        : { sheetId, prompt: input.trim(), mode }

      if (mode === 'generate') {
        // Non-streaming formula endpoint
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'X-Workspace-Id': workspaceId ?? '',
          },
          body: JSON.stringify(body),
        })
        const data = await resp.json() as { data?: { formula?: string; explanation?: string } }
        const formula = data.data?.formula ?? ''
        const explanation = data.data?.explanation ?? ''

        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: explanation,
          type: 'result',
          formulaSuggestion: formula,
        }])
      } else {
        // Streaming SSE
        const assistantId = crypto.randomUUID()
        setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', type: 'text' }])

        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'X-Workspace-Id': workspaceId ?? '',
          },
          body: JSON.stringify(body),
        })

        const reader = resp.body?.getReader()
        const decoder = new TextDecoder()
        if (!reader) throw new Error('No stream')

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6)) as { token?: string; explanation?: string; rows?: unknown[] }
                if (data.token) {
                  setMessages((prev) => prev.map((m) =>
                    m.id === assistantId ? { ...m, content: m.content + data.token } : m
                  ))
                }
                if (data.rows) {
                  setMessages((prev) => prev.map((m) =>
                    m.id === assistantId ? { ...m, content: data.explanation ?? m.content, type: 'result' } : m
                  ))
                }
              } catch { /* ignore parse errors */ }
            }
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        type: 'text',
      }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, mode, sheetId, session])

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Sparkles size={14} className="text-primary" />
        <span className="text-sm font-semibold flex-1">AI Assistant</span>
        {onClose && (
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Mode selector */}
      <div className="flex gap-1 px-2 py-1.5 border-b border-border overflow-x-auto">
        {MODES.map(({ mode: m, label }) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              'px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors',
              mode === m
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground text-xs py-8">
            <Sparkles size={20} className="mx-auto mb-2 text-primary/40" />
            <p className="font-medium">Ask anything about your data</p>
            <p className="mt-1 text-xs opacity-70">e.g. "What's the total revenue in Q1?"</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={cn('flex flex-col gap-1', msg.role === 'user' ? 'items-end' : 'items-start')}>
            <div className={cn(
              'max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed',
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground',
            )}>
              {msg.content || (loading && msg.role === 'assistant' ? (
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              ) : null)}
            </div>

            {/* Formula suggestion card */}
            {msg.formulaSuggestion && (
              <div className="max-w-[85%] bg-card border border-border rounded-lg p-2 text-xs space-y-2">
                <code className="block font-mono text-primary bg-primary/5 rounded px-2 py-1">
                  {msg.formulaSuggestion}
                </code>
                <button className="w-full bg-primary text-primary-foreground rounded px-2 py-1 text-xs font-medium hover:bg-primary/90 transition-colors">
                  Insert Formula
                </button>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-t border-border">
        <div className="flex gap-2 items-end bg-muted rounded-lg px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder={`${MODES.find((m) => m.mode === mode)?.description ?? 'Ask a question'}…`}
            className="flex-1 bg-transparent text-xs resize-none outline-none min-h-[20px] max-h-24 placeholder:text-muted-foreground/60"
            rows={1}
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="text-primary disabled:text-muted-foreground/30 transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground/50 text-center mt-1">
          ⌘K to open · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
