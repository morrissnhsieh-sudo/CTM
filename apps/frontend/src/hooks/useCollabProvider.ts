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
  const docRef = useRef<Y.Doc>(new Y.Doc({ guid: sheetId }))
  const providerRef = useRef<HocuspocusProvider | null>(null)
  const [connected, setConnected] = useState(false)
  const gridStore = useGridStore()
  const { setCollaborator, removeCollaborator, userId } = useUserStore()

  useEffect(() => {
    if (!user || !accessToken) return

    const doc = docRef.current

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
          Object.values(states as Record<string, Record<string, unknown>>)
            .map((s) => s['userId'] as string)
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
    const undoManager = new Y.UndoManager(cellsMap)

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

    useGridStore.setState({
      undo: () => undoManager.undo(),
      redo: () => undoManager.redo(),
      applyFormat,
    })

    const observer = (event: Y.YMapEvent<Y.Map<unknown>>) => {
      event.keysChanged.forEach((key) => {
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
        }
      })
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
    })

    cellsMap.observe(observer)

    providerRef.current = provider

    return () => {
      unsubGrid()
      cellsMap.unobserve(observer)
      provider.destroy()
      idb.destroy()
      setConnected(false)
      // Restore default local actions
      useGridStore.setState({
        undo: () => {},
        redo: () => {},
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
