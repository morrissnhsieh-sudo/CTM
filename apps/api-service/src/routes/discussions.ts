/**
 * Discussions routes — sheet-level threaded discussions
 *
 * GET    /sheets/:sheetId/discussions              — list discussions (COMMENTER+)
 * POST   /sheets/:sheetId/discussions              — create discussion (COMMENTER+)
 * GET    /sheets/:sheetId/discussions/:id          — get single discussion
 * PUT    /sheets/:sheetId/discussions/:id          — edit title/body (author or ADMIN)
 * DELETE /sheets/:sheetId/discussions/:id          — soft-delete (author or ADMIN)
 * PUT    /sheets/:sheetId/discussions/:id/resolve  — mark resolved (COMMENTER+)
 * POST   /sheets/:sheetId/discussions/:id/comments — add reply
 * DELETE /sheets/:sheetId/discussions/:id/comments/:commentId — delete reply
 *
 * Spec (M3.1 Smartsheet-compatible):
 *  Smartsheet uses GET/POST /sheets/:id/discussions
 *  CTM extends it with reply threading and resolution workflow.
 */

import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq, and, isNull, desc, asc } from 'drizzle-orm'
import { discussions, discussionComments, sheets } from '../db/schema.js'
import { withRls, paginated, selectFields } from '../db/helpers.js'
import { hasMinRole } from '@ctm/shared-types'
import { v4 as uuid } from 'uuid'

const CreateDiscussionBody = z.object({
  title: z.string().min(1).max(500).optional(),
  body:  z.string().min(1).max(10_000),
})

const UpdateDiscussionBody = z.object({
  title: z.string().min(1).max(500).optional(),
  body:  z.string().min(1).max(10_000).optional(),
})

const AddCommentBody = z.object({
  body: z.string().min(1).max(10_000),
})

