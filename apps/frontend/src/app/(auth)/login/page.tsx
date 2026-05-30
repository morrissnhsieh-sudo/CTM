import { signIn } from '../../../api/auth/[...nextauth]/auth'
import { redirect } from 'next/navigation'
import { auth } from '../../../api/auth/[...nextauth]/auth'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}) {
  const session = await auth()
  const params = await searchParams

  if (session?.user) {
    redirect(params.callbackUrl ?? '/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-10 w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-4">
            <span className="text-white font-bold text-xl">C</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Sign in to CTM</h1>
          <p className="mt-2 text-gray-500">Collaborative AI Spreadsheet Platform</p>
        </div>

        {params.error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
            Authentication error. Please try again.
          </div>
        )}

        <form
          action={async () => {
            'use server'
            await signIn('keycloak', { redirectTo: params.callbackUrl ?? '/' })
          }}
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
            </svg>
            Continue with SSO
          </button>
        </form>

        <p className="text-center text-xs text-gray-400">
          By signing in you agree to the Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
}
