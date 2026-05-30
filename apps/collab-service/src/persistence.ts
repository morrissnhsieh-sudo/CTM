import * as Y from 'yjs'
import pg from 'pg'
import { logger } from './logger.js'

/**
 * DocumentPersistence — handles PostgreSQL read/write for Y.Doc binary state.
 *
 * Storage model:
 *   collab.documents — latest snapshot (binary BYTEA)
 *   collab.update_log — append-only log of every update (for replay)
 *   collab.snapshots — periodic full snapshots (every 5 min)
 */
export class DocumentPersistence {
  private writeTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private pendingDocs = new Map<string, Y.Doc>()
  private snapshotQueue = new Set<string>()

  constructor(
    private pool: pg.Pool,
    private debounceMs: number,
  ) {}

  /**
   * Cold-load: reconstruct Y.Doc from latest snapshot + update log replay.
   * p99 target: < 300ms
   */
  async loadDocument(sheetId: string): Promise<Y.Doc> {
    const doc = new Y.Doc({ guid: sheetId })

    try {
      const client = await this.pool.connect()
      try {
        // 1. Load latest snapshot
        const snapshotRes = await client.query<{ ydoc_binary: Buffer; version: number }>(
          `SELECT ydoc_binary, version FROM collab.documents WHERE sheet_id = $1`,
          [sheetId],
        )

        if (snapshotRes.rows[0]) {
          const binary = snapshotRes.rows[0].ydoc_binary
          Y.applyUpdate(doc, binary)
          logger.debug({ sheetId, version: snapshotRes.rows[0].version }, 'Loaded document snapshot')
        }

        // 2. Replay update log since last snapshot
        const updateRes = await client.query<{ update_binary: Buffer; id: number }>(
          `SELECT id, update_binary FROM collab.update_log
           WHERE sheet_id = $1
           ORDER BY id ASC`,
          [sheetId],
        )

        for (const row of updateRes.rows) {
          Y.applyUpdate(doc, row.update_binary)
        }

        logger.debug({ sheetId, updates: updateRes.rows.length }, 'Replayed update log')
      } finally {
        client.release()
      }
    } catch (err) {
      logger.error({ err, sheetId }, 'Failed to load document from PostgreSQL — starting empty')
    }

    return doc
  }

  /**
   * Schedule a debounced write to collab.documents.
   * Multiple rapid edits are coalesced into one write.
   */
  scheduleWrite(sheetId: string, doc: Y.Doc) {
    this.pendingDocs.set(sheetId, doc)

    const existing = this.writeTimers.get(sheetId)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      this.writeTimers.delete(sheetId)
      void this.flushDocument(sheetId)
    }, this.debounceMs)

    this.writeTimers.set(sheetId, timer)
  }

  /**
   * Append a CRDT update to the update_log for audit trail.
   */
  async appendUpdate(sheetId: string, update: Uint8Array, clientId: string) {
    try {
      await this.pool.query(
        `INSERT INTO collab.update_log (sheet_id, update_binary, client_id)
         VALUES ($1, $2, $3)`,
        [sheetId, Buffer.from(update), clientId],
      )
    } catch (err) {
      logger.error({ err, sheetId }, 'Failed to append update log')
    }
  }

  /**
   * Write a full snapshot to collab.documents and queue snapshot creation.
   */
  async writeSnapshot(sheetId: string, doc: Y.Doc) {
    this.snapshotQueue.add(sheetId)
    await this.flushDocument(sheetId)
  }

  /**
   * Flush snapshot queue — called every SNAPSHOT_INTERVAL_MS.
   */
  async flushSnapshots() {
    const toFlush = [...this.snapshotQueue]
    this.snapshotQueue.clear()

    for (const sheetId of toFlush) {
      const doc = this.pendingDocs.get(sheetId)
      if (!doc) continue
      await this.writeFullSnapshot(sheetId, doc)
    }
  }

  private async flushDocument(sheetId: string) {
    const doc = this.pendingDocs.get(sheetId)
    if (!doc) return

    try {
      const binary = Buffer.from(Y.encodeStateAsUpdate(doc))
      await this.pool.query(
        `INSERT INTO collab.documents (sheet_id, ydoc_binary, version, last_updated_at)
         VALUES ($1, $2, 1, NOW())
         ON CONFLICT (sheet_id) DO UPDATE
         SET ydoc_binary = $2, version = collab.documents.version + 1, last_updated_at = NOW()`,
        [sheetId, binary],
      )
      logger.debug({ sheetId, bytes: binary.length }, 'Flushed document to PostgreSQL')
    } catch (err) {
      logger.error({ err, sheetId }, 'Failed to flush document')
    }
  }

  private async writeFullSnapshot(sheetId: string, doc: Y.Doc) {
    try {
      const binary = Buffer.from(Y.encodeStateAsUpdate(doc))
      await this.pool.query(
        `INSERT INTO collab.snapshots (sheet_id, ydoc_binary) VALUES ($1, $2)`,
        [sheetId, binary],
      )

      // Prune update_log older than this snapshot
      await this.pool.query(
        `DELETE FROM collab.update_log
         WHERE sheet_id = $1
         AND created_at < (
           SELECT last_updated_at FROM collab.documents WHERE sheet_id = $1
         )`,
        [sheetId],
      )
    } catch (err) {
      logger.error({ err, sheetId }, 'Failed to write snapshot')
    }
  }
}
