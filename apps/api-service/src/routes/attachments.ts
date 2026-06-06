import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { attachments } from '../db/schema.js'
import { withRls } from '../db/helpers.js'
import { hasMinRole } from '@ctm/shared-types'
import { v4 as uuid } from 'uuid'
import { env } from '../env.js'
import { getPresignedUrl } from '../lib/s3.js'

const PresignBody = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  scope: z.enum(['row', 'sheet', 'workspace']),
  rowId: z.string().uuid().optional().nullable(),
  colId: z.string().uuid().optional().nullable(),
  sheetId: z.string().uuid().optional().nullable(),
})

const ConfirmBody = z.object({
  attachmentId: z.string().uuid(),
})

export const attachmentsRouter: FastifyPluginAsync = async (app) => {
  // POST /v1/attachments/presign
  app.post('/presign', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'EDITOR')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'EDITOR role required to upload attachments', requestId: request.id } })
    }

    const body = PresignBody.parse(request.body)
    const attachmentId = uuid()
    const s3Key = `attachments/${request.ctx.workspaceId}/${attachmentId}/${body.filename}`

    const presignedUrl = getPresignedUrl({
      method: 'PUT',
      bucket: env.S3_BUCKET_ATTACHMENTS,
      key: s3Key,
      expiresInSeconds: 300,
    })

    const record = await withRls(app.db, request, async (tx) => {
      const [inserted] = await tx.insert(attachments).values({
        id: attachmentId,
        workspaceId: request.ctx.workspaceId,
        rowId: body.rowId ?? null,
        colId: body.colId ?? null,
        sheetId: body.sheetId ?? null,
        filename: body.filename,
        s3Key,
        sizeBytes: body.sizeBytes,
        mimeType: body.mimeType,
        uploadedBy: request.ctx.userId,
        scope: body.scope,
      } as any).returning()
      return inserted
    })

    return {
      data: {
        attachment: record,
        presignedUrl,
        s3Key,
      },
      requestId: request.id,
    }
  })

  // POST /v1/attachments/confirm
  app.post('/confirm', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'EDITOR')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'EDITOR role required', requestId: request.id } })
    }

    const body = ConfirmBody.parse(request.body)

    const [attachment] = await withRls(app.db, request, async (tx) =>
      tx.select().from(attachments).where(eq(attachments.id, body.attachmentId)).limit(1)
    )

    if (!attachment) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Attachment not found', requestId: request.id } })
    }

    // Verify object exists in MinIO/S3
    const downloadUrl = getPresignedUrl({
      method: 'GET',
      bucket: env.S3_BUCKET_ATTACHMENTS,
      key: attachment.s3Key,
      expiresInSeconds: 60,
    })

    let uploadOk = false
    try {
      const res = await fetch(downloadUrl, { method: 'HEAD' })
      uploadOk = res.status === 200
    } catch (err) {
      app.log.error(err, 'Failed to verify S3 upload via HEAD request')
    }

    if (!uploadOk) {
      return reply.code(400).send({ error: { code: 'UPLOAD_NOT_FOUND', message: 'File not found in storage. Ensure upload completed.', requestId: request.id } })
    }

    return {
      data: attachment,
      requestId: request.id,
    }
  })

  // GET /v1/attachments
  app.get('/', async (request, reply) => {
    const { scope, rowId, sheetId } = request.query as { scope?: string; rowId?: string; sheetId?: string }

    const result = await withRls(app.db, request, async (tx) => {
      let query = tx.select().from(attachments).where(isNull(attachments.deletedAt)).$dynamic()

      if (scope === 'row') {
        query = query.where(eq(attachments.scope, 'row'))
        if (rowId) query = query.where(eq(attachments.rowId, rowId))
        if (sheetId) query = query.where(eq(attachments.sheetId, sheetId))
      } else if (scope === 'sheet' && sheetId) {
        query = query.where(and(eq(attachments.scope, 'sheet'), eq(attachments.sheetId, sheetId)))
      } else if (scope === 'workspace') {
        query = query.where(and(eq(attachments.scope, 'workspace'), eq(attachments.workspaceId, request.ctx.workspaceId)))
      } else {
        // Default: filter by workspace, and optionally sheetId
        query = query.where(eq(attachments.workspaceId, request.ctx.workspaceId))
        if (sheetId) query = query.where(eq(attachments.sheetId, sheetId))
      }

      return query
    })

    return { data: result, requestId: request.id }
  })

  // GET /v1/attachments/:id/download
  app.get('/:id/download', async (request, reply) => {
    const { id } = request.params as { id: string }

    const [attachment] = await withRls(app.db, request, async (tx) =>
      tx.select().from(attachments).where(and(eq(attachments.id, id), isNull(attachments.deletedAt))).limit(1)
    )

    if (!attachment) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Attachment not found', requestId: request.id } })
    }

    const downloadUrl = getPresignedUrl({
      method: 'GET',
      bucket: env.S3_BUCKET_ATTACHMENTS,
      key: attachment.s3Key,
      expiresInSeconds: 900,
    })

    return {
      data: {
        url: downloadUrl,
        expiresIn: 900,
      },
      requestId: request.id,
    }
  })

  // DELETE /v1/attachments/:id
  app.delete('/:id', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'EDITOR')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'EDITOR role required', requestId: request.id } })
    }

    const { id } = request.params as { id: string }

    const [updated] = await withRls(app.db, request, async (tx) =>
      tx.update(attachments)
        .set({ deletedAt: new Date() } as any)
        .where(and(eq(attachments.id, id), eq(attachments.workspaceId, request.ctx.workspaceId)))
        .returning()
    )

    if (!updated) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Attachment not found', requestId: request.id } })
    }

    reply.code(204)
    return
  })
}
