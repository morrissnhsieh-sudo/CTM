import { Suspense } from 'react'
import { GridCanvas } from '../../../../../components/grid/GridCanvas'
import { GridSkeleton } from '../../../../../components/grid/GridSkeleton'

export default async function SheetPage({
  params,
}: {
  params: Promise<{ workspaceId: string; sheetId: string }>
}) {
  const { sheetId } = await params

  return (
    <Suspense fallback={<GridSkeleton />}>
      <GridCanvas sheetId={sheetId} />
    </Suspense>
  )
}
