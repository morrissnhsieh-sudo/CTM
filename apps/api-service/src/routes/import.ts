/**
 * Import routes
 *
 * POST /import
 *   Multipart upload: accepts xlsx or csv file, queues async import job.
 *   Body: multipart/form-data { file, format?, sheetTitle? }
 *   Query: ?workspaceId=&format=xlsx|csv
 *   → 202 Accepted { jobId, status: "queued", pollUrl }
 *
 * GET /import/jobs/:jobId
 *   → { id, status, sheetId?, rowsImported, rowsFailed, errorMessage?, rowErrors? }
 *
 * Spec (M3.1):
 *  - Min role: EDITOR
 *  - File uploaded to S3 ctm-imports bucket; worker processes async
 *  - Row-level validation errors collected and returned in rowErrors (max 100)
 *  - For batches > 100 rows, formulas deferred to ctm.ai.jobs
 */

import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { importJobs } from '../db/schema.js'
import { withRls } from '../db/helpers.js'
import { hasMinRole } from '@ctm/shared-types'
import { v4 as uuid } from 'uuid'
import crypto from 'node:crypto'
import { env } from '../env.js'

const FORMAT = z.enum(['xlsx', 'csv'])

export const importRouter: FastifyPluginAsync = async (app) => {

  // POST /import — upload file and queue import job
  app.post('/', {
    config: { rawBody: true },   // needed for multipart
  }, async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'EDITOR')) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'EDITOR role required to import data', requestId: request.id },
      })
    }

    const query = z.object({
      format:     z.enum(['xlsx', 'csv']).optional(),
      sheetTitle: z.string().min(1).max(255).optional(),
    }).parse(request.query)

    // ── Parse multipart file upload ───────────────────────────────────────────
    // @fastify/multipart must be registered on the app instance.
    // `request.file` is injected by the plugin at runtime; cast to any for type safety.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const multipartFn = (request as any).file as (() => Promise<{ filename: string; mimetype: string; toBuffer: () => Promise<Buffer> } | undefined>) | undefined
    const data = multipartFn ? await multipartFn() : undefined

    if (!data) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'No file uploaded. Use multipart/form-data with field "file"', requestId: request.id },
      })
    }

    const fileBuffer = await data.toBuffer()
    if (fileBuffer.length === 0) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Uploaded file is empty', requestId: request.id },
      })
    }

    const MAX_SIZE_BYTES = 100 * 1024 * 1024  // 100 MB
    if (fileBuffer.length > MAX_SIZE_BYTES) {
      return reply.code(413).send({
        error: { code: 'FILE_TOO_LARGE', message: 'File exceeds 100 MB limit', requestId: request.id },
      })
    }

    // Detect format from extension if not specified
    const filename = data.filename ?? 'upload'
    const ext = filename.split('.').pop()?.toLowerCase()
    const formatRaw = query.format ?? (ext === 'csv' ? 'csv' : 'xlsx')
    const parsedFormat = FORMAT.safeParse(formatRaw)
    if (!parsedFormat.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'format must be xlsx or csv', requestId: request.id },
      })
    }

    // ── Upload to S3 ──────────────────────────────────────────────────────────
    const s3Key = `imports/${request.ctx.workspaceId}/${uuid()}.${parsedFormat.data}`
    await uploadToS3(s3Key, fileBuffer, data.mimetype)

    // ── Create import job ─────────────────────────────────────────────────────
    const jobRow = await withRls(app.db, request, async (tx) => {
      // @ts-ignore -- Drizzle v0.41: .default() columns excluded from insert type
      const [j] = await tx.insert(importJobs).values({
        id:           uuid(),
        workspaceId:  request.ctx.workspaceId,
        requestedBy:  request.ctx.userId,
        format:       parsedFormat.data,
        originalName: filename,
        s3Key,
        status:       'queued',
      }).returning()
      return j
    })

    if (!jobRow) {
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to create import job', requestId: request.id },
      })
    }

    // Dispatch to background worker
    await app.publishEvent('ctm.ai.jobs', {
      eventId:     uuid(),
      type:        'ai.formula.job',
      timestamp:   Date.now(),
      workspaceId: request.ctx.workspaceId,
      userId:      request.ctx.userId,
      sheetId:     '',
      cellRef:     '',
      formula:     `IMPORT:${jobRow.id}:${parsedFormat.data}:${encodeURIComponent(query.sheetTitle ?? filename)}`,
      contextRange: null,
    })

    reply.code(202)
    return {
      data: {
        jobId:    jobRow.id,
        status:   'queued',
        format:   parsedFormat.data,
        filename,
        pollUrl:  `/v1/import/jobs/${jobRow.id}`,
      },
      requestId: request.id,
    }
  })

  // GET /import/jobs/:jobId — poll import job status
  app.get('/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string }

    const [job] = await withRls(app.db, request, async (tx) =>
      tx.select().from(importJobs)
        .where(and(
          eq(importJobs.id, jobId),
          eq(importJobs.workspaceId, request.ctx.workspaceId),
        ))
        .limit(1),
    )

    if (!job) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: `Import job ${jobId} not found`, requestId: request.id },
      })
    }

    return {
      data: {
        id:           job.id,
        status:       job.status,
        format:       job.format,
        originalName: job.originalName,
        sheetId:      job.sheetId,          // set when complete → the new sheet
        rowsImported: job.rowsImported,
        rowsFailed:   job.rowsFailed,
        errorMessage: job.status === 'failed' ? job.errorMessage : undefined,
        rowErrors:    job.rowErrors,         // per-row validation errors (max 100)
        createdAt:    job.createdAt,
        updatedAt:    job.updatedAt,
      },
      requestId: request.id,
    }
  })
}

// ── Worker stub: process import job ───────────────────────────────────────────
// In production this runs as a separate process consuming ctm.ai.jobs.
// It downloads the file from S3, parses XLSX/CSV with ExcelJS/csv-parse,
// creates a new sheet with detected columns, inserts rows in batches, and
// updates the import_jobs record with final status.

export async function processImportJob(jobId: string): Promise<void> {
  void jobId   // placeholder
}

async function uploadToS3(key: string, buffer: Buffer, mimeType: string): Promise<void> {
  // In production: AWS SDK v3 PutObjectCommand
  // For now: log and continue (dev mode)
  void key; void buffer; void mimeType
}
