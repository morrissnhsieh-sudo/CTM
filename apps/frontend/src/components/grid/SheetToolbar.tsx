'use client'

import { Bold, Italic, AlignLeft, AlignCenter, AlignRight, Type, Hash, Calendar, ChevronDown, Undo2, Redo2 } from 'lucide-react'
import { useGridStore } from '../../store/gridStore'
import { useUIStore } from '../../store/uiStore'
import { cn } from '../../lib/utils'

export function SheetToolbar() {
  const { activeCell, selection, applyFormat, undo, redo, formatCache } = useGridStore()
  const { toggleRightPanel, rightPanelOpen } = useUIStore()

  const cellRef = activeCell
    ? `${String.fromCharCode(65 + activeCell.col)}${activeCell.row + 1}`
    : ''

  const activeKey = activeCell ? `r${activeCell.row}c${activeCell.col}` : ''
  const activeFormat = activeKey ? formatCache.get(activeKey) || {} : {}

  const isBold = !!activeFormat.bold
  const isItalic = !!activeFormat.italic
  const textAlign = activeFormat.textAlign || 'left'

  return (
    <div className="h-10 border-b border-border bg-card flex items-center gap-1 px-2 flex-shrink-0">
      {/* Cell reference box */}
      <div className="w-20 h-7 border border-border rounded px-2 text-xs font-mono text-muted-foreground flex items-center">
        {cellRef || 'A1'}
      </div>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Undo/Redo */}
      <ToolbarButton icon={<Undo2 size={14} />} title="Undo (⌘Z)" onClick={undo} />
      <ToolbarButton icon={<Redo2 size={14} />} title="Redo (⌘Y)" onClick={redo} />

      <div className="w-px h-6 bg-border mx-1" />

      {/* Format */}
      <ToolbarButton
        icon={<Bold size={14} />}
        title="Bold (⌘B)"
        active={isBold}
        onClick={() => applyFormat({ bold: !isBold })}
      />
      <ToolbarButton
        icon={<Italic size={14} />}
        title="Italic (⌘I)"
        active={isItalic}
        onClick={() => applyFormat({ italic: !isItalic })}
      />

      <div className="w-px h-6 bg-border mx-1" />

      {/* Alignment */}
      <ToolbarButton
        icon={<AlignLeft size={14} />}
        title="Align left"
        active={textAlign === 'left'}
        onClick={() => applyFormat({ textAlign: 'left' })}
      />
      <ToolbarButton
        icon={<AlignCenter size={14} />}
        title="Align center"
        active={textAlign === 'center'}
        onClick={() => applyFormat({ textAlign: 'center' })}
      />
      <ToolbarButton
        icon={<AlignRight size={14} />}
        title="Align right"
        active={textAlign === 'right'}
        onClick={() => applyFormat({ textAlign: 'right' })}
      />

      <div className="w-px h-6 bg-border mx-1" />

      {/* Column type */}
      <button className="h-7 px-2 rounded text-xs flex items-center gap-1 text-muted-foreground hover:bg-accent transition-colors">
        <Type size={12} />
        <span>Text</span>
        <ChevronDown size={10} />
      </button>

      <div className="flex-1" />

      {/* Right panel toggle */}
      <button
        onClick={toggleRightPanel}
        className={cn(
          'h-7 px-3 rounded text-xs transition-colors',
          rightPanelOpen
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent',
        )}
      >
        AI Panel
      </button>
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
        'h-7 w-7 rounded flex items-center justify-center transition-colors',
        active ? 'bg-accent text-accent-foreground font-semibold border border-border' : 'text-muted-foreground hover:bg-accent',
      )}
    >
      {icon}
    </button>
  )
}
