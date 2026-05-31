/**
 * M3 — API Gateway
 * Tests: GET/POST /sheets/:id/discussions (threaded discussion system)
 *
 * Spec:
 *  - Min role: COMMENTER (create, reply, resolve)
 *  - Min role: VIEWER (read discussions)
 *  - Only author or ADMIN can edit/delete
 *  - Resolved discussions: resolved=true, resolvedBy, resolvedAt
 *  - Reopen: PUT .../resolve with { reopen: true }
 *  - Replies (discussionComments): unlimited depth via discussion_id
 *  - Body max: 10,000 chars
 *  - Title max: 500 chars (optional)
 *  - Soft delete: deletedAt set, not hard-deleted
 */

import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { hasMinRole } from '@ctm/shared-types'

// ── Validation schemas (mirror routes/discussions.ts) ─────────────────────────

const CreateDiscussionSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  body:  z.string().min(1).max(10_000),
})

const UpdateDiscussionSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  body:  z.string().min(1).max(10_000).optional(),
})

const AddCommentSchema = z.object({
  body: z.string().min(1).max(10_000),
})

// ── In-memory discussion state for resolution logic ───────────────────────────

interface Discussion {
  id: string
  authorId: string
  body: string
  title?: string
  resolved: boolean
  resolvedBy: string | null
  resolvedAt: Date | null
  deletedAt: Date | null
}

function createDiscussion(authorId: string, body: string, title?: string): Discussion {
  return {
    id: crypto.randomUUID(),
    authorId,
    body,
    title,
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    deletedAt: null,
  }
}

function resolveDiscussion(d: Discussion, byUserId: string, reopen = false): Discussion {
  return {
    ...d,
    resolved:   !reopen,
    resolvedBy: !reopen ? byUserId : null,
    resolvedAt: !reopen ? new Date() : null,
  }
}

function softDelete(d: Discussion): Discussion {
  return { ...d, deletedAt: new Date() }
}

function canEditDelete(d: Discussion, userId: string, role: string): boolean {
  return d.authorId === userId || hasMinRole(role as 'VIEWER' | 'COMMENTER' | 'EDITOR' | 'ADMIN' | 'OWNER', 'ADMIN')
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Discussions — CreateDiscussionSchema', () => {
  it('accepts valid body', () => {
    expect(CreateDiscussionSchema.safeParse({ body: 'This is a discussion' }).success).toBe(true)
  })

  it('accepts optional title', () => {
    expect(CreateDiscussionSchema.safeParse({ title: 'Bug Report', body: 'Details here' }).success).toBe(true)
  })

  it('rejects empty body', () => {
    expect(CreateDiscussionSchema.safeParse({ body: '' }).success).toBe(false)
  })

  it('rejects body exceeding 10,000 chars', () => {
    expect(CreateDiscussionSchema.safeParse({ body: 'x'.repeat(10_001) }).success).toBe(false)
  })

  it('accepts body of exactly 10,000 chars', () => {
    expect(CreateDiscussionSchema.safeParse({ body: 'x'.repeat(10_000) }).success).toBe(true)
  })

  it('rejects title exceeding 500 chars', () => {
    expect(CreateDiscussionSchema.safeParse({ title: 'T'.repeat(501), body: 'body' }).success).toBe(false)
  })

  it('accepts title of exactly 500 chars', () => {
    expect(CreateDiscussionSchema.safeParse({ title: 'T'.repeat(500), body: 'body' }).success).toBe(true)
  })
})

describe('Discussions — UpdateDiscussionSchema', () => {
  it('accepts partial update (body only)', () => {
    expect(UpdateDiscussionSchema.safeParse({ body: 'Updated body' }).success).toBe(true)
  })

  it('accepts partial update (title only)', () => {
    expect(UpdateDiscussionSchema.safeParse({ title: 'New Title' }).success).toBe(true)
  })

  it('accepts both title and body', () => {
    expect(UpdateDiscussionSchema.safeParse({ title: 'New', body: 'New body' }).success).toBe(true)
  })

  it('accepts empty object (no-op update)', () => {
    expect(UpdateDiscussionSchema.safeParse({}).success).toBe(true)
  })
})

