import type { ReactNode } from 'react'
import { SheetToolbar } from '../../../../../components/grid/SheetToolbar'
import { ViewPicker } from '../../../../../components/grid/ViewPicker'

export default function SheetLayout({
  children,
  grid,
  panel,
  params,
}: {
  children: ReactNode
  grid: ReactNode
  panel: ReactNode
  params: Promise<{ workspaceId: string; sheetId: string }>
}) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <SheetToolbar />
      <ViewPicker />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-hidden relative">
          {grid ?? children}
        </main>
        <aside className="w-80 border-l border-border overflow-hidden flex-shrink-0">
          {panel}
        </aside>
      </div>
    </div>
  )
}
