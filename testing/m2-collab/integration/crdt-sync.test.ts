/**
 * M2 — Collaboration Engine
 * Integration tests: Yjs CRDT convergence properties
 *
 * Spec refs:
 *  - CRDT guarantee: all clients converge to same state regardless of edit order
 *  - Offline-first: pending ops stored in IndexedDB; on reconnect, Yjs CRDT merge handles convergence
 *  - Y.Map — cells: Key "r{row}c{col}" → Y.Map{value, formula, format, type}
 *  - Y.Array — rowOrder: ordered array of rowIds; concurrent inserts resolved by Yjs
 *  - Y.Map — colSchema: column metadata
 *  - Awareness: each client broadcasts cursor position
 */

import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'

describe('M2 CRDT convergence (Yjs)', () => {
  // ── Cell data model ────────────────────────────────────────────────────────
  describe('Y.Map cells data model', () => {
    it('stores cell value at key "r{rowId}c{colId}"', () => {
      const doc = new Y.Doc()
      const cells = doc.getMap<Y.Map<unknown>>('cells')
      const cell = new Y.Map()
      cell.set('value', 'Hello')
      cell.set('formula', null)
      cell.set('type', 'text')
      cells.set('r123c456', cell)
      expect(cells.get('r123c456')?.get('value')).toBe('Hello')
    })

    it('partial cell update does not overwrite other fields', () => {
      const doc = new Y.Doc()
      const cells = doc.getMap<Y.Map<unknown>>('cells')
      const cell = new Y.Map()
      cell.set('value', 42)
      cell.set('formula', '=SUM(A1:A5)')
      cell.set('type', 'formula')
      cells.set('r0c0', cell)

      // Only update format — value/formula should be unchanged
      cells.get('r0c0')!.set('format', new Y.Map())
      expect(cells.get('r0c0')!.get('value')).toBe(42)
      expect(cells.get('r0c0')!.get('formula')).toBe('=SUM(A1:A5)')
    })
  })

  // ── Row order ──────────────────────────────────────────────────────────────
  describe('Y.Array rowOrder', () => {
    it('maintains insertion order', () => {
      const doc = new Y.Doc()
      const rowOrder = doc.getArray<string>('rowOrder')
      rowOrder.insert(0, ['row-1', 'row-2', 'row-3'])
      expect(rowOrder.toArray()).toEqual(['row-1', 'row-2', 'row-3'])
    })

    it('concurrent inserts from two clients both appear in merged doc', () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()
      const rowOrder1 = doc1.getArray<string>('rowOrder')
      const rowOrder2 = doc2.getArray<string>('rowOrder')

      rowOrder1.insert(0, ['row-A'])
      rowOrder2.insert(0, ['row-B'])

      // Exchange updates
      const update1 = Y.encodeStateAsUpdate(doc1)
      const update2 = Y.encodeStateAsUpdate(doc2)
      Y.applyUpdate(doc1, update2)
      Y.applyUpdate(doc2, update1)

      // Both documents must contain both rows (convergence)
      const merged1 = rowOrder1.toArray()
      const merged2 = rowOrder2.toArray()
      expect(merged1).toContain('row-A')
      expect(merged1).toContain('row-B')
      expect(merged1).toEqual(merged2) // identical after sync
    })

    it('delete is idempotent — deleting same index twice is safe', () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()
      const arr1 = doc1.getArray<string>('rowOrder')
      const arr2 = doc2.getArray<string>('rowOrder')
      arr1.insert(0, ['r1', 'r2', 'r3'])
      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

      // Both delete index 1 concurrently
      doc1.transact(() => arr1.delete(1, 1))
      doc2.transact(() => arr2.delete(1, 1))

      Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))
      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

      // Should converge — both get the same result
      expect(arr1.toArray()).toEqual(arr2.toArray())
    })
  })

  // ── Column schema ──────────────────────────────────────────────────────────
  describe('Y.Map colSchema', () => {
    it('stores column metadata keyed by colId', () => {
      const doc = new Y.Doc()
      const colSchema = doc.getMap<Y.Map<unknown>>('colSchema')
      const col = new Y.Map()
      col.set('name', 'Revenue')
      col.set('type', 'currency')
      col.set('width', 150)
      col.set('frozen', false)
      colSchema.set('col-uuid-001', col)
      expect(colSchema.get('col-uuid-001')!.get('name')).toBe('Revenue')
      expect(colSchema.get('col-uuid-001')!.get('type')).toBe('currency')
    })

    it('concurrent column rename converges deterministically', () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      // Both start with the same column
      const col1 = new Y.Map()
      col1.set('name', 'Old Name')
      doc1.getMap('colSchema').set('col-1', col1)
      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

      // Client 1 renames to "Name A", client 2 to "Name B"
      ;(doc1.getMap('colSchema').get('col-1') as Y.Map<unknown>).set('name', 'Name A')
      ;(doc2.getMap('colSchema').get('col-1') as Y.Map<unknown>).set('name', 'Name B')

      Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))
      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

      // Both docs agree on the same name (last-write-wins by Yjs)
      const name1 = (doc1.getMap('colSchema').get('col-1') as Y.Map<unknown>).get('name')
      const name2 = (doc2.getMap('colSchema').get('col-1') as Y.Map<unknown>).get('name')
      expect(name1).toBe(name2) // convergence guaranteed
    })
  })

  // ── Binary encoding / decoding ────────────────────────────────────────────
  describe('binary state encoding', () => {
    it('encodeStateAsUpdate produces a non-empty Uint8Array', () => {
      const doc = new Y.Doc()
      doc.getMap('meta').set('title', 'Test Sheet')
      const binary = Y.encodeStateAsUpdate(doc)
      expect(binary).toBeInstanceOf(Uint8Array)
      expect(binary.length).toBeGreaterThan(0)
    })

    it('applyUpdate reconstructs document state from binary', () => {
      const source = new Y.Doc()
      source.getMap('meta').set('title', 'My Sheet')
      source.getMap('meta').set('version', 42)
      const binary = Y.encodeStateAsUpdate(source)

      const target = new Y.Doc()
      Y.applyUpdate(target, binary)
      expect(target.getMap('meta').get('title')).toBe('My Sheet')
      expect(target.getMap('meta').get('version')).toBe(42)
    })

    it('state vector enables delta sync (only sends missing updates)', () => {
      const server = new Y.Doc()
      const client = new Y.Doc()

      // Both start in sync
      server.getMap('cells').set('r0c0', 'initial')
      Y.applyUpdate(client, Y.encodeStateAsUpdate(server))

      // Server gets a new update
      server.getMap('cells').set('r1c0', 'new value')

      // Client sends its state vector, server returns only the delta
      const clientSV = Y.encodeStateVector(client)
      const delta = Y.encodeStateAsUpdate(server, clientSV)

      // Delta should be smaller than full update
      const full = Y.encodeStateAsUpdate(server)
      expect(delta.length).toBeLessThanOrEqual(full.length)

      Y.applyUpdate(client, delta)
      expect(client.getMap('cells').get('r1c0')).toBe('new value')
    })
  })

  // ── Offline / reconnect ────────────────────────────────────────────────────
  describe('offline edit + reconnect convergence', () => {
    it('offline edits applied after reconnect produce correct state', () => {
      const server = new Y.Doc()
      const client = new Y.Doc()

      // Initial sync
      server.getMap('cells').set('r0c0', 'server-value')
      Y.applyUpdate(client, Y.encodeStateAsUpdate(server))

      // Client goes offline and makes changes
      client.getMap('cells').set('r0c0', 'client-offline-edit')
      client.getMap('cells').set('r0c1', 'client-new-cell')

      // Server makes changes while client is offline
      server.getMap('cells').set('r0c2', 'server-offline-edit')

      // Client reconnects — exchange full state
      Y.applyUpdate(server, Y.encodeStateAsUpdate(client))
      Y.applyUpdate(client, Y.encodeStateAsUpdate(server))

      // Both should converge to same state
      const serverCells = server.getMap('cells')
      const clientCells = client.getMap('cells')
      expect(serverCells.get('r0c1')).toBe('client-new-cell')  // client's edit
      expect(serverCells.get('r0c2')).toBe('server-offline-edit') // server's edit
      expect(clientCells.get('r0c1')).toBe(serverCells.get('r0c1'))
      expect(clientCells.get('r0c2')).toBe(serverCells.get('r0c2'))
    })
  })
})