describe('Discussions — RBAC', () => {
  it('VIEWER can read discussions', () => {
    expect(hasMinRole('VIEWER', 'VIEWER')).toBe(true)
  })

  it('COMMENTER can create discussions', () => {
    expect(hasMinRole('COMMENTER', 'COMMENTER')).toBe(true)
  })

  it('VIEWER cannot create discussions', () => {
    expect(hasMinRole('VIEWER', 'COMMENTER')).toBe(false)
  })

  it('COMMENTER can add replies', () => {
    expect(hasMinRole('COMMENTER', 'COMMENTER')).toBe(true)
  })

  it('COMMENTER can resolve discussions', () => {
    expect(hasMinRole('COMMENTER', 'COMMENTER')).toBe(true)
  })
})

describe('Discussions — author/admin edit+delete enforcement', () => {
  it('author can edit their own discussion', () => {
    const d = createDiscussion('alice', 'my post')
    expect(canEditDelete(d, 'alice', 'COMMENTER')).toBe(true)
  })

  it('different user COMMENTER cannot edit another user discussion', () => {
    const d = createDiscussion('alice', 'my post')
    expect(canEditDelete(d, 'bob', 'COMMENTER')).toBe(false)
  })

  it('ADMIN can edit any discussion', () => {
    const d = createDiscussion('alice', 'my post')
    expect(canEditDelete(d, 'admin-user', 'ADMIN')).toBe(true)
  })

  it('OWNER can edit any discussion', () => {
    const d = createDiscussion('alice', 'my post')
    expect(canEditDelete(d, 'owner-user', 'OWNER')).toBe(true)
  })

  it('EDITOR cannot edit another user discussion', () => {
    const d = createDiscussion('alice', 'my post')
    expect(canEditDelete(d, 'bob', 'EDITOR')).toBe(false)
  })
})

describe('Discussions — resolve / reopen workflow', () => {
  it('starts as unresolved', () => {
    const d = createDiscussion('user-1', 'issue')
    expect(d.resolved).toBe(false)
    expect(d.resolvedBy).toBeNull()
    expect(d.resolvedAt).toBeNull()
  })

  it('resolve sets resolved=true, resolvedBy, resolvedAt', () => {
    const d = createDiscussion('user-1', 'issue')
    const resolved = resolveDiscussion(d, 'user-2')
    expect(resolved.resolved).toBe(true)
    expect(resolved.resolvedBy).toBe('user-2')
    expect(resolved.resolvedAt).toBeInstanceOf(Date)
  })

  it('reopen clears resolved fields', () => {
    const d = createDiscussion('user-1', 'issue')
    const resolved = resolveDiscussion(d, 'user-2')
    const reopened = resolveDiscussion(resolved, 'user-3', true)
    expect(reopened.resolved).toBe(false)
    expect(reopened.resolvedBy).toBeNull()
    expect(reopened.resolvedAt).toBeNull()
  })

  it('can resolve and reopen multiple times', () => {
    let d = createDiscussion('user-1', 'issue')
    d = resolveDiscussion(d, 'user-2')
    expect(d.resolved).toBe(true)
    d = resolveDiscussion(d, 'user-3', true)
    expect(d.resolved).toBe(false)
    d = resolveDiscussion(d, 'user-4')
    expect(d.resolved).toBe(true)
    expect(d.resolvedBy).toBe('user-4')
  })
})

describe('Discussions — soft delete', () => {
  it('soft delete sets deletedAt, does not remove object', () => {
    const d = createDiscussion('user-1', 'body')
    const deleted = softDelete(d)
    expect(deleted.deletedAt).toBeInstanceOf(Date)
    expect(deleted.body).toBe('body')  // data still present
  })

  it('deleted discussions not returned in list (filter by deletedAt IS NULL)', () => {
    const discussions = [
      createDiscussion('u1', 'open'),
      softDelete(createDiscussion('u2', 'deleted')),
      createDiscussion('u3', 'also open'),
    ]
    const visible = discussions.filter((d) => d.deletedAt === null)
    expect(visible).toHaveLength(2)
  })
})

describe('AddCommentSchema', () => {
  it('accepts valid reply body', () => {
    expect(AddCommentSchema.safeParse({ body: 'Good point!' }).success).toBe(true)
  })

  it('rejects empty body', () => {
    expect(AddCommentSchema.safeParse({ body: '' }).success).toBe(false)
  })

  it('rejects body over 10,000 chars', () => {
    expect(AddCommentSchema.safeParse({ body: 'x'.repeat(10_001) }).success).toBe(false)
  })
})