export const discussionsRouter: FastifyPluginAsync = async (app) => {

  // ── GET /sheets/:sheetId/discussions ────────────────────────────────────────
  app.get('/:sheetId/discussions', async (request, reply) => {
    const { sheetId } = request.params as { sheetId: string }
    const {
      page     = 1,
      pageSize = 50,
      resolved,
      fields,
    } = request.query as { page?: number; pageSize?: number; resolved?: string; fields?: string }

    const result = await withRls(app.db, request, async (tx) => {
      const [sheet] = await tx.select({ id: sheets.id }).from(sheets)
        .where(and(eq(sheets.id, sheetId), eq(sheets.workspaceId, request.ctx.workspaceId)))
        .limit(1)
      if (!sheet) return null

      const filters = [
        eq(discussions.sheetId, sheetId),
        isNull(discussions.deletedAt),
        ...(resolved === 'true'  ? [eq(discussions.resolved, true)]  : []),
        ...(resolved === 'false' ? [eq(discussions.resolved, false)] : []),
      ]

      const offset = (page - 1) * Math.min(pageSize, 200)
      return tx.select().from(discussions)
        .where(and(...filters))
        .orderBy(desc(discussions.createdAt))
        .limit(Math.min(pageSize, 200))
        .offset(offset)
    })

    if (!result) {
      return reply.code(404).send({
        error: { code: 'SHEET_NOT_FOUND', message: `Sheet ${sheetId} not found`, requestId: request.id },
      })
    }

    const filtered = selectFields(result, fields)
    return paginated(filtered, filtered.length, page, pageSize, request.id as string)
  })

  // ── POST /sheets/:sheetId/discussions ───────────────────────────────────────
  app.post('/:sheetId/discussions', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'COMMENTER')) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'COMMENTER role required', requestId: request.id },
      })
    }

    const { sheetId } = request.params as { sheetId: string }
    const body = CreateDiscussionBody.parse(request.body)

    const discussion = await withRls(app.db, request, async (tx) => {
      const [sheet] = await tx.select({ id: sheets.id }).from(sheets)
        .where(and(eq(sheets.id, sheetId), eq(sheets.workspaceId, request.ctx.workspaceId)))
        .limit(1)
      if (!sheet) return null

      const [d] = await tx.insert(discussions).values({
        id:          uuid(),
        workspaceId: request.ctx.workspaceId,
        sheetId,
        ...(body.title !== undefined && { title: body.title }),
        authorId:    request.ctx.userId,
        body:        body.body,
      }).returning()

      return d
    })

    if (!discussion) {
      return reply.code(404).send({
        error: { code: 'SHEET_NOT_FOUND', message: `Sheet ${sheetId} not found`, requestId: request.id },
      })
    }

    reply.code(201)
    return { data: discussion, requestId: request.id }
  })

  // ── GET /sheets/:sheetId/discussions/:id ────────────────────────────────────
  app.get('/:sheetId/discussions/:discussionId', async (request, reply) => {
    const { sheetId, discussionId } = request.params as { sheetId: string; discussionId: string }
    const { fields } = request.query as { fields?: string }

    const result = await withRls(app.db, request, async (tx) => {
      const [d] = await tx.select().from(discussions)
        .where(and(
          eq(discussions.id, discussionId),
          eq(discussions.sheetId, sheetId),
          isNull(discussions.deletedAt),
        ))
        .limit(1)
      if (!d) return null

      const comments = await tx.select().from(discussionComments)
        .where(and(
          eq(discussionComments.discussionId, discussionId),
          isNull(discussionComments.deletedAt),
        ))
        .orderBy(asc(discussionComments.createdAt))

      return { ...d, comments }
    })

    if (!result) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: `Discussion ${discussionId} not found`, requestId: request.id },
      })
    }

    return { data: selectFields(result, fields), requestId: request.id }
  })

  // ── PUT /sheets/:sheetId/discussions/:id ────────────────────────────────────
  app.put('/:sheetId/discussions/:discussionId', async (request, reply) => {
    const { sheetId, discussionId } = request.params as { sheetId: string; discussionId: string }
    const body = UpdateDiscussionBody.parse(request.body)

    const updated = await withRls(app.db, request, async (tx) => {
      const [existing] = await tx.select().from(discussions)
        .where(and(eq(discussions.id, discussionId), eq(discussions.sheetId, sheetId), isNull(discussions.deletedAt)))
        .limit(1)
      if (!existing) return null

      // Only author or ADMIN can edit
      const canEdit = existing.authorId === request.ctx.userId || hasMinRole(request.ctx.role, 'ADMIN')
      if (!canEdit) return 'forbidden' as const

      const [d] = await tx.update(discussions)
        .set({
          ...(body.title !== undefined && { title: body.title }),
          ...(body.body  !== undefined && { body: body.body }),
          updatedAt: new Date(),
        } as any)
        .where(eq(discussions.id, discussionId))
        .returning()

      return d
    })

    if (!updated) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: `Discussion ${discussionId} not found`, requestId: request.id },
      })
    }
    if (updated === 'forbidden') {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'Only the author or an admin can edit this discussion', requestId: request.id },
      })
    }

    return { data: updated, requestId: request.id }
  })

  // ── DELETE /sheets/:sheetId/discussions/:id — soft delete ───────────────────
  app.delete('/:sheetId/discussions/:discussionId', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'COMMENTER')) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'COMMENTER role required', requestId: request.id },
      })
    }

    const { sheetId, discussionId } = request.params as { sheetId: string; discussionId: string }

    const result = await withRls(app.db, request, async (tx) => {
      const [existing] = await tx.select().from(discussions)
        .where(and(eq(discussions.id, discussionId), eq(discussions.sheetId, sheetId), isNull(discussions.deletedAt)))
        .limit(1)
      if (!existing) return null

      const canDelete = existing.authorId === request.ctx.userId || hasMinRole(request.ctx.role, 'ADMIN')
      if (!canDelete) return 'forbidden' as const

      await tx.update(discussions)
        // @ts-ignore -- Drizzle v0.41: PgUpdateSetSource excludes defaulted/nullable columns
        .set({ deletedAt: new Date() })
        .where(eq(discussions.id, discussionId))

      return 'ok' as const
    })

    if (!result) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: `Discussion ${discussionId} not found`, requestId: request.id },
      })
    }
    if (result === 'forbidden') {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'Only the author or an admin can delete this discussion', requestId: request.id },
      })
    }

    reply.code(204)
  })

  // ── PUT /sheets/:sheetId/discussions/:id/resolve ─────────────────────────────
  app.put('/:sheetId/discussions/:discussionId/resolve', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'COMMENTER')) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'COMMENTER role required', requestId: request.id },
      })
    }

    const { sheetId, discussionId } = request.params as { sheetId: string; discussionId: string }
    const { reopen = false } = request.body as { reopen?: boolean } ?? {}

    const [updated] = await withRls(app.db, request, async (tx) =>
      tx.update(discussions)
        .set({
          resolved:   !reopen,
          resolvedBy: !reopen ? request.ctx.userId : null,
          resolvedAt: !reopen ? new Date() : null,
          updatedAt:  new Date(),
        } as any)
        .where(and(
          eq(discussions.id, discussionId),
          eq(discussions.sheetId, sheetId),
          isNull(discussions.deletedAt),
        ))
        .returning(),
    )

    if (!updated) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: `Discussion ${discussionId} not found`, requestId: request.id },
      })
    }

    return { data: updated, requestId: request.id }
  })

  // ── POST /sheets/:sheetId/discussions/:id/comments — add reply ───────────────
  app.post('/:sheetId/discussions/:discussionId/comments', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'COMMENTER')) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'COMMENTER role required', requestId: request.id },
      })
    }

    const { sheetId, discussionId } = request.params as { sheetId: string; discussionId: string }
    const body = AddCommentBody.parse(request.body)

    const comment = await withRls(app.db, request, async (tx) => {
      // Verify parent discussion exists and is not deleted
      const [parent] = await tx.select({ id: discussions.id }).from(discussions)
        .where(and(
          eq(discussions.id, discussionId),
          eq(discussions.sheetId, sheetId),
          isNull(discussions.deletedAt),
        ))
        .limit(1)
      if (!parent) return null

      const [c] = await tx.insert(discussionComments).values({
        id:           uuid(),
        discussionId,
        authorId:     request.ctx.userId,
        body:         body.body,
      }).returning()

      // Touch parent updatedAt so it sorts to top
      await tx.update(discussions)
        // @ts-ignore -- Drizzle v0.41: PgUpdateSetSource excludes defaulted/nullable columns
        .set({ updatedAt: new Date() })
        .where(eq(discussions.id, discussionId))

      return c
    })

    if (!comment) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: `Discussion ${discussionId} not found`, requestId: request.id },
      })
    }

    reply.code(201)
    return { data: comment, requestId: request.id }
  })

  // ── DELETE /sheets/:sheetId/discussions/:id/comments/:commentId ──────────────
  app.delete('/:sheetId/discussions/:discussionId/comments/:commentId', async (request, reply) => {
    const { discussionId, commentId } = request.params as {
      sheetId: string; discussionId: string; commentId: string
    }

    const result = await withRls(app.db, request, async (tx) => {
      const [c] = await tx.select().from(discussionComments)
        .where(and(
          eq(discussionComments.id, commentId),
          eq(discussionComments.discussionId, discussionId),
          isNull(discussionComments.deletedAt),
        ))
        .limit(1)
      if (!c) return null

      const canDelete = c.authorId === request.ctx.userId || hasMinRole(request.ctx.role, 'ADMIN')
      if (!canDelete) return 'forbidden' as const

      await tx.update(discussionComments)
        // @ts-ignore -- Drizzle v0.41: PgUpdateSetSource excludes defaulted/nullable columns
        .set({ deletedAt: new Date() })
        .where(eq(discussionComments.id, commentId))

      return 'ok' as const
    })

    if (!result) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: `Comment ${commentId} not found`, requestId: request.id },
      })
    }
    if (result === 'forbidden') {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'Only the author or an admin can delete this comment', requestId: request.id },
      })
    }

    reply.code(204)
  })
}
