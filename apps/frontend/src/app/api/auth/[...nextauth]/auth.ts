import NextAuth from 'next-auth'
import Keycloak from 'next-auth/providers/keycloak'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Keycloak({
      clientId: process.env['KEYCLOAK_CLIENT_ID'] ?? 'ctm-web',
      clientSecret: '',  // public PKCE client — no secret
      issuer: process.env['KEYCLOAK_ISSUER'],
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account }) {
      // Persist the Keycloak access_token and refresh_token on first sign-in
      if (account) {
        token['access_token'] = account.access_token
        token['refresh_token'] = account.refresh_token
        token['expires_at'] = account.expires_at
        token['workspace_id'] = (account as Record<string, unknown>)['workspace_id'] ?? ''
        token['role'] = (account as Record<string, unknown>)['role'] ?? 'VIEWER'
      }

      // Proactive access token refresh if expiring in < 60s
      const expiresAt = token['expires_at'] as number | undefined
      if (expiresAt && Date.now() / 1000 > expiresAt - 60) {
        try {
          const issuer = process.env['KEYCLOAK_ISSUER']
          const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              client_id: process.env['KEYCLOAK_CLIENT_ID'] ?? 'ctm-web',
              refresh_token: token['refresh_token'] as string,
            }),
          })

          const tokens = await response.json() as {
            access_token?: string
            refresh_token?: string
            expires_in?: number
          }

          if (!response.ok) throw tokens

          token['access_token'] = tokens.access_token
          token['refresh_token'] = tokens.refresh_token ?? token['refresh_token']
          token['expires_at'] = Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 900)
        } catch (error) {
          console.error('Token refresh failed:', error)
          token['error'] = 'RefreshAccessTokenError'
        }
      }

      return token
    },

    async session({ session, token }) {
      session.user.id = token.sub ?? ''
      ;(session as Record<string, unknown>)['accessToken'] = token['access_token']
      ;(session as Record<string, unknown>)['workspaceId'] = token['workspace_id']
      ;(session as Record<string, unknown>)['role'] = token['role']
      ;(session as Record<string, unknown>)['error'] = token['error']
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
})
