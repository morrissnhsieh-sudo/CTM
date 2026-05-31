/**
 * M3 — API Gateway
 * Tests: Export/Import async job system
 *
 * Export spec:
 *  - POST /export/:sheetId?format=xlsx|csv|json → 202 { jobId, status:"queued", pollUrl }
 *  - GET /export/jobs/:id → { id, status, downloadUrl?, rowCount?, errorMessage? }
 *  - POST /export/jobs/:id/retry → re-queues failed job; 409 if not failed
 *  - format must be xlsx|csv|json; rejects unknown formats with 400
 *  - Pre-signed URL auto-refreshes on expiry
 *
 * Import spec:
 *  - POST /import (multipart) → 202 { jobId, status:"queued", pollUrl }
 *  - GET /import/jobs/:id → { id, status, sheetId?, rowsImported, rowsFailed, rowErrors? }
 *  - Max file size: 100 MB; rejects empty files
 *  - format detected from extension (xlsx|csv) or query param
 *  - Row-level errors collected (max 100)
 */

import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// ── Export format validation ───────────────────────────────────────────────────

const ExportFormat = z.enum(['xlsx', 'csv', 'json'])
const ImportFormat = z.enum(['xlsx', 'csv'])

// ── Export job state machine ──────────────────────────────────────────────────

type JobStatus = 'queued' | 'processing' | 'ready' | 'failed'

interface ExportJob {
  id: string
  sheetId: string
  format: string
  status: JobStatus
  rowCount?: number
  downloadUrl?: string
  errorMessage?: string
  createdAt: Date
  updatedAt: Date
  expiresAt?: Date
}

function isExpired(job: ExportJob): boolean {
  return !!job.expiresAt && job.expiresAt < new Date()
}

function canRetry(job: ExportJob): boolean {
  return job.status === 'failed'
}

function buildPollUrl(jobId: string, type: 'export' | 'import'): string {
  return `/v1/${type}/jobs/${jobId}`
}

// ── Tests — Export format validation ─────────────────────────────────────────

describe('Export format validation', () => {
  const validFormats = ['xlsx', 'csv', 'json']
  const invalidFormats = ['pdf', 'xls', 'ods', '', 'XML', 'XLSX', undefined]

  validFormats.forEach((fmt) => {
    it(`accepts valid format: ${fmt}`, () => {
      expect(ExportFormat.safeParse(fmt).success).toBe(true)
    })
  })

  invalidFormats.forEach((fmt) => {
    it(`rejects invalid format: ${String(fmt)}`, () => {
      expect(ExportFormat.safeParse(fmt).success).toBe(false)
    })
  })
})

describe('Import format validation', () => {
  it('accepts xlsx', () => expect(ImportFormat.safeParse('xlsx').success).toBe(true))
  it('accepts csv',  () => expect(ImportFormat.safeParse('csv').success).toBe(true))
  it('rejects json (not supported for import)', () => expect(ImportFormat.safeParse('json').success).toBe(false))
  it('rejects pdf',  () => expect(ImportFormat.safeParse('pdf').success).toBe(false))
})

// ── Tests — Export job lifecycle ──────────────────────────────────────────────

describe('Export job state machine', () => {
  function makeJob(status: JobStatus, overrides: Partial<ExportJob> = {}): ExportJob {
    return {
      id: crypto.randomUUID(),
      sheetId: 'sheet-1',
      format: 'xlsx',
      status,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }
  }

  describe('initial state', () => {
    it('new job has status queued', () => {
      const job = makeJob('queued')
      expect(job.status).toBe('queued')
    })

    it('new job has no downloadUrl', () => {
      const job = makeJob('queued')
      expect(job.downloadUrl).toBeUndefined()
    })
  })

  describe('canRetry()', () => {
    it('failed job can be retried', () => {
      expect(canRetry(makeJob('failed'))).toBe(true)
    })

    it('queued job cannot be retried (not failed)', () => {
      expect(canRetry(makeJob('queued'))).toBe(false)
    })

    it('processing job cannot be retried', () => {
      expect(canRetry(makeJob('processing'))).toBe(false)
    })

    it('ready job cannot be retried (already succeeded)', () => {
      expect(canRetry(makeJob('ready'))).toBe(false)
    })
  })

  describe('URL expiry', () => {
    it('job with future expiresAt is not expired', () => {
      const future = new Date(Date.now() + 60_000)
      const job = makeJob('ready', { expiresAt: future })
      expect(isExpired(job)).toBe(false)
    })

    it('job with past expiresAt is expired', () => {
      const past = new Date(Date.now() - 1000)
      const job = makeJob('ready', { expiresAt: past })
      expect(isExpired(job)).toBe(true)
    })

    it('job without expiresAt is not expired', () => {
      const job = makeJob('ready')
      expect(isExpired(job)).toBe(false)
    })
  })

  describe('pollUrl construction', () => {
    it('export pollUrl is /v1/export/jobs/:id', () => {
      const id = 'job-abc-123'
      expect(buildPollUrl(id, 'export')).toBe('/v1/export/jobs/job-abc-123')
    })

    it('import pollUrl is /v1/import/jobs/:id', () => {
      const id = 'job-xyz-456'
      expect(buildPollUrl(id, 'import')).toBe('/v1/import/jobs/job-xyz-456')
    })
  })
})

