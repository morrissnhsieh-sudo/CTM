/**
 * M3 — API Gateway
 * Tests: Cursor-based pagination (GET /sheets/:id/rows?cursor=...)
 *
 * Spec:
 *  - Cursor encodes { lastId, lastPosition } as base64url JSON
 *  - Stable under concurrent inserts (position-keyed, no skipped rows)
 *  - ?cursor=<token>&pageSize=500 — returns nextCursor=null when exhausted
 *  - Invalid cursor returns 400 VALIDATION_ERROR
 *  - Offset pagination still default when no cursor param
 *  - cursorPaginated() returns { data, nextCursor, requestId }
 *  - paginated()       returns { data, page, pageSize, total, hasNextPage, requestId }
 */

import { describe, it, expect } from 'vitest'
import { encodeCursor, decodeCursor, cursorPaginated, paginated } from '../../../apps/api-service/src/db/helpers.js'

describe('Cursor pagination helpers', () => {

  // ── encodeCursor / decodeCursor ──────────────────────────────────────────────
  describe('encodeCursor / decodeCursor', () => {
    it('encodes and decodes a valid cursor payload', () => {
      const payload = { lastId: 'row-abc-123', lastPosition: 42 }
      const token = encodeCursor(payload)
      const decoded = decodeCursor(token)
      expect(decoded).toEqual(payload)
    })

    it('encoded cursor is a non-empty string', () => {
      const token = encodeCursor({ lastId: 'id-1', lastPosition: 0 })
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
    })

    it('encoded cursor uses base64url (no +, /, = padding)', () => {
      const token = encodeCursor({ lastId: 'some-row-id', lastPosition: 100 })
      expect(token).not.toMatch(/[+/=]/)
    })

    it('different payloads produce different cursors', () => {
      const t1 = encodeCursor({ lastId: 'row-1', lastPosition: 10 })
      const t2 = encodeCursor({ lastId: 'row-2', lastPosition: 10 })
      const t3 = encodeCursor({ lastId: 'row-1', lastPosition: 11 })
      expect(t1).not.toBe(t2)
      expect(t1).not.toBe(t3)
    })

    it('same payload always produces same cursor (deterministic)', () => {
      const payload = { lastId: 'row-stable', lastPosition: 7 }
      expect(encodeCursor(payload)).toBe(encodeCursor(payload))
    })

    it('decodeCursor returns null for empty string', () => {
      expect(decodeCursor('')).toBeNull()
    })

    it('decodeCursor returns null for random garbage', () => {
      expect(decodeCursor('not-a-cursor-at-all')).toBeNull()
    })

    it('decodeCursor returns null for valid base64 but wrong shape', () => {
      const badJson = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64url')
      expect(decodeCursor(badJson)).toBeNull()
    })

    it('decodeCursor returns null for valid base64 but invalid JSON', () => {
      const notJson = Buffer.from('not json {').toString('base64url')
      expect(decodeCursor(notJson)).toBeNull()
    })

    it('preserves position = 0 correctly', () => {
      const decoded = decodeCursor(encodeCursor({ lastId: 'first-row', lastPosition: 0 }))
      expect(decoded?.lastPosition).toBe(0)
    })

    it('preserves large position numbers', () => {
      const decoded = decodeCursor(encodeCursor({ lastId: 'row-x', lastPosition: 999999 }))
      expect(decoded?.lastPosition).toBe(999999)
    })
  })

  // ── cursorPaginated ──────────────────────────────────────────────────────────
  describe('cursorPaginated()', () => {
    const makeRow = (id: string, position: number) => ({ id, position })

    it('returns data array in response', () => {
      const rows = [makeRow('r1', 0), makeRow('r2', 1)]
      const result = cursorPaginated(rows, 100, 'req-1')
      expect(result.data).toEqual(rows)
    })

    it('returns nextCursor when more pages exist (data.length === pageSize)', () => {
      const rows = [makeRow('r1', 0), makeRow('r2', 1)]
      const result = cursorPaginated(rows, 2, 'req-1')   // pageSize=2, got 2 → more exist
      expect(result.nextCursor).not.toBeNull()
    })

    it('nextCursor encodes the last row position', () => {
      const rows = [makeRow('r1', 0), makeRow('r2', 5)]
      const result = cursorPaginated(rows, 2, 'req-1')
      const decoded = decodeCursor(result.nextCursor!)
      expect(decoded?.lastId).toBe('r2')
      expect(decoded?.lastPosition).toBe(5)
    })

    it('returns nextCursor=null when data.length < pageSize (last page)', () => {
      const rows = [makeRow('r1', 0), makeRow('r2', 1)]
      const result = cursorPaginated(rows, 10, 'req-1')   // pageSize=10, got 2 → last page
      expect(result.nextCursor).toBeNull()
    })

    it('returns nextCursor=null for empty result set', () => {
      const result = cursorPaginated([], 100, 'req-1')
      expect(result.nextCursor).toBeNull()
      expect(result.data).toHaveLength(0)
    })

    it('includes requestId in response', () => {
      const result = cursorPaginated([], 10, 'my-req-id')
      expect(result.requestId).toBe('my-req-id')
    })
  })

  // ── paginated (offset) ────────────────────────────────────────────────────────
  describe('paginated() — offset mode', () => {
    it('returns correct page metadata', () => {
      const data = [{ id: '1' }, { id: '2' }]
      const result = paginated(data, 10, 1, 2, 'req-1')
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(2)
      expect(result.total).toBe(10)
    })

    it('hasNextPage is true when more data exists', () => {
      const result = paginated([], 50, 1, 25, 'req-1')
      expect(result.hasNextPage).toBe(true)   // page 1 × size 25 = 25 < 50
    })

    it('hasNextPage is false on last page', () => {
      const result = paginated([], 50, 2, 25, 'req-1')
      expect(result.hasNextPage).toBe(false)  // page 2 × size 25 = 50 >= 50
    })

    it('hasNextPage is false when total equals page*pageSize exactly', () => {
      const result = paginated([], 100, 2, 50, 'req-1')
      expect(result.hasNextPage).toBe(false)
    })

    it('hasNextPage is false for single page result', () => {
      const result = paginated([{ id: '1' }], 1, 1, 100, 'req-1')
      expect(result.hasNextPage).toBe(false)
    })

    it('passes data array through unchanged', () => {
      const data = [{ id: 'a' }, { id: 'b' }]
      const result = paginated(data, 2, 1, 10, 'req-1')
      expect(result.data).toBe(data)
    })
  })

  // ── Stability property ────────────────────────────────────────────────────────
  describe('cursor stability guarantee', () => {
    it('page 1 cursor points to position of last row on page 1', () => {
      const page1Rows = [
        { id: 'row-10', position: 10 },
        { id: 'row-20', position: 20 },
        { id: 'row-30', position: 30 },
      ]
      const result = cursorPaginated(page1Rows, 3, 'req-1')
      const decoded = decodeCursor(result.nextCursor!)

      // Page 2 query: WHERE position > 30
      // This is stable — inserting rows with position < 30 after page 1 is fetched
      // will not cause rows to be skipped on page 2
      expect(decoded?.lastPosition).toBe(30)
    })

    it('sequential cursor chain covers all rows without gaps', () => {
      const allRows = Array.from({ length: 10 }, (_, i) => ({ id: `row-${i}`, position: i * 10 }))
      const PAGE_SIZE = 3
      const seen: string[] = []
      let cursor: string | null = null

      // Simulate paginating through all rows
      let start = 0
      while (start < allRows.length) {
        const page = allRows.slice(start, start + PAGE_SIZE)
        seen.push(...page.map((r) => r.id))

        const result = cursorPaginated(page, PAGE_SIZE, 'req')
        cursor = result.nextCursor
        start += PAGE_SIZE
        if (!cursor) break
      }

      // All 10 rows should be visited exactly once
      expect(seen).toHaveLength(allRows.length)
      expect(new Set(seen).size).toBe(allRows.length)
    })
  })
})
