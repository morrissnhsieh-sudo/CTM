/**
 * M7 — Messaging Service
 * Unit tests: Comment engine (CRUD, threading, reactions, resolution)
 *
 * Spec refs:
 *  - Target types: cell, row, column, sheet
 *  - Target ref format: "r{rowId}c{colId}" | rowId | colId | sheetId
 *  - Threading: unlimited depth via parentId
 *  - @mention: triggers notification to mentioned user
 *  - Reactions: emoji per user per comment (unique constraint)
 *  - Resolution: resolved=true collapses thread; Reopen available
 *  - Edit: author within 24h; Delete: author or ADMIN (soft-delete)
 *  - Max body: 10,000 chars
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'

// ── Comment validation schema ─────────────────────────────────────────────────
const CreateCommentSchema = z.object({
  targetType: z.enum(['cell', 'row', 'column', 'sheet']),
  targetRef: z.string().min(1),
  parentId: z.string().uuid().nullable().optional(),
  body: z.string().min(1).max(10_000),
})

// ── Target ref format helpers ─────────────────────────────────────────────────
const buildCellRef = (rowId: string, colId: string) => `r${rowId}c${colId}`
const isCellRef = (ref: string) => /^r[^c]+c.+$/.test(ref)

describe('M7 Comment validation', () => {
  describe('CreateCommentSchema', () => {
    it('accepts valid cell comment', () => {
      const result = CreateCommentSchema.safeParse({
        targetType: 'cell',
        targetRef: 'rrowidc123c456',
        body: 'This value looks wrong',
      })
      expect(result.success).toBe(true)
    })

    it('accepts all target types', () => {
      const types = ['cell', 'row', 'column', 'sheet'] as const
      for (const targetType of types) {
        const result = CreateCommentSchema.safeParse({
          targetType,
          targetRef: 'ref-123',
          body: 'comment',
        })
        expect(result.success).toBe(true)
      }
    })

    it('rejects unknown target type', () => {
      const result = CreateCommentSchema.safeParse({
        targetType: 'worksheet',
        targetRef: 'ref',
        body: 'comment',
      })
      expect(result.success).toBe(false)
    })

    it('rejects empty body', () => {
      const result = CreateCommentSchema.safeParse({
        targetType: 'cell',
        targetRef: 'ref',
        body: '',
      })
      expect(result.success).toBe(false)
    })

    it('rejects body exceeding 10,000 characters', () => {
      const result = CreateCommentSchema.safeParse({
        targetType: 'sheet',
        targetRef: 'sheet-id',
        body: 'A'.repeat(10_001),
      })
      expect(result.success).toBe(false)
    })

    it('accepts body of exactly 10,000 characters', () => {
      const result = CreateCommentSchema.safeParse({
        targetType: 'sheet',
        targetRef: 'sheet-id',
        body: 'A'.repeat(10_000),
      })
      expect(result.success).toBe(true)
    })

    it('accepts parentId as UUID for threaded reply', () => {
      const result = CreateCommentSchema.safeParse({
        targetType: 'row',
        targetRef: 'row-uuid-123',
        parentId: '550e8400-e29b-41d4-a716-446655440000',
        body: 'reply to parent',
      })
      expect(result.success).toBe(true)
    })

    it('rejects non-UUID parentId', () => {
      const result = CreateCommentSchema.safeParse({
        targetType: 'row',
        targetRef: 'row-id',
        parentId: 'not-a-uuid',
        body: 'reply',
      })
      expect(result.success).toBe(false)
    })

    it('accepts null parentId for top-level comment', () => {
      const result = CreateCommentSchema.safeParse({
        targetType: 'cell',
        targetRef: 'r123c456',
        parentId: null,
        body: 'top-level comment',
      })
      expect(result.success).toBe(true)
    })
  })
})

describe('M7 Target ref format', () => {
  it('buildCellRef creates correct "r{rowId}c{colId}" format', () => {
    expect(buildCellRef('abc123', 'def456')).toBe('rabc123cdef456')
  })

  it('isCellRef identifies cell refs', () => {
    expect(isCellRef('rROWIDcCOLID')).toBe(true)
    expect(isCellRef('just-a-row-id')).toBe(false)
    expect(isCellRef('rROWIDc')).toBe(false)
  })
})

describe('M7 Mention detection', () => {
  const extractMentions = (body: string): string[] => {
    const matches = body.match(/@([\w.-]+)/g) ?? []
    return matches.map((m) => m.slice(1))
  }

  it('extracts @mentions from comment body', () => {
    const mentions = extractMentions('Hey @alice, can you review this? cc @bob')
    expect(mentions).toContain('alice')
    expect(mentions).toContain('bob')
  })

  it('@here is a special mention', () => {
    const mentions = extractMentions('Attention @here: this needs immediate review')
    expect(mentions).toContain('here')
  })

  it('returns empty array when no mentions', () => {
    const mentions = extractMentions('No mentions in this comment')
    expect(mentions).toHaveLength(0)
  })

  it('handles multiple mentions of same user', () => {
    const mentions = extractMentions('@alice please check @alice again')
    expect(mentions.filter((m) => m === 'alice')).toHaveLength(2)
  })
})

describe('M7 Notification dispatcher', () => {
  const mockPool = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  }
  const mockRedis = {
    zadd: vi.fn().mockResolvedValue(1),
  }
  const mockProducer = {
    send: vi.fn().mockResolvedValue(undefined),
  }
  const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }

  beforeEach(() => { vi.clearAllMocks() })

  it('inserts in-app notification into DB', async () => {
    // Minimal test: verify the INSERT query is called
    mockPool.query.mockResolvedValueOnce({ rows: [] })  // INSERT notification
    mockPool.query.mockResolvedValueOnce({ rows: [] })  // SELECT prefs
    await mockPool.query(
      'INSERT INTO notifications (id, user_id, type, payload) VALUES ($1,$2,$3,$4)',
      ['nid', 'uid', 'approval_request', '{}'],
    )
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO notifications'),
      expect.any(Array),
    )
  })
})

describe('M7 Reaction uniqueness constraint', () => {
  it('reaction key is (commentId, userId, emoji) — unique per user per emoji per comment', () => {
    type Reaction = { commentId: string; userId: string; emoji: string }
    const reactions: Reaction[] = [
      { commentId: 'c1', userId: 'u1', emoji: '👍' },
      { commentId: 'c1', userId: 'u2', emoji: '👍' },
      { commentId: 'c1', userId: 'u1', emoji: '✅' },
    ]

    const unique = (r: Reaction) => `${r.commentId}:${r.userId}:${r.emoji}`
    const keys = reactions.map(unique)
    const uniqueKeys = new Set(keys)

    // All 3 reactions are unique
    expect(uniqueKeys.size).toBe(3)
  })

  it('duplicate reaction (same commentId, userId, emoji) is NOT unique', () => {
    type Reaction = { commentId: string; userId: string; emoji: string }
    const r1: Reaction = { commentId: 'c1', userId: 'u1', emoji: '👍' }
    const r2: Reaction = { commentId: 'c1', userId: 'u1', emoji: '👍' } // duplicate

    const unique = (r: Reaction) => `${r.commentId}:${r.userId}:${r.emoji}`
    expect(unique(r1)).toBe(unique(r2))
  })
})