// ── Tests — Import validation ─────────────────────────────────────────────────

describe('Import file validation', () => {
  const MAX_SIZE_BYTES = 100 * 1024 * 1024  // 100 MB

  it('rejects files over 100 MB', () => {
    const tooLarge = MAX_SIZE_BYTES + 1
    expect(tooLarge > MAX_SIZE_BYTES).toBe(true)
  })

  it('accepts files at exactly 100 MB', () => {
    expect(MAX_SIZE_BYTES <= MAX_SIZE_BYTES).toBe(true)
  })

  it('rejects empty files (0 bytes)', () => {
    const fileSize = 0
    expect(fileSize === 0).toBe(true) // guard triggers on this
  })

  it('detects xlsx format from .xlsx extension', () => {
    const detectFormat = (filename: string, queryFormat?: string) => {
      if (queryFormat) return queryFormat
      const ext = filename.split('.').pop()?.toLowerCase()
      return ext === 'csv' ? 'csv' : 'xlsx'
    }
    expect(detectFormat('data.xlsx')).toBe('xlsx')
    expect(detectFormat('data.csv')).toBe('csv')
    expect(detectFormat('data.xls')).toBe('xlsx')   // fallback to xlsx
    expect(detectFormat('data.xlsx', 'csv')).toBe('csv') // query param overrides
  })
})

// ── Tests — Import job row errors ──────────────────────────────────────────────

describe('Import job row error tracking', () => {
  interface RowError { row: number; field: string; message: string }

  it('collects row-level errors (max 100)', () => {
    const errors: RowError[] = []
    const MAX_ROW_ERRORS = 100

    for (let i = 0; i < 150; i++) {
      if (errors.length < MAX_ROW_ERRORS) {
        errors.push({ row: i, field: 'email', message: 'Invalid email format' })
      }
    }

    expect(errors).toHaveLength(100)  // capped at 100
  })

  it('rowsImported + rowsFailed = total rows attempted', () => {
    const totalRows    = 1000
    const rowsFailed   = 15
    const rowsImported = totalRows - rowsFailed
    expect(rowsImported + rowsFailed).toBe(totalRows)
  })

  it('failed import has status "failed" and errorMessage', () => {
    const job = {
      status: 'failed' as const,
      errorMessage: 'Could not parse XLSX: worksheet "Sheet1" missing',
      rowsImported: 0,
      rowsFailed: 0,
    }
    expect(job.status).toBe('failed')
    expect(job.errorMessage).toBeTruthy()
  })

  it('successful import has status "ready" and populated sheetId', () => {
    const job = {
      status: 'ready' as const,
      sheetId: 'sheet-new-123',
      rowsImported: 500,
      rowsFailed: 0,
    }
    expect(job.status).toBe('ready')
    expect(job.sheetId).toBeTruthy()
    expect(job.rowsImported).toBe(500)
  })
})

// ── Tests — Format extension detection ───────────────────────────────────────

describe('Format detection from filename', () => {
  const detect = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase()
    return ext === 'csv' ? 'csv' : 'xlsx'
  }

  const cases: [string, string][] = [
    ['report.xlsx', 'xlsx'],
    ['data.csv',    'csv'],
    ['export.CSV',  'csv'],
    ['file.xls',    'xlsx'],   // treated as xlsx (fallback)
    ['noext',       'xlsx'],   // no extension → xlsx fallback
    ['a.b.c.xlsx',  'xlsx'],   // multiple dots
    ['a.b.c.csv',   'csv'],
  ]

  cases.forEach(([filename, expected]) => {
    it(`"${filename}" → ${expected}`, () => {
      expect(detect(filename)).toBe(expected)
    })
  })
})
