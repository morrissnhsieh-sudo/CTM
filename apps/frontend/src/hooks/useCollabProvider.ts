'use client'

import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { IndexeddbPersistence } from 'y-indexeddb'
import { useAuthStore } from '../store/authStore'
import { useGridStore } from '../store/gridStore'
import { useUserStore } from '../store/userStore'
import { presenceColor } from '../store/userStore'

const COLLAB_URL = process.env['NEXT_PUBLIC_COLLAB_URL'] ?? 'ws://localhost:1234'

export function useCollabProvider(sheetId: string) {
  const { user, accessToken } = useAuthStore()
  
  const docRef = useRef<Y.Doc | null>(null)
  if (!docRef.current) {
    docRef.current = new Y.Doc({ guid: sheetId })
  }

  useEffect(() => {
    useGridStore.setState({ sheetId })
    useGridStore.getState().clearCellCache()
  }, [sheetId])

  const doc = docRef.current
  const providerRef = useRef<HocuspocusProvider | null>(null)
  const [connected, setConnected] = useState(false)
  const gridStore = useGridStore()
  const { setCollaborator, removeCollaborator, userId } = useUserStore()

  useEffect(() => {
    if (!user || !accessToken) return

    // IndexedDB for offline support
    const idb = new IndexeddbPersistence(`ctm-sheet-${sheetId}`, doc)

    const provider = new HocuspocusProvider({
      url: `${COLLAB_URL}/doc/${sheetId}`,
      name: sheetId,
      document: doc,
      token: accessToken,

      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),

      onAwarenessUpdate: ({ states }) => {
        for (const [clientId, state] of Object.entries(states) as [string, Record<string, unknown>][]) {
          const uid = state['userId'] as string
          if (!uid || uid === userId) continue

          const cursor = state['cursor'] as { row: number; col: number } | undefined

          setCollaborator(uid, {
            userId: uid,
            name: (state['name'] as string) ?? uid.slice(0, 8),
            avatar: null,
            status: 'online',
            lastSeen: Date.now(),
            cursor,
            color: presenceColor(uid),
          })
        }

        // Remove stale collaborators
        const activeUids = new Set(
          Object.values(states as any)
            .map((s: any) => s['userId'] as string)
            .filter(Boolean)
        )
        // Note: pruning done via disconnect events
      },
    })

    // Broadcast own cursor position on selection change
    const unsubGrid = useGridStore.subscribe(
      (s) => s.activeCell,
      (activeCell) => {
        if (activeCell && provider.awareness) {
          provider.awareness.setLocalStateField('cursor', activeCell)
          provider.awareness.setLocalStateField('userId', userId)
          provider.awareness.setLocalStateField('name', user?.name ?? userId ?? '')
        }
      },
    )

    // Sync Y.Doc cell changes back to gridStore
    const cellsMap = doc.getMap<Y.Map<unknown>>('cells')
    const rowMetadataMap = doc.getMap<any>('rowMetadata')
    const undoManager = new Y.UndoManager([cellsMap, rowMetadataMap])

    const applyFormat = (format: Partial<import('@ctm/shared-types').CellFormat>) => {
      const selection = useGridStore.getState().selection
      if (!selection) return
      const startRow = Math.min(selection.startRow, selection.endRow)
      const endRow = Math.max(selection.startRow, selection.endRow)
      const startCol = Math.min(selection.startCol, selection.endCol)
      const endCol = Math.max(selection.startCol, selection.endCol)

      doc.transact(() => {
        for (let r = startRow; r <= endRow; r++) {
          for (let c = startCol; c <= endCol; c++) {
            const key = `r${r}c${c}`
            let cellMap = cellsMap.get(key)
            if (!cellMap) {
              cellMap = new Y.Map()
              cellsMap.set(key, cellMap)
            }
            const existing = (cellMap.get('format') || {}) as Record<string, unknown>
            cellMap.set('format', { ...existing, ...format })
          }
        }
      })

      // Update locally immediately
      const m = new Map(useGridStore.getState().formatCache)
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          const key = `r${r}c${c}`
          const existing = m.get(key) ?? {}
          m.set(key, { ...existing, ...format })
        }
      }
      useGridStore.setState({ formatCache: m })
    }

    const setRowMetadata = (key: string, meta: { parentId: string | null; expanded: boolean; indent: number }) => {
      doc.transact(() => {
        rowMetadataMap.set(key, meta)
      })
      const m = new Map(useGridStore.getState().rowMetadata)
      m.set(key, meta)
      useGridStore.setState({ rowMetadata: m })
      useGridStore.getState().updateVisibleRows(1000)
    }

    useGridStore.setState({
      undo: () => undoManager.undo(),
      redo: () => undoManager.redo(),
      applyFormat,
      setRowMetadata,
    })

    const deepObserver = (events: Y.YEvent<any>[]) => {
      let metadataChanged = false
      events.forEach((event) => {
        if (event.target === cellsMap) {
          const mapEvent = event as Y.YMapEvent<any>
          mapEvent.keysChanged.forEach((key: string) => {
            const cell = cellsMap.get(key)
            if (cell) {
              const value = cell.get('value')
              if (value !== undefined) {
                gridStore.setCellCache(key, value as import('@ctm/shared-types').CellValue)
              }
              const format = cell.get('format')
              if (format !== undefined) {
                gridStore.setFormatCache(key, format as Partial<import('@ctm/shared-types').CellFormat>)
              }
              const updatedAt = cell.get('updatedAt')
              if (updatedAt !== undefined) {
                gridStore.setCellUpdateCache(key, updatedAt as string)
              }
            } else {
              gridStore.setCellCache(key, null)
              gridStore.setFormatCache(key, {})
              gridStore.setCellUpdateCache(key, null)
            }
          })
        } else if (event.target === rowMetadataMap) {
          const mapEvent = event as Y.YMapEvent<any>
          mapEvent.keysChanged.forEach((key: string) => {
            const meta = rowMetadataMap.get(key)
            const m = new Map(useGridStore.getState().rowMetadata)
            if (meta) {
              m.set(key, meta)
            } else {
              m.delete(key)
            }
            useGridStore.setState({ rowMetadata: m })
          })
          metadataChanged = true
        } else {
          const key = event.path[0] as string | undefined
          if (key) {
            const cell = cellsMap.get(key)
            if (cell) {
              const value = cell.get('value')
              if (value !== undefined) {
                gridStore.setCellCache(key, value as import('@ctm/shared-types').CellValue)
              }
              const format = cell.get('format')
              if (format !== undefined) {
                gridStore.setFormatCache(key, format as Partial<import('@ctm/shared-types').CellFormat>)
              }
              const updatedAt = cell.get('updatedAt')
              if (updatedAt !== undefined) {
                gridStore.setCellUpdateCache(key, updatedAt as string)
              }
            }
          }
        }
      })
      if (metadataChanged) {
        useGridStore.getState().updateVisibleRows(1000)
      }
    }

    // Initial load
    cellsMap.forEach((cell, cellRef) => {
      const value = cell.get('value')
      if (value !== undefined) {
        gridStore.setCellCache(cellRef, value as import('@ctm/shared-types').CellValue)
      }
      const format = cell.get('format')
      if (format !== undefined) {
        gridStore.setFormatCache(cellRef, format as Partial<import('@ctm/shared-types').CellFormat>)
      }
      const updatedAt = cell.get('updatedAt')
      if (updatedAt !== undefined) {
        gridStore.setCellUpdateCache(cellRef, updatedAt as string)
      }
    })

    rowMetadataMap.forEach((meta: any, key: string) => {
      gridStore.setRowMetadata(key, meta)
    })
    gridStore.updateVisibleRows(1000)

    cellsMap.observeDeep(deepObserver)
    rowMetadataMap.observeDeep(deepObserver)

    providerRef.current = provider

    return () => {
      unsubGrid()
      cellsMap.unobserveDeep(deepObserver)
      rowMetadataMap.unobserveDeep(deepObserver)
      provider.destroy()
      idb.destroy()
      setConnected(false)
      // Restore default local actions
      useGridStore.setState({
        undo: () => {},
        redo: () => {},
        setRowMetadata: () => {},
        applyFormat: (format: Partial<import('@ctm/shared-types').CellFormat>) => {
          const state = useGridStore.getState()
          const selection = state.selection
          if (!selection) return
          const m = new Map(state.formatCache)
          const startRow = Math.min(selection.startRow, selection.endRow)
          const endRow = Math.max(selection.startRow, selection.endRow)
          const startCol = Math.min(selection.startCol, selection.endCol)
          const endCol = Math.max(selection.startCol, selection.endCol)

          for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
              const key = `r${r}c${c}`
              const existing = m.get(key) ?? {}
              m.set(key, { ...existing, ...format })
            }
          }
          useGridStore.setState({ formatCache: m })
        }
      })
    }
  }, [sheetId, user, accessToken])

  return {
    doc: docRef.current,
    provider: providerRef.current,
    connected,
  }
}
