'use client'

import { use, type ReactNode } from 'react'
import { SheetToolbar } from '../../../../../components/grid/SheetToolbar'
import { ViewPicker } from '../../../../../components/grid/ViewPicker'
import { useUIStore } from '../../../../../store/uiStore'
import { AiPanel } from '../../../../../components/ai/AiPanel'

export default function SheetLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ workspaceId: string; sheetId: string }>
}) {
  const { sheetId } = use(params)
  const { rightPanelOpen, toggleRightPanel } = useUIStore()

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <SheetToolbar />
      <ViewPicker />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-hidden relative">
          {children}
        </main>
        {rightPanelOpen && (
          <aside className="w-80 border-l border-border overflow-hidden flex-shrink-0">
            <AiPanel sheetId={sheetId} onClose={toggleRightPanel} />
          </aside>
        )}
      </div>
    </div>
  )
}
