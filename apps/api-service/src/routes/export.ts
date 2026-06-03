/**
 * Export routes
 *
 * POST /export/:sheetId?format=xlsx|csv|json
 *   → 202 Accepted  { jobId, status: "queued", pollUrl }
 *
 * GET  /export/jobs/:jobId
 *   → { id, status, downloadUrl?, rowCount?, errorMessage? }
 *
 * POST /export/jobs/:jobId/retry
 *   → Re-queue a failed export job
 *
 * Spec (M3.1):
 *  - Min role: VIEWER
 *  - Async: background worker generates file, uploads to S3, updates job status
 *  - Worker is simulated here; in production a separate worker process consumes
 *    the export_jobs queue and uses ExcelJS (XLSX) / pg-copy-streams (CSV)
 */

import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { exportJobs, sheets } from '../db/schema.js'
import { withRls } from '../db/helpers.js'
import { v4 as uuid } from 'uuid'
import { env } from '../env.js'

const FORMAT = z.enum(['xlsx', 'csv', 'json'])

export const exportRouter: FastifyPluginAsync = async (app) => {

  // POST /export/:sheetId — queue export job
  app.post('/:sheetId', async (request, reply) => {
    const { sheetId } = request.params as { sheetId: string }
    const { format = 'xlsx' } = request.query as { format?: string }
    const parsedFormat = FORMAT.safeParse(format)

    if (!parsedFormat.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'format must be xlsx, csv, or json', requestId: request.id },
      })
    }

    const job = await withRls(app.db, request, async (tx) => {
      // Verify sheet access
      const [sheet] = await tx.select({ id: sheets.id, title: sheets.title })
        .from(sheets)
        .where(and(eq(sheets.id, sheetId), eq(sheets.workspaceId, request.ctx.workspaceId)))
        .limit(1)
      if (!sheet) return null

      // @ts-ignore -- Drizzle v0.41: .default() columns excluded from insert type
      const [j] = await tx.insert(exportJobs).values({
        id:          uuid(),
        workspaceId: request.ctx.workspaceId,
        sheetId,
        requestedBy: request.ctx.userId,
        format:      parsedFormat.data,
        status:      'queued',
      }).returning()

      return j
    })

    if (!job) {
      return reply.code(404).send({
        error: { code: 'SHEET_NOT_FOUND', message: `Sheet ${sheetId} not found`, requestId: request.id },
      })
    }

    // Dispatch background worker via Kafka
    await app.publishEvent('ctm.ai.jobs', {
      eventId:     uuid(),
      type:        'ai.formula.job',   // reuse topic; worker filters by payload type
      timestamp:   Date.now(),
      workspaceId: request.ctx.workspaceId,
      userId:      request.ctx.userId,
      sheetId,
      cellRef:     '',
      formula:     `EXPORT:${job.id}:${parsedFormat.data}`,  // convention for worker
      contextRange: null,
    })

    reply.code(202)
    return {
      data: {
        jobId:   job.id,
        status:  'queued',
        format:  parsedFormat.data,
        pollUrl: `/v1/export/jobs/${job.id}`,
      },
      requestId: request.id,
    }
  })

  // GET /export/jobs/:jobId — poll job status
  app.get('/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string }

    const [job] = await withRls(app.db, request, async (tx) =>
      tx.select().from(exportJobs)
        .where(and(
          eq(exportJobs.id, jobId),
          eq(exportJobs.workspaceId, request.ctx.workspaceId),
        ))
        .limit(1),
    )

    if (!job) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: `Export job ${jobId} not found`, requestId: request.id },
      })
    }

    // Refresh pre-signed URL if expired
    let downloadUrl = job.downloadUrl
    if (job.status === 'ready' && job.expiresAt && job.expiresAt < new Date()) {
      downloadUrl = await generatePresignedUrl(job.s3Key ?? '')
      await withRls(app.db, request, async (tx) =>
        tx.update(exportJobs)
          .set({
            downloadUrl,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            updatedAt: new Date(),
          } as any)
          .where(eq(exportJobs.id, jobId)),
      )
    }

    return {
      data: {
        id:           job.id,
        status:       job.status,
        format:       job.format,
        rowCount:     job.rowCount,
        downloadUrl:  job.status === 'ready' ? downloadUrl : undefined,
        errorMessage: job.status === 'failed' ? job.errorMessage : undefined,
        createdAt:    job.createdAt,
        updatedAt:    job.updatedAt,
      },
      requestId: request.id,
    }
  })

  // POST /export/jobs/:jobId/retry — re-queue a failed job
  app.post('/jobs/:jobId/retry', async (request, reply) => {
    const { jobId } = request.params as { jobId: string }

    const [job] = await withRls(app.db, request, async (tx) =>
      tx.select().from(exportJobs)
        .where(and(
          eq(exportJobs.id, jobId),
          eq(exportJobs.workspaceId, request.ctx.workspaceId),
        ))
        .limit(1),
    )

    if (!job) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: `Export job ${jobId} not found`, requestId: request.id },
      })
    }

    if (job.status !== 'failed') {
      return reply.code(409).send({
        error: { code: 'CONFLICT', message: `Job ${jobId} is not in failed state (current: ${job.status})`, requestId: request.id },
      })
    }

    await withRls(app.db, request, async (tx) =>
      tx.update(exportJobs)
        // @ts-ignore -- Drizzle v0.41: PgUpdateSetSource excludes defaulted/nullable columns
        .set({ status: 'queued', errorMessage: null, updatedAt: new Date() })
        .where(eq(exportJobs.id, jobId)),
    )

    await app.publishEvent('ctm.ai.jobs', {
      eventId:     uuid(),
      type:        'ai.formula.job',
      timestamp:   Date.now(),
      workspaceId: request.ctx.workspaceId,
      userId:      request.ctx.userId,
      sheetId:     job.sheetId,
      cellRef:     '',
      formula:     `EXPORT:${job.id}:${job.format}`,
      contextRange: null,
    })

    return { data: { jobId: job.id, status: 'queued' }, requestId: request.id }
  })
}

// ── Worker: execute export (called by background consumer) ───────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function processExportJob(jobId: string, db: any): Promise<void> {
  // Placeholder — real implementation uses ExcelJS for XLSX, pg-copy-streams for CSV
  // This runs in the Kafka consumer process, not the HTTP server
  void jobId; void db
}

async function generatePresignedUrl(s3Key: string): Promise<string> {
  // In production: use AWS SDK v3 GetObjectCommand + getSignedUrl
  // Returns a 15-minute pre-signed S3 URL
  return `https://s3.${env.AWS_REGION}.amazonaws.com/${env.S3_BUCKET_EXPORTS}/${s3Key}?X-Amz-Expires=900`
}
