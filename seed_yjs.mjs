/**
 * Yjs document seed script.
 * Run inside ctm-collab container:  node /tmp/seed_yjs.mjs
 *
 * Writes populated Y.Doc binaries for Sheet 1 and Sheet1-1-1
 * directly into collab.documents so the frontend renders the data.
 */

import * as Y from 'yjs'
import pg from 'pg'

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DB_URL ||
    'postgresql://ctm:ctm_dev_pass@postgres:5432/ctm',
})

// ── Build a Y.Doc from a row-data array ──────────────────────────────────────
// rows: Array<{ [colIndex: number]: string }>
function buildYDoc(sheetId, rows) {
  const doc = new Y.Doc({ guid: sheetId })
  const cellsMap = doc.getMap('cells')

  doc.transact(() => {
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx]
      for (const [colIdx, value] of Object.entries(row)) {
        const key = `r${rowIdx}c${colIdx}`
        let cell = cellsMap.get(key)
        if (!cell) {
          cell = new Y.Map()
          cellsMap.set(key, cell)
        }
        cell.set('value', String(value))
        cell.set('updatedAt', new Date().toISOString())
      }
    }
  })

  return Buffer.from(Y.encodeStateAsUpdate(doc))
}

// ── Sheet 1 — 8 rows for Kanban / Calendar / Conditional Formatting ──────────
// Columns: 0=Name  1=Status  2=Assignee  3=Due Date
const sheet1Rows = [
  { 0: 'Design system architecture', 1: 'Done',        2: 'System Admin',    3: '2026-06-02' },
  { 0: 'Set up CI/CD pipeline',      1: 'Done',        2: 'System Admin',    3: '2026-06-05' },
  { 0: 'Implement authentication',   1: 'In Progress', 2: 'Project Manager', 3: '2026-06-10' },
  { 0: 'Build dashboard UI',         1: 'In Progress', 2: 'Folder Manager',  3: '2026-06-10' },
  { 0: 'Write API documentation',    1: 'Not Started', 2: 'Folder Manager',  3: '2026-06-15' },
  { 0: 'Performance testing',        1: 'Not Started', 2: 'Project Member',  3: '2026-06-18' },
  { 0: 'Security audit',             1: 'Not Started', 2: 'Project Member',  3: '2026-06-22' },
  { 0: 'Deploy to production',       1: 'Not Started', 2: 'System Admin',    3: '2026-06-30' },
]

// ── Sheet1-1-1 — 5 rows for Gantt / PM ──────────────────────────────────────
// Columns: 0=Name  1=Status  2=Assignee  3=Due Date
const sheet2Rows = [
  { 0: 'Requirements & Planning', 1: 'Done',        2: 'System Admin',    3: '2026-06-05' },
  { 0: 'System Design',           1: 'Done',        2: 'System Admin',    3: '2026-06-10' },
  { 0: 'Development Sprint 1',    1: 'In Progress', 2: 'Project Manager', 3: '2026-06-20' },
  { 0: 'QA & Testing',            1: 'Not Started', 2: 'Folder Manager',  3: '2026-06-27' },
  { 0: 'Production Deployment',   1: 'Not Started', 2: 'Project Member',  3: '2026-06-30' },
]

const SHEET1_ID = 'b9ff414f-aa9b-46c1-a7ee-b1c1a754b9f7'
const SHEET2_ID = '90e67146-1dfc-4a76-9577-ea099daf2e4e'

async function upsertDoc(client, sheetId, binary) {
  await client.query(
    `INSERT INTO collab.documents (sheet_id, ydoc_binary, version, last_updated_at)
     VALUES ($1, $2, 1, NOW())
     ON CONFLICT (sheet_id) DO UPDATE
     SET ydoc_binary      = EXCLUDED.ydoc_binary,
         version          = collab.documents.version + 1,
         last_updated_at  = NOW()`,
    [sheetId, binary],
  )
  console.log(`  → collab.documents updated for sheet ${sheetId}`)
}

async function main() {
  const client = await pool.connect()
  try {
    console.log('Building Y.Doc for Sheet 1...')
    const bin1 = buildYDoc(SHEET1_ID, sheet1Rows)

    console.log('Building Y.Doc for Sheet1-1-1...')
    const bin2 = buildYDoc(SHEET2_ID, sheet2Rows)

    console.log('Writing to collab.documents...')
    await upsertDoc(client, SHEET1_ID, bin1)
    await upsertDoc(client, SHEET2_ID, bin2)

    console.log('Done — reload the sheet in your browser to see the data.')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
