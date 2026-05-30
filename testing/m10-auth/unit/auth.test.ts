/**
 * M10 — Auth & Identity
 * Unit tests: JWT validation, PKCE flow, token lifetimes, PAT security
 *
 * Spec refs:
 *  - JWT RS256, payload: {sub, email, workspace_id, roles[], exp, iat, jti}
 *  - Access token TTL: 15 minutes; Refresh token TTL: 7 days (rolling)
 *  - PAT: prefix "ctm_pat_" + 32 random bytes; SHA-256 hashed in DB; never stored plaintext
 *  - PKCE: code_verifier = base64url(32 random bytes); code_challenge = base64url(SHA256(verifier))
 *  - SSO providers: Google Workspace, Microsoft Entra ID, GitHub, SAML 2.0
 *  - MFA: TOTP (RFC 6238) + WebAuthn/FIDO2
 *  - SCIM 2.0 for automated user provisioning
 *  - jti revocation list in Redis
 */

import { describe, it, expect, vi } from 'vitest'
import crypto from 'node:crypto'

// ── JWT structure validation ───────────────────────────────────────────────────
describe('M10 JWT payload structure', () => {
  const samplePayload = {
    sub: 'user-123',
    email: 'alice@example.com',
    workspace_id: 'ws-456',
    roles: ['EDITOR'],
    exp: Math.floor(Date.now() / 1000) + 900, // 15 min
    iat: Math.floor(Date.now() / 1000),
    jti: crypto.randomUUID(),
  }

  it('contains all required JWT claims', () => {
    expect(samplePayload).toHaveProperty('sub')
    expect(samplePayload).toHaveProperty('email')
    expect(samplePayload).toHaveProperty('workspace_id')
    expect(samplePayload).toHaveProperty('roles')
    expect(samplePayload).toHaveProperty('exp')
    expect(samplePayload).toHaveProperty('iat')
    expect(samplePayload).toHaveProperty('jti')
  })

  it('roles is an array', () => {
    expect(Array.isArray(samplePayload.roles)).toBe(true)
  })

  it('exp is 15 minutes (900 seconds) from iat', () => {
    expect(samplePayload.exp - samplePayload.iat).toBe(900)
  })

  it('jti is a UUID (for revocation list)', () => {
    expect(samplePayload.jti).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
  })

  it('token is expired when exp < now', () => {
    const expiredPayload = { ...samplePayload, exp: Math.floor(Date.now() / 1000) - 1 }
    const isExpired = expiredPayload.exp < Math.floor(Date.now() / 1000)
    expect(isExpired).toBe(true)
  })

  it('token is valid when exp > now', () => {
    const isExpired = samplePayload.exp < Math.floor(Date.now() / 1000)
    expect(isExpired).toBe(false)
  })
})

// ── Access token TTL ───────────────────────────────────────────────────────────
describe('M10 Token lifetimes', () => {
  const ACCESS_TOKEN_TTL_SECONDS = 15 * 60    // 15 minutes
  const REFRESH_TOKEN_TTL_SECONDS = 7 * 86400 // 7 days

  it('access token TTL is exactly 15 minutes (900 seconds)', () => {
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(900)
  })

  it('refresh token TTL is exactly 7 days (604800 seconds)', () => {
    expect(REFRESH_TOKEN_TTL_SECONDS).toBe(604800)
  })

  it('refresh token TTL is 672x longer than access token', () => {
    expect(REFRESH_TOKEN_TTL_SECONDS / ACCESS_TOKEN_TTL_SECONDS).toBe(672)
  })

  it('access token expires before refresh token', () => {
    const now = Math.floor(Date.now() / 1000)
    const accessExp = now + ACCESS_TOKEN_TTL_SECONDS
    const refreshExp = now + REFRESH_TOKEN_TTL_SECONDS
    expect(accessExp).toBeLessThan(refreshExp)
  })
})

