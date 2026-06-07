/**
 * Yjs seed — Product Catalog demo sheet
 * Run: node /tmp/seed_yjs_demo.mjs  (inside ctm-collab container)
 *
 * 11 columns × 10 rows for "Product Catalog" sheet under Project 1
 * Column layout (by position index):
 *   0  ID (auto_number)      6  In Stock (checkbox)
 *   1  Product Name (text)   7  Launch Date (date)
 *   2  SKU (text)            8  Owner (contact)
 *   3  Category (dropdown)   9  Status (dropdown)
 *   4  Unit Price (currency) 10 Product URL (url)
 *   5  Qty on Hand (number)
 */

import * as Y from 'yjs'
import pg from 'pg'

const { Pool } = pg
const pool = new Pool({
  connectionString: process.env.DB_URL || 'postgresql://ctm:ctm_dev_pass@postgres:5432/ctm',
})

const SHEET_ID = 'ee000001-0000-0000-0000-000000000001'

// 10 rows × 11 cols  (col index = position in column list)
const ROWS = [
  // [ ID,  Name,                   SKU,       Category,    Price,    Qty,  InStock, Date,         Owner,            Status,        URL,                                   Files ]
  [ '1',  'iPhone 15 Pro',         'SKU-0001', 'Electronics', '999.00',  '150', 'true',  '2023-09-22', 'Demo User',      'Active',       'https://apple.com/iphone-15-pro', 'iphone15pro_spec_sheet.pdf' ],
  [ '2',  'MacBook Air M3',        'SKU-0002', 'Electronics', '1299.00', '75',  'true',  '2024-03-08', 'System Admin',   'Active',       'https://apple.com/macbook-air'                    ],
  [ '3',  'Python Crash Course',   'SKU-0003', 'Books',       '35.99',   '320', 'true',  '2023-05-15', 'Project Manager','Active',       'https://nostarch.com/python-crash-course'         ],
  [ '4',  'VS Code Pro License',   'SKU-0004', 'Software',    '49.00',   '500', 'true',  '2024-01-10', 'System Admin',   'Active',       'https://code.visualstudio.com'                    ],
  [ '5',  'Winter Jacket',         'SKU-0005', 'Clothing',    '129.99',  '48',  'true',  '2023-10-01', 'Folder Manager', 'Active',       'https://example.com/winter-jacket'                ],
  [ '6',  'Protein Shake Mix',     'SKU-0006', 'Food',        '29.99',   '200', 'true',  '2024-02-14', 'Project Member', 'Active',       'https://example.com/protein-shake'                ],
  [ '7',  'Wireless Earbuds',      'SKU-0007', 'Electronics', '79.99',   '0',   'false', '2023-11-20', 'Demo User',      'Discontinued', 'https://example.com/earbuds'                      ],
  [ '8',  'Docker in Practice',    'SKU-0008', 'Books',       '42.00',   '85',  'true',  '2023-07-30', 'Project Manager','Active',       'https://manning.com/books/docker-in-practice'     ],
  [ '9',  'Cloud Storage 1TB',     'SKU-0009', 'Software',    '9.99',    '1000','true',  '2024-03-01', 'System Admin',   'Draft',        'https://example.com/cloud-storage'                ],
  [ '10', 'Running Shoes',         'SKU-0010', 'Clothing',    '95.00',   '0',   'false', '2022-04-15', 'Folder Manager', 'Discontinued', 'https://example.com/running-shoes'                ],
]

function buildDoc(sheetId, rows) {
  const doc = new Y.Doc({ guid: sheetId })
  const cellsMap = doc.getMap('cells')

  doc.transact(() => {
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri]
      for (let ci = 0; ci < row.length; ci++) {
        const key = `r${ri}c${ci}`
        let cell = cellsMap.get(key)
        if (!cell) { cell = new Y.Map(); cellsMap.set(key, cell) }
        cell.set('value', row[ci])
        cell.set('updatedAt', new Date().toISOString())
      }
    }
  })

  return Buffer.from(Y.encodeStateAsUpdate(doc))
}

async function main() {
  const client = await pool.connect()
  try {
    console.log('Building Y.Doc for Product Catalog...')
    const bin = buildDoc(SHEET_ID, ROWS)
    console.log(`  binary size: ${bin.length} bytes`)

    await client.query(
      `INSERT INTO collab.documents (sheet_id, ydoc_binary, version, last_updated_at)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (sheet_id) DO UPDATE
       SET ydoc_binary     = EXCLUDED.ydoc_binary,
           version         = collab.documents.version + 1,
           last_updated_at = NOW()`,
      [SHEET_ID, bin],
    )
    console.log(`  → collab.documents updated for ${SHEET_ID}`)
    console.log('Done. Open the Product Catalog sheet and hard-refresh.')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
