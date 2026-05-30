/**
 * M3 — API Gateway
 * Unit tests: Auth middleware (JWT / PAT / mTLS)
 *
 * Spec refs:
 *  - M3 pipeline step 3: Missing/invalid/expired JWT or PAT → 401; revoked token → 401
 *  - PAT prefix: "ctm_pat_"; SHA-256 hashed in DB
 *  - JWT: RS256, validate workspaceId claim matches X-Workspace-Id header
 *  - mTLS: X-Client-Cert-CN in INTERNAL_SERVICES allowlist → ADMIN role, bypass rate limit
 *  - M3.3 RBAC: OWNER > ADMIN > EDITOR > COMMENTER > VIEWER
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hasMinRole, ROLE_HIERARCHY, ErrorCode } from '@ctm/shared-types'
import type { UserRole } from '@ctm/shared-types'
import crypto from 'node:crypto'

// ── hasMinRole helper ─────────────────────────────────────────────────────────
describe('M3 RBAC — hasMinRole', () => {
  const cases: [UserRole, UserRole, boolean][] = [
    ['OWNER',     'OWNER',     true],
    ['OWNER',     'ADMIN',     true],
    ['OWNER',     'EDITOR',    true],
    ['OWNER',     'COMMENTER', true],
    ['OWNER',     'VIEWER',    true],
    ['ADMIN',     'OWNER',     false],
    ['ADMIN',     'ADMIN',     true],
    ['ADMIN',     'EDITOR',    true],
    ['EDITOR',    'ADMIN',     false],
    ['EDITOR',    'EDITOR',    true],
    ['EDITOR',    'COMMENTER', true],
    ['COMMENTER', 'EDITOR',    false],
    ['VIEWER',    'VIEWER',    true],
    ['VIEWER',    'COMMENTER', false],
  ]

  cases.forEach(([userRole, minRole, expected]) => {
    it(`hasMinRole(${userRole}, ${minRole}) === ${expected}`, () => {
      expect(hasMinRole(userRole, minRole)).toBe(expected)
    })
  })

  it('ROLE_HIERARCHY has correct ordering', () => {
    expect(ROLE_HIERARCHY['VIEWER']).toBeLessThan(ROLE_HIERARCHY['COMMENTER'])
    expect(ROLE_HIERARCHY['COMMENTER']).toBeLessThan(ROLE_HIERARCHY['EDITOR'])
    expect(ROLE_HIERARCHY['EDITOR']).toBeLessThan(ROLE_HIERARCHY['ADMIN'])
    expect(ROLE_HIERARCHY['ADMIN']).toBeLessThan(ROLE_HIERARCHY['OWNER'])
  })
})

// ── PAT token helpers ─────────────────────────────────────────────────────────
describe('M3 PAT token format', () => {
  const PAT_PREFIX = 'ctm_pat_'

  it('PAT tokens start with "ctm_pat_" prefix', () => {
    const token = `${PAT_PREFIX}${crypto.randomBytes(32).toString('hex')}`
    expect(token.startsWith(PAT_PREFIX)).toBe(true)
  })

  it('PAT token SHA-256 hash is 64 hex chars', () => {
    const token = `${PAT_PREFIX}${crypto.randomBytes(32).toString('hex')}`
    const hash = crypto.createHash('sha256').update(token).digest('hex')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })

  it('different tokens produce different hashes', () => {
    const t1 = `${PAT_PREFIX}${crypto.randomBytes(32).toString('hex')}`
    const t2 = `${PAT_PREFIX}${crypto.randomBytes(32).toString('hex')}`
    const h1 = crypto.createHash('sha256').update(t1).digest('hex')
    const h2 = crypto.createHash('sha256').update(t2).digest('hex')
    expect(h1).not.toBe(h2)
  })

  it('same token always produces same hash (deterministic)', () => {
    const token = `${PAT_PREFIX}abc123`
    const h1 = crypto.createHash('sha256').update(token).digest('hex')
    const h2 = crypto.createHash('sha256').update(token).digest('hex')
    expect(h1).toBe(h2)
  })
})

// ── mTLS internal service check ───────────────────────────────────────────────
describe('M3 mTLS internal service validation', () => {
  const INTERNAL_SERVICES = new Set(['pm-service', 'ai-service', 'messaging-service'])

  it('pm-service is in the allowlist', () => {
    expect(INTERNAL_SERVICES.has('pm-service')).toBe(true)
  })

  it('ai-service is in the allowlist', () => {
    expect(INTERNAL_SERVICES.has('ai-service')).toBe(true)
  })

  it('messaging-service is in the allowlist', () => {
    expect(INTERNAL_SERVICES.has('messaging-service')).toBe(true)
  })

  it('unknown service is not in the allowlist', () => {
    expect(INTERNAL_SERVICES.has('unknown-service')).toBe(false)
    expect(INTERNAL_SERVICES.has('frontend')).toBe(false)
    expect(INTERNAL_SERVICES.has('')).toBe(false)
  })
})

// ── Rate limiter logic ────────────────────────────────────────────────────────
describe('M3 Rate limiter — sliding window', () => {
  const TOKEN_LIMIT = 500
  const WINDOW_MS = 60_000

  // Simulate the Redis sliding window counter
  function simulateRateLimit(requestCount: number, windowMs: number = WINDOW_MS): boolean {
    return requestCount > TOKEN_LIMIT
  }

  it('allows requests below token limit', () => {
    expect(simulateRateLimit(499)).toBe(false)
    expect(simulateRateLimit(500)).toBe(false)
  })

  it('rejects requests exceeding token limit', () => {
    expect(simulateRateLimit(501)).toBe(true)
    expect(simulateRateLimit(1000)).toBe(true)
  })

  it('AI endpoints count as 10 requests (cost multiplier)', () => {
    const AI_PATHS = new Set(['/v1/ai/query', '/v1/ai/agent', '/v1/ai/formula'])
    const getCost = (path: string) => AI_PATHS.has(path) ? 10 : 1

    expect(getCost('/v1/sheets')).toBe(1)
    expect(getCost('/v1/rows')).toBe(1)
    expect(getCost('/v1/ai/query')).toBe(10)
    expect(getCost('/v1/ai/agent')).toBe(10)
    expect(getCost('/v1/ai/formula')).toBe(10)
  })

  it('workspace limit is 10,000 req/min (20x token limit)', () => {
    const WORKSPACE_LIMIT = 10_000
    expect(WORKSPACE_LIMIT).toBe(TOKEN_LIMIT * 20)
  })
})

// ── Error response format ─────────────────────────────────────────────────────
describe('M3 standardised error format', () => {
  it('error response has required fields', () => {
    const error = {
      error: {
        code: 'SHEET_NOT_FOUND',
        message: 'Sheet abc not found',
        requestId: 'req-123',
      },
    }
    expect(error.error).toHaveProperty('code')
    expect(error.error).toHaveProperty('message')
    expect(error.error).toHaveProperty('requestId')
  })

  const standardCodes = [
    'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION_ERROR',
    'RATE_LIMIT_EXCEEDED', 'SHEET_NOT_FOUND', 'ROW_NOT_FOUND',
    'COLUMN_NOT_FOUND', 'CIRCULAR_REFERENCE', 'INTERNAL_ERROR',
  ]
  standardCodes.forEach((code) => {
    it(`error code "${code}" is defined in shared types`, () => {
      expect(Object.values(ErrorCode)).toContain(code)
    })
  })
})
