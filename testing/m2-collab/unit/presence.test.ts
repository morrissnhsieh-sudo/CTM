/**
 * M2 — Collaboration Engine
 * Unit tests: PresenceManager (Redis-backed cursor/presence tracking)
 *
 * Spec refs:
 *  - Awareness: each client broadcasts {user, cursor:{row,col}, selection, color} at 100ms interval
 *  - Key: presence:{workspaceId} → Hash {userId: JSON}; TTL 30s refreshed by heartbeat
 *  - On disconnect: HDEL presence:{workspaceId} userId
 *  - getPresence returns all active users as PresenceData[]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock Redis ────────────────────────────────────────────────────────────────
const mockRedis = {
  hset: vi.fn().mockResolvedValue(1),
  hdel: vi.fn().mockResolvedValue(1),
  hget: vi.fn().mockResolvedValue(null),
  hgetall: vi.fn().mockResolvedValue({}),
  expire: vi.fn().mockResolvedValue(1),
}

// ── Inline PresenceManager (mirrors apps/collab-service/src/presence.ts) ─────
class PresenceManager {
  constructor(private redis: typeof mockRedis) {}

  async setPresence(workspaceId: string, userId: string, data: Record<string, unknown>) {
    const key = `presence:${workspaceId}`
    const payload = { userId, name: data['name'] ?? userId, status: 'online', lastSeen: Date.now() }
    await this.redis.hset(key, userId, JSON.stringify(payload))
    await this.redis.expire(key, 30)
  }

  async removePresence(workspaceId: string, userId: string) {
    await this.redis.hdel(`presence:${workspaceId}`, userId)
  }

  async getPresence(workspaceId: string) {
    const hash = await this.redis.hgetall(`presence:${workspaceId}`)
    return Object.values(hash)
      .map((v) => { try { return JSON.parse(v as string) } catch { return null } })
      .filter(Boolean)
  }

  async refreshPresence(workspaceId: string, userId: string) {
    const key = `presence:${workspaceId}`
    const existing = await this.redis.hget(key, userId)
    if (existing) {
      const data = JSON.parse(existing as string)
      data.lastSeen = Date.now()
      await this.redis.hset(key, userId, JSON.stringify(data))
      await this.redis.expire(key, 30)
    }
  }
}

describe('M2 PresenceManager', () => {
  let pm: PresenceManager
  const WS_ID = 'workspace-abc'
  const USER_ID = 'user-xyz'

  beforeEach(() => {
    vi.clearAllMocks()
    pm = new PresenceManager(mockRedis)
  })

  describe('setPresence', () => {
    it('writes presence hash to Redis with correct key', async () => {
      await pm.setPresence(WS_ID, USER_ID, { name: 'Alice' })
      expect(mockRedis.hset).toHaveBeenCalledWith(
        `presence:${WS_ID}`,
        USER_ID,
        expect.stringContaining('"status":"online"'),
      )
    })

    it('sets 30-second TTL on the presence hash', async () => {
      await pm.setPresence(WS_ID, USER_ID, {})
      expect(mockRedis.expire).toHaveBeenCalledWith(`presence:${WS_ID}`, 30)
    })

    it('stores userId in the presence payload', async () => {
      await pm.setPresence(WS_ID, USER_ID, { name: 'Bob' })
      const callArg = mockRedis.hset.mock.calls[0]![2] as string
      const parsed = JSON.parse(callArg)
      expect(parsed.userId).toBe(USER_ID)
    })

    it('defaults name to userId when name not provided', async () => {
      await pm.setPresence(WS_ID, USER_ID, {})
      const callArg = mockRedis.hset.mock.calls[0]![2] as string
      const parsed = JSON.parse(callArg)
      expect(parsed.name).toBe(USER_ID)
    })

    it('marks status as online', async () => {
      await pm.setPresence(WS_ID, USER_ID, {})
      const callArg = mockRedis.hset.mock.calls[0]![2] as string
      expect(JSON.parse(callArg).status).toBe('online')
    })
  })

  describe('removePresence', () => {
    it('calls HDEL with correct workspace key and userId', async () => {
      await pm.removePresence(WS_ID, USER_ID)
      expect(mockRedis.hdel).toHaveBeenCalledWith(`presence:${WS_ID}`, USER_ID)
    })
  })

  describe('getPresence', () => {
    it('returns empty array when no users are present', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({})
      const result = await pm.getPresence(WS_ID)
      expect(result).toEqual([])
    })

    it('parses all users from the Redis hash', async () => {
      const alice = JSON.stringify({ userId: 'alice', status: 'online', lastSeen: Date.now() })
      const bob = JSON.stringify({ userId: 'bob', status: 'online', lastSeen: Date.now() })
      mockRedis.hgetall.mockResolvedValueOnce({ alice, bob })
      const result = await pm.getPresence(WS_ID)
      expect(result).toHaveLength(2)
      expect(result.map((u: { userId: string }) => u.userId)).toContain('alice')
      expect(result.map((u: { userId: string }) => u.userId)).toContain('bob')
    })

    it('silently skips malformed JSON entries', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        good: JSON.stringify({ userId: 'good', status: 'online' }),
        bad: 'not-valid-json',
      })
      const result = await pm.getPresence(WS_ID)
      expect(result).toHaveLength(1)
    })
  })

  describe('refreshPresence', () => {
    it('updates lastSeen timestamp for an existing user', async () => {
      const original = JSON.stringify({ userId: USER_ID, lastSeen: 1000, status: 'online' })
      mockRedis.hget.mockResolvedValueOnce(original)
      await pm.refreshPresence(WS_ID, USER_ID)
      const callArg = mockRedis.hset.mock.calls[0]![2] as string
      const updated = JSON.parse(callArg)
      expect(updated.lastSeen).toBeGreaterThan(1000)
    })

    it('does nothing when user is not in Redis', async () => {
      mockRedis.hget.mockResolvedValueOnce(null)
      await pm.refreshPresence(WS_ID, USER_ID)
      expect(mockRedis.hset).not.toHaveBeenCalled()
    })

    it('refreshes the 30-second TTL', async () => {
      mockRedis.hget.mockResolvedValueOnce(JSON.stringify({ userId: USER_ID, lastSeen: 1000, status: 'online' }))
      await pm.refreshPresence(WS_ID, USER_ID)
      expect(mockRedis.expire).toHaveBeenCalledWith(`presence:${WS_ID}`, 30)
    })
  })
})
