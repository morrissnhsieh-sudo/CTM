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

/** Build a standard paginated response */
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
