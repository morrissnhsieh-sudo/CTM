/**
 * M1 — Frontend Shell
 * Unit tests: presence colour assignment for collaborator cursors
 *
 * Spec refs:
 *  - M1.2.3 Real-time Presence: each collaborator gets a unique colour per session
 *  - Cursor display: coloured border + initials avatar
 *  - 8 distinct colours from the PRESENCE_COLORS palette
 */

import { describe, it, expect } from 'vitest'

const PRESENCE_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
]

function presenceColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i)
    hash |= 0
  }
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length]!
}

describe('M1 presenceColor', () => {
  it('returns a valid hex colour string', () => {
    const color = presenceColor('user-abc-123')
    expect(color).toMatch(/^#[0-9A-F]{6}$/i)
  })

  it('is deterministic — same userId always returns same colour', () => {
    const id = 'user-deterministic-test'
    expect(presenceColor(id)).toBe(presenceColor(id))
    expect(presenceColor(id)).toBe(presenceColor(id)) // third call
  })

  it('returns one of the 8 defined palette colours', () => {
    const color = presenceColor('some-user-id')
    expect(PRESENCE_COLORS).toContain(color)
  })

  it('different user IDs typically produce different colours', () => {
    const colors = new Set(
      ['user-1', 'user-2', 'user-3', 'user-4', 'user-5',
       'user-6', 'user-7', 'user-8', 'alice', 'bob']
        .map(presenceColor)
    )
    // At least 3 distinct colours across 10 users (hash distribution)
    expect(colors.size).toBeGreaterThanOrEqual(3)
  })

  it('handles empty string userId without throwing', () => {
    expect(() => presenceColor('')).not.toThrow()
  })

  it('handles UUID-format user IDs', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    const color = presenceColor(uuid)
    expect(PRESENCE_COLORS).toContain(color)
  })

  it('all 8 palette colours are reachable (hash distribution)', () => {
    // Generate many users and verify all 8 colours appear
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      seen.add(presenceColor(`user-${i}-test-${i * 7}`))
    }
    expect(seen.size).toBe(8)
  })
})
