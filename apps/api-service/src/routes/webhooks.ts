import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { webhooks, webhookDeliveries } from '../db/schema.js'
import { withRls, paginated } from '../db/helpers.js'
import { hasMinRole } from '@ctm/shared-types'
import crypto from 'node:crypto'
import { v4 as uuid } from 'uuid'

// Max retry attempts before marking permanently failed
const MAX_ATTEMPTS = 5

// Exponential back-off delays in seconds: 30s, 5min, 30min, 2h, 8h
const BACKOFF_SECONDS = [30, 300, 1800, 7200, 28800]

export const webhooksRouter: FastifyPluginAsync = async (app) => {

  // ── GET /webhooks ────────────────────────────────────────────────────────────
  app.get('/', async (request) => {
    if (!hasMinRole(request.ctx.role, 'ADMIN')) {
      return { data: [], requestId: request.id }
    }
    const result = await withRls(app.db, request, async (tx) =>
      tx.select({
        id:          webhooks.id,
        url:         webhooks.url,
        events:      webhooks.events,
        enabled:     webhooks.enabled,
        createdAt:   webhooks.createdAt,
        lastFiredAt: webhooks.lastFiredAt,
      }).from(webhooks)
        .where(eq(webhooks.workspaceId, request.ctx.workspaceId)),
    )
    return { data: result, requestId: request.id }
  })

  // ── POST /webhooks ───────────────────────────────────────────────────────────
  app.post('/', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'ADMIN')) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'ADMIN role required', requestId: request.id },
      })
    }

    const body = z.object({
      url:    z.string().url(),
      events: z.array(z.string()).min(1),
    }).parse(request.body)

    const secret = crypto.randomBytes(32).toString('hex')

    const [wh] = await withRls(app.db, request, async (tx) =>
      tx.insert(webhooks).values({
        id:          uuid(),
        workspaceId: request.ctx.workspaceId,
        url:         body.url,
        secret,
        events:      body.events,
        createdBy:   request.ctx.userId,
      }).returning(),
    )

    reply.code(201)
    return { data: { ...wh, secret }, requestId: request.id }   // secret returned once
  })

  // ── GET /webhooks/:id ────────────────────────────────────────────────────────
  app.get('/:id', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'ADMIN')) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'ADMIN role required', requestId: request.id },
      })
    }

    const { id } = request.params as { id: string }
    const [wh] = await withRls(app.db, request, async (tx) =>
      tx.select().from(webhooks)
        .where(and(eq(webhooks.id, id), eq(webhooks.workspaceId, request.ctx.workspaceId)))
        .limit(1),
    )

    if (!wh) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: `Webhook ${id} not found`, requestId: request.id },
      })
    }
    // Never return the signing secret after creation
    const { secret: _, ...safeWh } = wh
    return { data: safeWh, requestId: request.id }
  })

  // ── PUT /webhooks/:id ────────────────────────────────────────────────────────
  app.put('/:id', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'ADMIN')) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'ADMIN role required', requestId: request.id },
      })
    }

    const { id } = request.params as { id: string }
    const body = z.object({
      url:     z.string().url().optional(),
      events:  z.array(z.string()).min(1).optional(),
      enabled: z.boolean().optional(),
    }).parse(request.body)

    const [updated] = await withRls(app.db, request, async (tx) =>
      tx.update(webhooks)
        .set({
          ...(body.url     !== undefined && { url:     body.url }),
          ...(body.events  !== undefined && { events:  body.events }),
          ...(body.enabled !== undefined && { enabled: body.enabled }),
        })
        .where(and(eq(webhooks.id, id), eq(webhooks.workspaceId, request.ctx.workspaceId)))
        .returning(),
    )

    if (!updated) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: `Webhook ${id} not found`, requestId: request.id },
      })
    }

    const { secret: _, ...safeUpdated } = updated
    return { data: safeUpdated, requestId: request.id }
  })

  // ── DELETE /webhooks/:id ─────────────────────────────────────────────────────
  app.delete('/:id', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'ADMIN')) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'ADMIN role required', requestId: request.id },
      })
    }

    const { id } = request.params as { id: string }
    await withRls(app.db, request, async (tx) =>
      tx.update(webhooks)
        .set({ enabled: false })
        .where(and(eq(webhooks.id, id), eq(webhooks.workspaceId, request.ctx.workspaceId))),
    )
    reply.code(204)
  })

  // ── GET /webhooks/:id/deliveries — delivery log ──────────────────────────────
  app.get('/:id/deliveries', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'ADMIN')) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'ADMIN role required', requestId: request.id },
      })
    }

    const { id } = request.params as { id: string }
    const { page = 1, pageSize = 50 } = request.query as { page?: number; pageSize?: number }
    const offset = (page - 1) * Math.min(pageSize, 200)

    const deliveries = await withRls(app.db, request, async (tx) =>
      tx.select().from(webhookDeliveries)
        .where(and(
          eq(webhookDeliveries.webhookId, id),
          eq(webhookDeliveries.workspaceId, request.ctx.workspaceId),
        ))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(Math.min(pageSize, 200))
        .offset(offset),
    )

    return paginated(deliveries, deliveries.length, page, pageSize, request.id as string)
  })

  // ── POST /webhooks/:id/retry — manually retry a failed delivery ──────────────
  app.post('/:id/retry', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'ADMIN')) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'ADMIN role required', requestId: request.id },
      })
    }

    const { id } = request.params as { id: string }
    const { deliveryId } = z.object({ deliveryId: z.string().uuid() }).parse(request.body)

    const result = await withRls(app.db, request, async (tx) => {
      const [delivery] = await tx.select().from(webhookDeliveries)
        .where(and(
          eq(webhookDeliveries.id, deliveryId),
          eq(webhookDeliveries.webhookId, id),
          eq(webhookDeliveries.workspaceId, request.ctx.workspaceId),
        ))
        .limit(1)

      if (!delivery) return null

      if (delivery.status !== 'failed') {
        return { error: `Delivery ${deliveryId} is not in failed state (current: ${delivery.status})` }
      }

      if (delivery.attempt >= MAX_ATTEMPTS) {
        return { error: `Maximum retry attempts (${MAX_ATTEMPTS}) reached` }
      }

      const nextAttempt = delivery.attempt + 1
      const [wh] = await tx.select().from(webhooks).where(eq(webhooks.id, id)).limit(1)
      if (!wh) return null

      // Schedule retry — in production this fires the delivery worker
      const [updated] = await tx.update(webhookDeliveries)
        .set({
          status:      'retrying',
          attempt:     nextAttempt,
          nextRetryAt: new Date(),
        })
        .where(eq(webhookDeliveries.id, deliveryId))
        .returning()

      // Execute delivery immediately (in-process for simplicity;
      // production would dispatch to a Temporal workflow)
      void deliverWebhook(app, wh, delivery.eventType, delivery.payload as Record<string, unknown>, deliveryId, nextAttempt)

      return updated
    })

    if (!result) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: `Delivery ${deliveryId} not found`, requestId: request.id },
      })
    }
    if ('error' in result) {
      return reply.code(409).send({
        error: { code: 'CONFLICT', message: (result as { error: string }).error, requestId: request.id },
      })
    }

    return { data: result, requestId: request.id }
  })
}

