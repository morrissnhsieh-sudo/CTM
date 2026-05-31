/**
 * M3 — API Gateway
 * Tests: Field selection (?fields=id,title,updatedAt)
 *
 * Spec:
 *  - ?fields=id,title,updatedAt → returns only those keys
 *  - Applies to: GET /sheets, GET /sheets/:id, GET /sheets/:id/rows
 *  - Unknown field names are silently ignored
 *  - ?fields= (empty) or absent → returns full object unchanged
 *  - Works on both single objects and arrays
 *  - Field names are comma-separated, whitespace trimmed
 */

import { describe, it, expect } from 'vitest'
import { selectFields } from '../../../apps/api-service/src/db/helpers.js'

const FULL_SHEET = {
  id:          'sheet-123',
  workspaceId: 'ws-456',
  title:       'Q4 Revenue',
  description: 'Annual revenue data',
  createdBy:   'user-789',
  createdAt:   new Date('2026-01-01'),
  updatedAt:   new Date('2026-05-30'),
  archivedAt:  null,
  settings:    { frozenRows: 1 },
  projectId:   null,
}

describe('selectFields() — field selection utility', () => {

  // ── Single object ────────────────────────────────────────────────────────────
  describe('single object', () => {
    it('returns only requested fields', () => {
      const result = selectFields(FULL_SHEET, 'id,title')
      expect(result).toEqual({ id: 'sheet-123', title: 'Q4 Revenue' })
    })

    it('returns single field', () => {
      const result = selectFields(FULL_SHEET, 'id')
      expect(result).toEqual({ id: 'sheet-123' })
    })

    it('returns all requested fields when multiple specified', () => {
      const result = selectFields(FULL_SHEET, 'id,title,updatedAt,workspaceId')
      expect(Object.keys(result)).toHaveLength(4)
      expect(result).toHaveProperty('id')
      expect(result).toHaveProperty('title')
      expect(result).toHaveProperty('updatedAt')
      expect(result).toHaveProperty('workspaceId')
    })

    it('silently ignores unknown field names', () => {
      const result = selectFields(FULL_SHEET, 'id,nonExistentField,title')
      expect(result).toEqual({ id: 'sheet-123', title: 'Q4 Revenue' })
      expect(result).not.toHaveProperty('nonExistentField')
    })

    it('all unknown fields returns empty object', () => {
      const result = selectFields(FULL_SHEET, 'foo,bar,baz')
      expect(result).toEqual({})
    })

    it('trims whitespace around field names', () => {
      const result = selectFields(FULL_SHEET, ' id , title , updatedAt ')
      expect(result).toHaveProperty('id')
      expect(result).toHaveProperty('title')
      expect(result).toHaveProperty('updatedAt')
    })

    it('preserves null values in selected fields', () => {
      const result = selectFields(FULL_SHEET, 'id,archivedAt,projectId')
      expect(result.archivedAt).toBeNull()
      expect(result.projectId).toBeNull()
    })

    it('preserves Date objects in selected fields', () => {
      const result = selectFields(FULL_SHEET, 'createdAt,updatedAt') as { createdAt: Date; updatedAt: Date }
      expect(result.createdAt).toBeInstanceOf(Date)
      expect(result.updatedAt).toBeInstanceOf(Date)
    })

    it('preserves nested objects in selected fields', () => {
      const result = selectFields(FULL_SHEET, 'settings') as { settings: Record<string, unknown> }
      expect(result.settings).toEqual({ frozenRows: 1 })
    })
  })

  // ── No fields (passthrough) ──────────────────────────────────────────────────
  describe('no fields specified (passthrough)', () => {
    it('returns full object when fields is undefined', () => {
      const result = selectFields(FULL_SHEET, undefined)
      expect(result).toBe(FULL_SHEET)   // same reference — not a copy
    })

    it('returns full object when fields is empty string', () => {
      const result = selectFields(FULL_SHEET, '')
      expect(result).toBe(FULL_SHEET)
    })

    it('returns full object when fields is whitespace only', () => {
      const result = selectFields(FULL_SHEET, '   ')
      expect(result).toBe(FULL_SHEET)
    })
  })

  // ── Array of objects ──────────────────────────────────────────────────────────
  describe('array of objects', () => {
    const SHEETS = [
      { id: 's1', title: 'Sheet 1', workspaceId: 'ws-1', updatedAt: new Date() },
      { id: 's2', title: 'Sheet 2', workspaceId: 'ws-1', updatedAt: new Date() },
      { id: 's3', title: 'Sheet 3', workspaceId: 'ws-1', updatedAt: new Date() },
    ]

    it('filters every object in the array', () => {
      const result = selectFields(SHEETS, 'id,title') as Array<{ id: string; title: string }>
      expect(result).toHaveLength(3)
      for (const item of result) {
        expect(Object.keys(item)).toEqual(['id', 'title'])
      }
    })

    it('returns empty-fielded objects when all fields unknown', () => {
      const result = selectFields(SHEETS, 'unknownField')
      expect(result).toHaveLength(3)
      for (const item of result) {
        expect(Object.keys(item)).toHaveLength(0)
      }
    })

    it('returns array unchanged when no fields specified', () => {
      const result = selectFields(SHEETS, undefined)
      expect(result).toBe(SHEETS)
    })

    it('returns empty array unchanged', () => {
      const result = selectFields([], 'id,title')
      expect(result).toHaveLength(0)
    })

    it('each result item has only the requested fields', () => {
      const result = selectFields(SHEETS, 'id') as Array<{ id: string }>
      for (const item of result) {
        expect(item).not.toHaveProperty('title')
        expect(item).not.toHaveProperty('workspaceId')
        expect(item).toHaveProperty('id')
      }
    })
  })

  // ── Smartsheet compatibility field examples ───────────────────────────────────
  describe('Smartsheet-compatible field patterns', () => {
    it('?fields=id,name — Smartsheet minimal sheet list', () => {
      const result = selectFields(FULL_SHEET, 'id,title')
      expect(Object.keys(result)).toEqual(['id', 'title'])
    })

    it('?fields=id,modifiedAt,createdAt — timestamp-only response', () => {
      const result = selectFields(FULL_SHEET, 'id,updatedAt,createdAt')
      expect(result).toHaveProperty('id')
      expect(result).toHaveProperty('updatedAt')
      expect(result).toHaveProperty('createdAt')
      expect(result).not.toHaveProperty('title')
    })
  })
})
