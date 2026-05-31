import type { FastifyRequest } from 'fastify'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from './schema.js'
import { sql } from 'drizzle-orm'

type DB = NodePgDatabase<typeof schema>

/**
 * Wraps a Drizzle query with RLS SET LOCAL context.
 * MUST be called for every database operation that touches user data.
 */
export async function withRls<T>(
  db: DB,
  request: FastifyRequest,
  fn: (tx: DB) => Promise<T>,
): Promise<T> {
  const { workspaceId, userId } = request.ctx
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.workspace_id = ${workspaceId}`)
    await tx.execute(sql`SET LOCAL app.user_id = ${userId}`)
    return fn(tx as unknown as DB)
  })
}

/** Build a standard offset-paginated response */
export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
  requestId: string,
) {
  return {
    data,
    page,
    pageSize,
    total,
    hasNextPage: page * pageSize < total,
    requestId,
  }
}

// ─── Cursor pagination ────────────────────────────────────────────────────────

export interface CursorPayload {
  lastId: string
  lastPosition: number
}

/** Encode a cursor payload to base64url string */
export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

/** Decode a cursor string. Returns null if malformed. */
export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf-8')
    const parsed = JSON.parse(raw) as CursorPayload
    if (!parsed.lastId || parsed.lastPosition === undefined) return null
    return parsed
  } catch {
    return null
  }
}

/** Build a cursor-paginated response */
export function cursorPaginated<T extends { id: string; position: number }>(
  data: T[],
  pageSize: number,
  requestId: string,
) {
  const last = data[data.length - 1]
  const nextCursor = last && data.length === pageSize
    ? encodeCursor({ lastId: last.id, lastPosition: last.position })
    : null

  return { data, nextCursor, requestId }
}

// ─── Field selection ──────────────────────────────────────────────────────────

/**
 * Filter an object (or array of objects) to only include the requested fields.
 * Usage: selectFields(row, '?fields=id,title,updatedAt')
 *
 * - If `fields` is undefined/empty → return full object unchanged.
 * - Unknown field names are silently ignored.
 */
export function selectFields<T extends Record<string, unknown>>(
  data: T,
  fields: string | undefined,
): Partial<T>
export function selectFields<T extends Record<string, unknown>>(
  data: T[],
  fields: string | undefined,
): Partial<T>[]
export function selectFields<T extends Record<string, unknown>>(
  data: T | T[],
  fields: string | undefined,
): Partial<T> | Partial<T>[] {
  if (!fields?.trim()) return data as Partial<T> | Partial<T>[]

  const keys = fields.split(',').map((k) => k.trim()).filter(Boolean)
  if (!keys.length) return data as Partial<T> | Partial<T>[]

  const pick = (obj: T): Partial<T> => {
    const out: Partial<T> = {}
    for (const k of keys) {
      if (k in obj) (out as Record<string, unknown>)[k] = obj[k]
    }
    return out
  }

  return Array.isArray(data) ? data.map(pick) : pick(data)
}
