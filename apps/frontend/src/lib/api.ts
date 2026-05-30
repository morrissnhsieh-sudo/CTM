/**
 * Typed API client for M3 REST endpoints.
 * Wraps fetch with auth headers, error handling, and TypeScript generics.
 */

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

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
  headers.set('Content-Type', 'application/json')

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

  return res.json() as Promise<T>
}

export const api = {
  sheets: {
    list: (opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: import('@ctm/shared-types').Sheet[] }>('/sheets', opts),

    get: (id: string, opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: import('@ctm/shared-types').Sheet }>(`/sheets/${id}`, opts),

    create: (body: { title: string; description?: string }, opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: import('@ctm/shared-types').Sheet }>('/sheets', {
        method: 'POST',
        body: JSON.stringify(body),
        ...opts,
      }),
  },

  rows: {
    list: (sheetId: string, opts: { accessToken: string; workspaceId: string }) =>
      request<{ data: (import('@ctm/shared-types').Row & { cells: import('@ctm/shared-types').Cell[] })[] }>(
        `/sheets/${sheetId}/rows`,
        opts,
      ),

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
}