// ── Webhook delivery engine ───────────────────────────────────────────────────

/**
 * Deliver a webhook and record the attempt.
 * Called by the messaging service (M7) Kafka consumer and retry handler.
 * Exported so it can be used by the notification dispatcher.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deliverWebhook(
  app: { db: any; log: { error: (...a: unknown[]) => void; info: (...a: unknown[]) => void } },
  webhook: { id: string; url: string; secret: string; workspaceId: string },
  eventType: string,
  payload: Record<string, unknown>,
  existingDeliveryId?: string,
  attempt = 1,
): Promise<void> {
  const deliveryId = existingDeliveryId ?? uuid()
  const body = JSON.stringify({ type: eventType, payload, timestamp: Date.now(), deliveryId })
  const signature = crypto.createHmac('sha256', webhook.secret).update(body).digest('hex')

  const start = Date.now()
  let httpStatus: number | undefined
  let responseBody = ''
  let errorMessage: string | undefined

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type':     'application/json',
        'X-CTM-Signature':  `sha256=${signature}`,
        'X-CTM-Event':      eventType,
        'X-CTM-Delivery':   deliveryId,
        'X-CTM-Attempt':    String(attempt),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    })

    httpStatus = res.status
    const raw = await res.text()
    responseBody = raw.slice(0, 2048)    // truncate to 2 KB

    const success = res.status >= 200 && res.status < 300

    await updateDelivery(app, deliveryId, webhook, eventType, payload, {
      attempt,
      status:       success ? 'success' : 'failed',
      httpStatus,
      responseBody,
      durationMs:   Date.now() - start,
      ...(success            && { deliveredAt: new Date() }),
      ...(!success && attempt < MAX_ATTEMPTS && {
        nextRetryAt: new Date(Date.now() + (BACKOFF_SECONDS[attempt - 1] ?? 28800) * 1000),
      }),
    })

    // Schedule next retry if failed and under limit
    if (!success && attempt < MAX_ATTEMPTS) {
      const delay = (BACKOFF_SECONDS[attempt - 1] ?? 28800) * 1000
      setTimeout(() => {
        void deliverWebhook(app, webhook, eventType, payload, deliveryId, attempt + 1)
      }, delay)
    }
  } catch (err) {
    errorMessage = String(err)
    await updateDelivery(app, deliveryId, webhook, eventType, payload, {
      attempt,
      status:       attempt < MAX_ATTEMPTS ? 'retrying' : 'failed',
      durationMs:   Date.now() - start,
      errorMessage,
      ...(attempt < MAX_ATTEMPTS && {
        nextRetryAt: new Date(Date.now() + (BACKOFF_SECONDS[attempt - 1] ?? 28800) * 1000),
      }),
    })

    if (attempt < MAX_ATTEMPTS) {
      const delay = (BACKOFF_SECONDS[attempt - 1] ?? 28800) * 1000
      setTimeout(() => {
        void deliverWebhook(app, webhook, eventType, payload, deliveryId, attempt + 1)
      }, delay)
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateDelivery(
  app: { db: any },
  deliveryId: string,
  webhook: { id: string; workspaceId: string },
  eventType: string,
  payload: Record<string, unknown>,
  fields: Record<string, unknown>,
): Promise<void> {
  try {
    const { sql } = await import('drizzle-orm')
    await app.db.transaction(async (tx: any) => {
      await tx.execute(sql`SET LOCAL app.workspace_id = ${webhook.workspaceId}`)

      // Upsert delivery record
      await tx.insert(webhookDeliveries).values({
        id:           deliveryId,
        webhookId:    webhook.id,
        workspaceId:  webhook.workspaceId,
        eventType,
        payload,
        ...fields,
      }).onConflictDoUpdate({
        target: [webhookDeliveries.id],
        set:    fields,
      })

      // Update webhook.lastFiredAt on success
      if (fields['status'] === 'success') {
        await tx.update(webhooks)
          .set({ lastFiredAt: new Date() })
          .where(eq(webhooks.id, webhook.id))
      }
    })
  } catch {
    // Delivery log failure must never crash the main request path
  }
}
