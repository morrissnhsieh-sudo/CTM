import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

const authApiBase = process.env['AUTH_API_BASE'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        let response: Response
        try {
          response = await fetch(`${authApiBase}/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          })
        } catch (err) {
          console.error('[auth] fetch failed — is api-service reachable?', authApiBase, err)
          return null
        }

        if (!response.ok) {
          const body = await response.text().catch(() => '')
          console.error('[auth] login rejected', response.status, body)
          return null
        }

        const payload = await response.json() as {
          data?: {
            token: string
            user: {
              id: string
              email: string
              name: string
              role: string
              workspaceId: string
            }
          }
        }

        if (!payload.data?.token || !payload.data?.user) {
          return null
        }

        return {
          id: payload.data.user.id,
          email: payload.data.user.email,
          name: payload.data.user.name,
          accessToken: payload.data.token,
          role: payload.data.user.role,
          workspaceId: payload.data.user.workspaceId,
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  secret: process.env['NEXTAUTH_SECRET'],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as any
        token.sub = u.id
        token.email = u.email
        token.name = u.name
        token.accessToken = u.accessToken
        token.role = u.role
        token.workspaceId = u.workspaceId
      }
      return token
    },

    async session({ session, token }) {
      session.user.id = token.sub ?? ''
      session.user.email = token.email as string
      session.user.name = token.name as string
      ;(session as any)['accessToken'] = token.accessToken
      ;(session as any)['workspaceId'] = token.workspaceId
      ;(session as any)['role'] = token.role
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
})
