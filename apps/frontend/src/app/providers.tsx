'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { useState } from 'react'
import { AuthInitializer } from '@/components/auth/AuthInitializer'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          gcTime: 5 * 60_000,
          refetchOnWindowFocus: true,
          retry: 2,
        },
      },
    })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <AuthInitializer />
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          expand={false}
          toastOptions={{ duration: 4000 }}
        />
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  )
}
