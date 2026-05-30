'use client'

import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { IndexeddbPersistence } from 'y-indexeddb'
import { useSession } from 'next-auth/react'
import { useGridStore } from '../store/gridStore'
import { useUserStore } from '../store/userStore'
import { presenceColor } from '../store/userStore'

const COLLAB_URL = process.env['NEXT_PUBLIC_COLLAB_URL'] ?? 'ws://localhost:1234'

export function useCollabProvider(sheetId: string) {
  const { data: session } = useSession()
  const docRef = useRef<Y.Doc>(new Y.Doc({ guid: sheetId }))
  const providerRef = useRef<HocuspocusProvider | null>(null)
  const [connected, setConnected] = useState(false)
  const gridStore = useGridStore()
  const { setCollaborator, removeCollaborator, userId } = useUserStore()

  useEffect(() => {
    if (!session) return

    const doc = docRef.current

    // IndexedDB for offline support
    const idb = new IndexeddbPersistence(`ctm-sheet-${sheetId}`, doc)

    const accessToken = (session as Record<string, unknown>)['accessToken'] as string | undefined
    if (!accessToken) return

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
          provider.awareness.setLocalStateField('name', session.user?.name ?? userId ?? '')
        }
      },
    )

    // Sync Y.Doc cell changes back to gridStore
    const cellsMap = doc.getMap<Y.Map<unknown>>('cells')
    const observer = () => {
      cellsMap.forEach((cell, cellRef) => {
        const value = cell.get('value')
        if (value != null) {
          gridStore.setCellCache(cellRef, value as import('@ctm/shared-types').CellValue)
        }
      })
    }
    cellsMap.observe(observer)

    providerRef.current = provider

    return () => {
      unsubGrid()
      cellsMap.unobserve(observer)
      provider.destroy()
      idb.destroy()
      setConnected(false)
    }
  }, [sheetId, session?.user])

  return {
    doc: docRef.current,
    provider: providerRef.current,
    connected,
  }
}
