'use client'

import { useParams } from 'next/navigation'
import { type ReactNode } from 'react'
import { SheetToolbar } from '@/components/grid/SheetToolbar'
import { ViewPicker } from '@/components/grid/ViewPicker'
import { useUIStore } from '@/store/uiStore'
import { AiPanel } from '@/components/ai/AiPanel'
import { SidebarExplorer } from '@/components/navigation/SidebarExplorer'
import { AttachmentsPanel } from '@/components/grid/AttachmentsPanel'

export default function SheetLayout({
  children,
}: {
  children: ReactNode
}) {
  const params = useParams()
  const workspaceId = params?.workspaceId as string
  const sheetId = params?.sheetId as string
  const { 
    rightPanelOpen, 
    toggleRightPanel, 
    leftSidebarOpen, 
    attachmentsPanelOpen, 
    toggleAttachmentsPanel 
  } = useUIStore()

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <SheetToolbar />
      <ViewPicker />
      <div className="flex flex-1 overflow-hidden">
        {leftSidebarOpen && (
          <aside className="w-64 border-r border-border overflow-hidden flex-shrink-0">
            <SidebarExplorer workspaceId={workspaceId} activeSheetId={sheetId} />
          </aside>
        )}
        <main className="flex-1 overflow-hidden relative">
          {children}
        </main>
        {attachmentsPanelOpen && (
          <aside className="w-72 border-l border-border overflow-hidden flex-shrink-0">
            <AttachmentsPanel sheetId={sheetId} onClose={toggleAttachmentsPanel} />
          </aside>
        )}
        {rightPanelOpen && (
          <aside className="w-80 border-l border-border overflow-hidden flex-shrink-0">
            <AiPanel sheetId={sheetId} onClose={toggleRightPanel} />
          </aside>
        )}
      </div>
    </div>
  )
}
