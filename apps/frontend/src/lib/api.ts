/**
 * Typed API client for M3 REST endpoints.
 * Wraps fetch with auth headers, error handling, and TypeScript generics.
 */

const isServer = typeof window === 'undefined'
const API_URL = isServer
  ? (process.env['AUTH_API_BASE'] ?? 'http://api-service:3001')
  : (process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001')

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public requestId: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { accessToken?: string; workspaceId?: string } = {},
): Promise<T> {
  const { accessToken, workspaceId, ...fetchOptions } = options

  const headers = new Headers(fetchOptions.headers)
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  if (workspaceId) headers.set('X-Workspace-Id', workspaceId)
  if (fetchOptions.body) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`${API_URL}/v1${path}`, { ...fetchOptions, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { code: 'UNKNOWN', message: res.statusText, requestId: '' } })) as {
      error?: { code?: string; message?: string; requestId?: string }
    }
    throw new ApiError(
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? res.statusText,
      res.status,
      body.error?.requestId ?? '',
    )
  }
  if (res.status === 204) {
    return null as unknown as T
  }

  return res.json() as Promise<T>
}

export const api = {
  sheets: {
    list: (opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: import('@ctm/shared-types').Sheet[] }>('/sheets', opts),

    get: (id: string, opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: import('@ctm/shared-types').Sheet }>(`/sheets/${id}`, opts),

    create: (body: { title: string; description?: string; folderId?: string | null; projectId?: string }, opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: import('@ctm/shared-types').Sheet }>('/sheets', {
        method: 'POST',
        body: JSON.stringify(body),
        ...opts,
      }),

    update: (
      id: string,
      body: Partial<{ title: string; description: string | null; projectId: string | null; settings: any; folderId: string | null }>,
      opts: { accessToken: string; workspaceId: string },
    ) =>
      request<{ data: import('@ctm/shared-types').Sheet }>(`/sheets/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
        ...opts,
      }),

    favorites: (opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: import('@ctm/shared-types').Sheet[] }>('/sheets/favorites', opts),

    recents: (opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: import('@ctm/shared-types').Sheet[] }>('/sheets/recents', opts),

    toggleFavorite: (id: string, isFavorite: boolean, opts: { accessToken: string; workspaceId: string }) =>
      request<{ success: boolean }>(`/sheets/${id}/favorite`, {
        method: 'POST',
        body: JSON.stringify({ isFavorite }),
        ...opts,
      }),

    copy: (
      id: string,
      body: { title?: string; workspaceId?: string; includeData?: boolean },
      opts: { accessToken: string; workspaceId: string }
    ) =>
      request<{ data: any }>(`/sheets/${id}/copy`, {
        method: 'POST',
        body: JSON.stringify(body),
        ...opts,
      }),

    delete: (id: string, opts: { accessToken: string; workspaceId: string }) =>
      request<void>(`/sheets/${id}`, {
        method: 'DELETE',
        ...opts,
      }),

    getShared: (token: string) =>
      request<{ data: { sheet: any; columns: any[]; rows: any[]; cells: any[] } }>(`/sheets/shared/${token}`),

    // ── Discussions (used by ProofCanvas) ──────────────────────
    listDiscussions: (sheetId: string, proofAttachmentId: string, opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: any[] }>(`/sheets/${sheetId}/discussions?proofAttachmentId=${proofAttachmentId}`, opts),

    createDiscussion: (
      sheetId: string,
      body: { body: string; proofAttachmentId?: string; pinXPct?: number; pinYPct?: number },
      opts: { accessToken: string; workspaceId: string },
    ) =>
      request<{ data: any }>(`/sheets/${sheetId}/discussions`, {
        method: 'POST',
        body: JSON.stringify(body),
        ...opts,
      }),

    addDiscussionComment: (sheetId: string, discussionId: string, body: string, opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: any }>(`/sheets/${sheetId}/discussions/${discussionId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
        ...opts,
      }),

    resolveDiscussion: (sheetId: string, discussionId: string, resolved: boolean, opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: any }>(`/sheets/${sheetId}/discussions/${discussionId}/resolve`, {
        method: 'PUT',
        body: JSON.stringify({ resolved }),
        ...opts,
      }),
  },

  attachments: {
    list: (query: { scope?: 'row' | 'sheet' | 'workspace'; rowId?: string; sheetId?: string }, opts: { accessToken: string; workspaceId: string }) => {
      const params = new URLSearchParams()
      if (query.scope) params.append('scope', query.scope)
      if (query.rowId) params.append('rowId', query.rowId)
      if (query.sheetId) params.append('sheetId', query.sheetId)
      const qs = params.toString()
      return request<{ data: any[] }>(qs ? `/attachments?${qs}` : '/attachments', opts)
    },
    presign: (body: { filename: string; mimeType: string; sizeBytes: number; scope: 'row' | 'sheet' | 'workspace'; rowId?: string | null; sheetId?: string | null }, opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: { attachment: any; presignedUrl: string; s3Key: string } }>('/attachments/presign', {
        method: 'POST',
        body: JSON.stringify(body),
        ...opts,
      }),
    confirm: (attachmentId: string, opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: any }>('/attachments/confirm', {
        method: 'POST',
        body: JSON.stringify({ attachmentId }),
        ...opts,
      }),
    getDownloadUrl: (id: string, opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: { url: string; expiresIn: number } }>(`/attachments/${id}/download`, opts),
    delete: (id: string, opts: { accessToken: string; workspaceId: string }) =>
      request<void>(`/attachments/${id}`, {
        method: 'DELETE',
        ...opts,
      }),
  },

  folders: {
    list: (opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: import('@ctm/shared-types').Folder[] }>('/folders', opts),

    create: (body: { name: string; parentId?: string | null; projectId?: string | null }, opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: import('@ctm/shared-types').Folder }>('/folders', {
        method: 'POST',
        body: JSON.stringify(body),
        ...opts,
      }),

    update: (id: string, body: Partial<{ name: string; parentId: string | null }>, opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: import('@ctm/shared-types').Folder }>(`/folders/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
        ...opts,
      }),

    delete: (id: string, opts: { accessToken: string; workspaceId: string }) =>
      request<void>(`/folders/${id}`, {
        method: 'DELETE',
        ...opts,
      }),

    getFolderMembers: (id: string, opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: Array<{ userId: string; name: string; email: string }> }>(`/folders/${id}/members`, opts),

    updateFolderMembers: (id: string, body: { userIds: string[] }, opts: { accessToken: string; workspaceId: string }) =>
      request<{ success: boolean }>(`/folders/${id}/members`, {
        method: 'PUT',
        body: JSON.stringify(body),
        ...opts,
      }),
  },

  users: {
    list: (opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: Array<{ id: string; email: string; name: string; role: string; groupName: string | null; organizationName: string | null; employeeId: string | null; tel: string | null }> }>('/users', opts),
    updateMe: (
      body: { name?: string; avatarUrl?: string | null; organizationName?: string | null; employeeId?: string | null; tel?: string | null },
      opts: { accessToken: string; workspaceId: string }
    ) =>
      request<{
        data: {
          id: string
          email: string
          name: string
          avatarUrl: string | null
          organizationName: string | null
          employeeId: string | null
          tel: string | null
          role: string
          workspaceId: string
        }
      }>('/users/me', {
        method: 'PUT',
        body: JSON.stringify(body),
        ...opts,
      }),
    create: (
      body: { email: string; name: string; role: string; groupName?: string | null; password?: string },
      opts: { accessToken: string; workspaceId: string }
    ) =>
      request<{ data: any }>('/users', {
        method: 'POST',
        body: JSON.stringify(body),
        ...opts,
      }),
    update: (
      id: string,
      body: { name?: string; role?: string; groupName?: string | null },
      opts: { accessToken: string; workspaceId: string }
    ) =>
      request<{ data: any }>(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
        ...opts,
      }),
    delete: (id: string, opts: { accessToken: string; workspaceId: string }) =>
      request<void>(`/users/${id}`, {
        method: 'DELETE',
        ...opts,
      }),
  },

  rows: {
    list: (sheetId: string, opts: { accessToken: string; workspaceId: string, page?: number, pageSize?: number, cursor?: string }) => {
      const { accessToken, workspaceId, ...query } = opts
      const params = new URLSearchParams()
      if (query.page) params.append('page', String(query.page))
      if (query.pageSize) params.append('pageSize', String(query.pageSize))
      if (query.cursor) params.append('cursor', query.cursor)
      const qs = params.toString()
      return request<{ data: (import('@ctm/shared-types').Row & { cells: import('@ctm/shared-types').Cell[] })[] }>(
        qs ? `/sheets/${sheetId}/rows?${qs}` : `/sheets/${sheetId}/rows`,
        { accessToken, workspaceId },
      )
    },

    insert: (sheetId: string, rows: import('@ctm/shared-types').RowInsertRequest[], opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: import('@ctm/shared-types').Row[] }>(`/sheets/${sheetId}/rows`, {
        method: 'POST',
        body: JSON.stringify({ rows }),
        ...opts,
      }),
  },

  columns: {
    list: (sheetId: string, opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: import('@ctm/shared-types').Column[] }>(`/sheets/${sheetId}/columns`, opts),

    update: (
      sheetId: string,
      colId: string,
      body: Partial<Omit<import('@ctm/shared-types').Column, 'id' | 'sheetId'>>,
      opts: { accessToken: string; workspaceId: string },
    ) =>
      request<{ data: import('@ctm/shared-types').Column }>(`/sheets/${sheetId}/columns/${colId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
        ...opts,
      }),
  },

  cells: {
    update: (
      sheetId: string,
      rowId: string,
      colId: string,
      value: import('@ctm/shared-types').CellValue,
      opts: { accessToken: string; workspaceId: string },
    ) =>
      request<{ data: import('@ctm/shared-types').Cell }>(`/sheets/${sheetId}/rows/${rowId}/cells/${colId}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
        ...opts,
      }),
  },

  ai: {
    formula: (body: import('@ctm/shared-types').AiFormulaRequest, opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: import('@ctm/shared-types').AiFormulaResponse }>('/ai/formula', {
        method: 'POST',
        body: JSON.stringify(body),
        ...opts,
      }),
  },
  pm: {
    listProjects: async (opts: { accessToken: string; workspaceId: string }) => {
      const res = await request<{ data: any[] }>('/projects', opts)
      return {
        ...res,
        data: (res.data || []).map((p: any) => ({
          id: p.id ?? p.ID,
          name: p.name ?? p.Name,
          workspaceId: p.workspaceId ?? p.WorkspaceID,
          status: p.status ?? p.Status,
          startDate: p.startDate ?? p.StartDate,
          endDate: p.endDate ?? p.EndDate,
          settings: p.settings ?? p.Settings,
          createdBy: p.createdBy ?? p.CreatedBy,
        }))
      }
    },

    createProject: async (body: { name: string }, opts: { accessToken: string; workspaceId: string }) => {
      const res = await request<{ data: any }>('/projects', {
        method: 'POST',
        body: JSON.stringify(body),
        ...opts,
      })
      if (res && res.data) {
        const p = res.data
        res.data = {
          id: p.id ?? p.ID,
          name: p.name ?? p.Name,
          workspaceId: p.workspaceId ?? p.WorkspaceID,
          status: p.status ?? p.Status,
          startDate: p.startDate ?? p.StartDate,
          endDate: p.endDate ?? p.EndDate,
          settings: p.settings ?? p.Settings,
          createdBy: p.createdBy ?? p.CreatedBy,
        }
      }
      return res
    },

    deleteProject: (projectId: string, opts: { accessToken: string; workspaceId: string }) =>
      request<void>(`/projects/${projectId}`, {
        method: 'DELETE',
        ...opts,
      }),

    getProjectMembers: (projectId: string, opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: Array<{ userId: string; role: 'MANAGER' | 'MEMBER'; name: string; email: string }> }>(`/projects/${projectId}/members`, opts),

    updateProjectMembers: (projectId: string, body: { members: Array<{ userId: string; role: 'MANAGER' | 'MEMBER' }> }, opts: { accessToken: string; workspaceId: string }) =>
      request<{ success: boolean }>(`/projects/${projectId}/members`, {
        method: 'PUT',
        body: JSON.stringify(body),
        ...opts,
      }),

    listTasks: (projectId: string, opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: Array<{ id: string; projectId: string; sheetId: string; rowId: string; name: string }> }>(`/projects/${projectId}/tasks`, opts),

    createTask: (
      projectId: string,
      body: { sheetId: string; rowId: string; name: string; startDate?: string; endDate?: string; assigneeId?: string },
      opts: { accessToken: string; workspaceId: string },
    ) =>
      request<{ data: any }>(`/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(body),
        ...opts,
      }),

    getResources: (projectId: string, opts: { accessToken: string; workspaceId: string }) =>
      request<{
        data: {
          allocations: Array<{
            id: string
            resourceId: string
            projectId: string
            allocationPercent: number
            startDate: string
            endDate: string
          }>
          resourceLoads: Record<string, {
            resourceId: string
            allocations: Array<{
              id: string
              resourceId: string
              projectId: string
              allocationPercent: number
              startDate: string
              endDate: string
            }>
            totalLoad: number
            isOverAllocated: boolean
          }>
        }
      }>(`/projects/${projectId}/resources`, opts),

    createAllocation: (
      projectId: string,
      body: { resourceId: string; allocationPercent: number; startDate: string; endDate: string },
      opts: { accessToken: string; workspaceId: string },
    ) =>
      request<{ data: any }>(`/projects/${projectId}/resources`, {
        method: 'POST',
        body: JSON.stringify(body),
        ...opts,
      }),

    getRollup: (projectId: string, opts: { accessToken: string; workspaceId: string }) =>
      request<{
        data: {
          projectId: string
          totalTasks: number
          completedTasks: number
          progressPercent: number
          totalScheduledDays: number
          actualLoggedHours: number
        }
      }>(`/projects/${projectId}/rollup`, opts),

    logTime: (
      body: { rowId: string; note: string; startedAt?: string; endedAt?: string },
      opts: { accessToken: string; workspaceId: string },
    ) =>
      request<{ data: any }>(`/projects/time`, {
        method: 'POST',
        body: JSON.stringify(body),
        ...opts,
      }),

    cascadeTask: (
      projectId: string,
      taskId: string,
      body: { startDate?: string; endDate?: string; finishDate?: string },
      opts: { accessToken: string; workspaceId: string },
    ) =>
      request<{
        data: {
          updatedTasks: Array<{
            id: string
            startDate: string
            endDate: string
            durationDays: number
            isCritical: boolean
            floatDays: number
          }>
          criticalPath: {
            taskIds: string[]
            totalDuration: number
          }
        }
      }>(`/projects/${projectId}/tasks/${taskId}/cascade`, {
        method: 'POST',
        body: JSON.stringify(body),
        ...opts,
      }),

    listBaselines: (
      projectId: string,
      opts: { accessToken: string; workspaceId: string },
    ) =>
      request<{
        data: Array<{
          id: string
          projectId: string
          name: string
          createdAt: string
          createdBy: string
        }>
      }>(`/projects/${projectId}/baselines`, opts),

    getBaseline: (
      projectId: string,
      baselineId: string,
      opts: { accessToken: string; workspaceId: string },
    ) =>
      request<{
        data: {
          id: string
          projectId: string
          name: string
          snapshot: any[]
          createdAt: string
          createdBy: string
        }
      }>(`/projects/${projectId}/baselines/${baselineId}`, opts),

    createBaseline: (
      projectId: string,
      body: { name: string },
      opts: { accessToken: string; workspaceId: string },
    ) =>
      request<{ data: any }>(`/projects/${projectId}/baseline`, {
        method: 'POST',
        body: JSON.stringify(body),
        ...opts,
      }),

    injectTemplate: (
      projectId: string,
      templateId: string,
      body: { sheetId: string; rowIds: string[] },
      opts: { accessToken: string; workspaceId: string },
    ) =>
      request<{ data: any[] }>(`/projects/${projectId}/templates/${templateId}`, {
        method: 'POST',
        body: JSON.stringify(body),
        ...opts,
      }),
  },
}
