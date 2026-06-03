import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'

export default async function RootPage() {
  const session = await getSession()
  console.log('[RootPage] session present:', !!session, 'workspaceId:', session?.user?.workspaceId)
  if (session?.user?.workspaceId) {
    console.log('[RootPage] redirecting to workspace:', `/${session.user.workspaceId}`)
    redirect(`/${session.user.workspaceId}`)
  }
  console.log('[RootPage] redirecting to /login')
  redirect('/login')
}
