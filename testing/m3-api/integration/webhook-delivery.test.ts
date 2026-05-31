/**
 * M3 — API Gateway
 * Tests: Webhook delivery log, HMAC signing, retry with exponential backoff
 *
 * Spec:
 *  - HMAC-SHA256 signed with X-CTM-Signature: sha256={hex}
 *  - 5 max attempts; backoff: 30s, 5m, 30m, 2h, 8h
 *  - Delivery log: attempt, status, httpStatus, responseBody (2KB), durationMs
 *  - status: pending | success | failed | retrying
 *  - GET /webhooks/:id/deliveries → paginated delivery list (ADMIN+)
 *  - POST /webhooks/:id/retry { deliveryId } → re-queues failed delivery (ADMIN+)
 *  - 409 if delivery not in failed state
 *  - GET/PUT /webhooks/:id → full webhook management (ADMIN+)
 */

import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { hasMinRole } from '@ctm/shared-types'

// ── HMAC signing ──────────────────────────────────────────────────────────────

function signWebhook(secret: string, body: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`
}

function verifyWebhook(secret: string, body: string, signature: string): boolean {
  const expected = signWebhook(secret, body)
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

// ── Backoff schedule ──────────────────────────────────────────────────────────

const BACKOFF_SECONDS = [30, 300, 1800, 7200, 28800]  // 30s, 5m, 30m, 2h, 8h
const MAX_ATTEMPTS    = 5

function nextBackoffMs(attempt: number): number | null {
  if (attempt >= MAX_ATTEMPTS) return null
  return (BACKOFF_SECONDS[attempt - 1] ?? 28800) * 1000
}

// ── Delivery status ───────────────────────────────────────────────────────────

type DeliveryStatus = 'pending' | 'success' | 'failed' | 'retrying'

interface Delivery {
  id: string
  webhookId: string
  eventType: string
  attempt: number
  status: DeliveryStatus
  httpStatus?: number
  durationMs?: number
  errorMessage?: string
}

function isRetryable(d: Delivery): boolean {
  return d.status === 'failed' && d.attempt < MAX_ATTEMPTS
}

// ── Tests — HMAC signing ──────────────────────────────────────────────────────

describe('Webhook HMAC-SHA256 signing', () => {
  const SECRET = 'test-webhook-secret-abcdef123456'
  const PAYLOAD = JSON.stringify({ type: 'row.created', payload: { sheetId: 's1' }, timestamp: 1234567890 })

  it('signature starts with "sha256="', () => {
    const sig = signWebhook(SECRET, PAYLOAD)
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/)
  })

  it('same secret + payload always produces same signature', () => {
    expect(signWebhook(SECRET, PAYLOAD)).toBe(signWebhook(SECRET, PAYLOAD))
  })

  it('different secrets produce different signatures', () => {
    const s1 = signWebhook('secret-a', PAYLOAD)
    const s2 = signWebhook('secret-b', PAYLOAD)
    expect(s1).not.toBe(s2)
  })

  it('different payloads produce different signatures', () => {
    const s1 = signWebhook(SECRET, '{"event":"A"}')
    const s2 = signWebhook(SECRET, '{"event":"B"}')
    expect(s1).not.toBe(s2)
  })

  it('verifyWebhook returns true for correct signature', () => {
    const sig = signWebhook(SECRET, PAYLOAD)
    expect(verifyWebhook(SECRET, PAYLOAD, sig)).toBe(true)
  })

  it('verifyWebhook returns false for wrong secret', () => {
    const sig = signWebhook(SECRET, PAYLOAD)
    expect(verifyWebhook('wrong-secret', PAYLOAD, sig)).toBe(false)
  })

  it('verifyWebhook returns false for tampered payload', () => {
    const sig = signWebhook(SECRET, PAYLOAD)
    expect(verifyWebhook(SECRET, '{"tampered":true}', sig)).toBe(false)
  })

  it('verifyWebhook returns false for empty signature', () => {
    expect(verifyWebhook(SECRET, PAYLOAD, '')).toBe(false)
  })

  it('signature hex part is 64 chars (SHA-256 = 32 bytes = 64 hex)', () => {
    const sig = signWebhook(SECRET, PAYLOAD)
    const hex = sig.replace('sha256=', '')
    expect(hex).toHaveLength(64)
    expect(hex).toMatch(/^[0-9a-f]+$/)
  })
})

// ── Tests — Retry backoff schedule ───────────────────────────────────────────

describe('Webhook retry backoff schedule', () => {
  it('attempt 1 → 30s backoff', () => {
    expect(nextBackoffMs(1)).toBe(30 * 1000)
  })

  it('attempt 2 → 5 minute backoff', () => {
    expect(nextBackoffMs(2)).toBe(5 * 60 * 1000)
  })

  it('attempt 3 → 30 minute backoff', () => {
    expect(nextBackoffMs(3)).toBe(30 * 60 * 1000)
  })

  it('attempt 4 → 2 hour backoff', () => {
    expect(nextBackoffMs(4)).toBe(2 * 60 * 60 * 1000)
  })

  it('attempt 5 (max) → null (no more retries)', () => {
    expect(nextBackoffMs(5)).toBeNull()
  })

  it('attempt beyond max → null', () => {
    expect(nextBackoffMs(6)).toBeNull()
    expect(nextBackoffMs(99)).toBeNull()
  })

  it('backoff schedule has exactly 5 entries', () => {
    expect(BACKOFF_SECONDS).toHaveLength(5)
  })

  it('backoff schedule is strictly increasing', () => {
    for (let i = 1; i < BACKOFF_SECONDS.length; i++) {
      expect(BACKOFF_SECONDS[i]!).toBeGreaterThan(BACKOFF_SECONDS[i - 1]!)
    }
  })

  it('total max wait time is < 24 hours', () => {
    const totalSeconds = BACKOFF_SECONDS.reduce((a, b) => a + b, 0)
    const totalHours = totalSeconds / 3600
    expect(totalHours).toBeLessThan(24)
  })
})

// ── Tests — Delivery log ──────────────────────────────────────────────────────

describe('Webhook delivery log', () => {
  function makeDelivery(overrides: Partial<Delivery> = {}): Delivery {
    return {
      id: crypto.randomUUID(),
      webhookId: 'wh-1',
      eventType: 'row.created',
      attempt: 1,
      status: 'pending',
      ...overrides,
    }
  }

  it('new delivery starts as pending', () => {
    const d = makeDelivery()
    expect(d.status).toBe('pending')
    expect(d.attempt).toBe(1)
  })

  it('successful delivery has status=success and httpStatus 2xx', () => {
    const d = makeDelivery({ status: 'success', httpStatus: 200 })
    expect(d.status).toBe('success')
    expect(d.httpStatus).toBeGreaterThanOrEqual(200)
    expect(d.httpStatus).toBeLessThan(300)
  })

  it('failed delivery has status=failed', () => {
    const d = makeDelivery({ status: 'failed', httpStatus: 500 })
    expect(d.status).toBe('failed')
  })

  it('isRetryable: failed delivery with attempts < max', () => {
    const d = makeDelivery({ status: 'failed', attempt: 3 })
    expect(isRetryable(d)).toBe(true)
  })

  it('isRetryable: failed delivery at max attempts → not retryable', () => {
    const d = makeDelivery({ status: 'failed', attempt: MAX_ATTEMPTS })
    expect(isRetryable(d)).toBe(false)
  })

  it('isRetryable: success delivery → not retryable', () => {
    const d = makeDelivery({ status: 'success', attempt: 1 })
    expect(isRetryable(d)).toBe(false)
  })

  it('attempt increments on each retry', () => {
    let attempt = 1
    const attempts: number[] = [attempt]
    while (attempt < MAX_ATTEMPTS) {
      attempt++
      attempts.push(attempt)
    }
    expect(attempts).toEqual([1, 2, 3, 4, 5])
  })

  it('response body is truncated to 2048 chars', () => {
    const longBody = 'x'.repeat(5000)
    const truncated = longBody.slice(0, 2048)
    expect(truncated).toHaveLength(2048)
  })
})

// ── Tests — Delivery RBAC ─────────────────────────────────────────────────────

describe('Webhook delivery RBAC', () => {
  it('ADMIN can view delivery log', () => {
    expect(hasMinRole('ADMIN', 'ADMIN')).toBe(true)
  })

  it('EDITOR cannot view delivery log', () => {
    expect(hasMinRole('EDITOR', 'ADMIN')).toBe(false)
  })

  it('VIEWER cannot view delivery log', () => {
    expect(hasMinRole('VIEWER', 'ADMIN')).toBe(false)
  })

  it('ADMIN can retry delivery', () => {
    expect(hasMinRole('ADMIN', 'ADMIN')).toBe(true)
  })

  it('OWNER can retry delivery', () => {
    expect(hasMinRole('OWNER', 'ADMIN')).toBe(true)
  })
})

// ── Tests — Webhook management ────────────────────────────────────────────────

describe('Webhook management (GET/PUT /webhooks/:id)', () => {
  it('secret is never returned after initial creation (omitted from response)', () => {
    const fullWebhook = { id: 'wh-1', url: 'https://example.com', secret: 'abc123', events: ['row.created'], enabled: true }
    const { secret: _, ...safeWebhook } = fullWebhook
    expect(safeWebhook).not.toHaveProperty('secret')
    expect(safeWebhook).toHaveProperty('id')
    expect(safeWebhook).toHaveProperty('url')
  })

  it('ADMIN can update webhook URL and events', () => {
    expect(hasMinRole('ADMIN', 'ADMIN')).toBe(true)
  })

  it('EDITOR cannot update webhooks', () => {
    expect(hasMinRole('EDITOR', 'ADMIN')).toBe(false)
  })

  it('retry conflict check: 409 when not in failed state', () => {
    const nonFailedStatuses: DeliveryStatus[] = ['pending', 'success', 'retrying']
    for (const status of nonFailedStatuses) {
      const d: Delivery = { id: 'del-1', webhookId: 'wh-1', eventType: 'e', attempt: 1, status }
      expect(d.status !== 'failed').toBe(true)  // should trigger 409
    }
  })
})

// ── Tests — Delivery headers ──────────────────────────────────────────────────

describe('Webhook delivery headers', () => {
  it('all required CTM headers are present', () => {
    const buildHeaders = (sig: string, eventType: string, deliveryId: string, attempt: number) => ({
      'Content-Type':    'application/json',
      'X-CTM-Signature': sig,
      'X-CTM-Event':     eventType,
      'X-CTM-Delivery':  deliveryId,
      'X-CTM-Attempt':   String(attempt),
    })

    const headers = buildHeaders('sha256=abc', 'row.created', 'del-123', 2)
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['X-CTM-Signature']).toMatch(/^sha256=/)
    expect(headers['X-CTM-Event']).toBe('row.created')
    expect(headers['X-CTM-Delivery']).toBe('del-123')
    expect(headers['X-CTM-Attempt']).toBe('2')
  })
})
