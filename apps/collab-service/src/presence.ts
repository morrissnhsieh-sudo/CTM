import Redis from 'ioredis'
import type { PresenceData } from '@ctm/shared-types'

/**
 * PresenceManager — Redis-backed presence tracking.
 * Key: presence:{workspaceId} → Hash { userId: JSON }
 * TTL: 30s, refreshed by Hocuspocus awareness heartbeat
 */
export class PresenceManager {
  private readonly TTL_SECONDS = 30

  constructor(private redis: Redis) {}

  async setPresence(
    workspaceId: string,
    userId: string,
    data: Partial<PresenceData> & { sheetId?: string },
  ) {
    const key = `presence:${workspaceId}`
    const payload: PresenceData = {
      userId,
      name: data.name ?? userId,
      avatar: data.avatar ?? null,
      status: 'online',
      lastSeen: Date.now(),
    }

    await this.redis.hset(key, userId, JSON.stringify(payload))
    await this.redis.expire(key, this.TTL_SECONDS)
  }

  async removePresence(workspaceId: string, userId: string) {
    const key = `presence:${workspaceId}`
    await this.redis.hdel(key, userId)
  }

  async getPresence(workspaceId: string): Promise<PresenceData[]> {
    const key = `presence:${workspaceId}`
    const hash = await this.redis.hgetall(key)

    return Object.values(hash)
      .map(v => {
        try { return JSON.parse(v) as PresenceData }
        catch { return null }
      })
      .filter((v): v is PresenceData => v !== null)
  }

  async refreshPresence(workspaceId: string, userId: string) {
    const key = `presence:${workspaceId}`
    const existing = await this.redis.hget(key, userId)
    if (existing) {
      try {
        const data = JSON.parse(existing) as PresenceData
        data.lastSeen = Date.now()
        await this.redis.hset(key, userId, JSON.stringify(data))
        await this.redis.expire(key, this.TTL_SECONDS)
      } catch {
        // ignore
      }
    }
  }
}
