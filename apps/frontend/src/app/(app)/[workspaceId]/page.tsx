import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { getSession } from '@/lib/session'
import { api } from '@/lib/api'

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const session = await getSession()

  if (!session) {
    redirect('/login')
  }

  try {
    // Fetch list of sheets in this workspace
    const res = await api.sheets.list({
      accessToken: session.accessToken,
      workspaceId,
    })

    const sheets = res.data ?? []
    if (sheets.length > 0 && sheets[0]?.id) {
      redirect(`/${workspaceId}/sheets/${sheets[0].id}`)
    }

    // No sheets exist yet — resolve a project to create the default sheet under.
    // Every sheet now requires a projectId (SPEC-003).
    const projectsRes = await api.pm.listProjects({ accessToken: session.accessToken, workspaceId })
    let defaultProjectId: string | undefined = projectsRes.data?.[0]?.id

    if (!defaultProjectId) {
      // No projects yet — create a General project (requires PjM or Admin role).
      const created = await api.pm.createProject(
        { name: 'General' },
        { accessToken: session.accessToken, workspaceId },
      )
      defaultProjectId = created.data?.id
    }

    if (!defaultProjectId) {
      throw new Error('No project available. Ask your workspace Admin or PjM to create a project first.')
    }

    // Create the default sheet under the resolved project
    const newSheet = await api.sheets.create(
      { title: 'Untitled Sheet', description: 'Your first spreadsheet', projectId: defaultProjectId },
      { accessToken: session.accessToken, workspaceId },
    )

    if (newSheet.data?.id) {
      redirect(`/${workspaceId}/sheets/${newSheet.data.id}`)
    }

    throw new Error('Failed to create default sheet')
  } catch (err) {
    if (isRedirectError(err)) {
      throw err
    }
    console.error('[WorkspacePage] failed to load or create sheets:', err)
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 max-w-md w-full text-center space-y-4">
          <h1 className="text-2xl font-bold text-red-600 dark:text-red-400">Failed to load workspace</h1>
          <p className="text-gray-600 dark:text-gray-300 text-sm">
            We couldn't load or initialize your workspace spreadsheet. Please try again.
          </p>
          <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl text-left border border-gray-100 dark:border-gray-800">
            <code className="text-xs text-red-500 font-mono break-all">{String(err)}</code>
          </div>
          <a
            href="/login"
            className="inline-block w-full py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold transition"
          >
            Go back to Login
          </a>
        </div>
      </div>
    )
  }
}
