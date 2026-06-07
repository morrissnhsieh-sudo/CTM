import { Suspense } from 'react'
import { GridCanvas } from '../../../../../components/grid/GridCanvas'
import { GridSkeleton } from '../../../../../components/grid/GridSkeleton'
import { getSession } from '@/lib/session'
import { api } from '@/lib/api'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function SheetPage({
  params,
}: {
  params: Promise<{ workspaceId: string; sheetId: string }>
}) {
  const { workspaceId, sheetId } = await params
  const session = await getSession()

  if (!session) {
    redirect('/login')
  }

  let columns: any[] = []
  try {
    console.log(`[SheetPage] Fetching columns for sheetId: ${sheetId}, workspaceId: ${workspaceId}`)
    const res = await api.columns.list(sheetId, {
      accessToken: session.accessToken,
      workspaceId,
    })
    columns = res.data ?? []
    console.log(`[SheetPage] Fetched columns successfully. Count: ${columns.length}`)
  } catch (err) {
    console.error('[SheetPage] failed to fetch columns:', err)
  }

  return (
    <Suspense fallback={<GridSkeleton />}>
      <GridCanvas key={sheetId} sheetId={sheetId} workspaceId={workspaceId} columns={columns} />
    </Suspense>
  )
}