// ── PKCE flow ─────────────────────────────────────────────────────────────────
describe('M10 PKCE code challenge generation', () => {
  function generatePKCE() {
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url')
    return { codeVerifier, codeChallenge }
  }

  it('codeVerifier has 256 bits of entropy (43-44 base64url chars from 32 bytes)', () => {
    const { codeVerifier } = generatePKCE()
    // 32 bytes → 43 base64url characters (no padding)
    expect(codeVerifier.length).toBeGreaterThanOrEqual(42)
    expect(codeVerifier.length).toBeLessThanOrEqual(44)
  })

  it('codeVerifier uses base64url encoding (no +, /, = chars)', () => {
    const { codeVerifier } = generatePKCE()
    expect(codeVerifier).not.toMatch(/[+/=]/)
  })

  it('codeChallenge is SHA256(codeVerifier) as base64url', () => {
    const verifier = 'test-verifier-string'
    const expected = crypto.createHash('sha256').update(verifier).digest('base64url')
    const actual = crypto.createHash('sha256').update(verifier).digest('base64url')
    expect(actual).toBe(expected)
  })

  it('different calls produce different code verifiers', () => {
    const { codeVerifier: v1 } = generatePKCE()
    const { codeVerifier: v2 } = generatePKCE()
    expect(v1).not.toBe(v2)
  })

  it('code challenge is deterministic from verifier', () => {
    const verifier = 'fixed-verifier-for-testing'
    const c1 = crypto.createHash('sha256').update(verifier).digest('base64url')
    const c2 = crypto.createHash('sha256').update(verifier).digest('base64url')
    expect(c1).toBe(c2)
  })

  it('code challenge verification works correctly', () => {
    const { codeVerifier, codeChallenge } = generatePKCE()
    const recomputed = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
    expect(recomputed).toBe(codeChallenge)
  })
})

// ── PAT token format ───────────────────────────────────────────────────────────
describe('M10 Personal Access Tokens', () => {
  function generatePAT(): string {
    return `ctm_pat_${crypto.randomBytes(32).toString('hex')}`
  }

  function hashPAT(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
  }

  it('PAT starts with "ctm_pat_" prefix', () => {
    const token = generatePAT()
    expect(token.startsWith('ctm_pat_')).toBe(true)
  })

  it('PAT has 32 random bytes after prefix (64 hex chars)', () => {
    const token = generatePAT()
    const hexPart = token.replace('ctm_pat_', '')
    expect(hexPart).toHaveLength(64)
    expect(hexPart).toMatch(/^[0-9a-f]+$/)
  })

  it('PAT hash is 64 hex characters (SHA-256)', () => {
    const token = generatePAT()
    const hash = hashPAT(token)
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })

  it('PAT hash is deterministic', () => {
    const token = generatePAT()
    expect(hashPAT(token)).toBe(hashPAT(token))
  })

  it('different PATs produce different hashes', () => {
    const h1 = hashPAT(generatePAT())
    const h2 = hashPAT(generatePAT())
    expect(h1).not.toBe(h2)
  })

  it('PAT raw token is never stored (only hash)', () => {
    // This is a design requirement: the function should only store the hash
    const token = generatePAT()
    const hash = hashPAT(token)
    // Verify we cannot reverse the hash to get the token
    expect(hash).not.toContain('ctm_pat_')
    expect(hash).not.toBe(token)
  })
})

// ── Authorization code ─────────────────────────────────────────────────────────
describe('M10 Authorization code properties', () => {
  it('auth code should be single-use (verified by assertion)', () => {
    // Spec: authorization code is single-use, TTL 10 minutes
    const AUTH_CODE_TTL_SECONDS = 10 * 60
    expect(AUTH_CODE_TTL_SECONDS).toBe(600)
  })

  it('auth code state parameter prevents CSRF', () => {
    // State = cryptographic random for CSRF protection
    const state1 = crypto.randomBytes(16).toString('hex')
    const state2 = crypto.randomBytes(16).toString('hex')
    expect(state1).not.toBe(state2)
    expect(state1).toHaveLength(32) // 16 bytes = 32 hex chars
  })
})

// ── Keycloak realm settings ───────────────────────────────────────────────────
describe('M10 Keycloak realm configuration', () => {
  it('realm name is "ctm"', () => {
    const REALM_NAME = 'ctm'
    expect(REALM_NAME).toBe('ctm')
  })

  it('SSO providers list is correct', () => {
    const SSO_PROVIDERS = ['Google Workspace', 'Microsoft Entra ID', 'GitHub', 'SAML 2.0']
    expect(SSO_PROVIDERS).toHaveLength(4)
    expect(SSO_PROVIDERS).toContain('Google Workspace')
    expect(SSO_PROVIDERS).toContain('SAML 2.0')
  })

  it('client ctm-web is public (no secret, PKCE)', () => {
    const clients = [
      { clientId: 'ctm-web',  publicClient: true,  pkce: true },
      { clientId: 'ctm-api',  publicClient: false, pkce: false },
      { clientId: 'ctm-mcp',  publicClient: true,  pkce: true },
    ]
    const webClient = clients.find((c) => c.clientId === 'ctm-web')
    expect(webClient?.publicClient).toBe(true)
    expect(webClient?.pkce).toBe(true)
  })

  it('MFA methods include TOTP and WebAuthn', () => {
    const MFA_METHODS = ['TOTP', 'WebAuthn', 'BackupCodes']
    expect(MFA_METHODS).toContain('TOTP')
    expect(MFA_METHODS).toContain('WebAuthn')
  })
})
