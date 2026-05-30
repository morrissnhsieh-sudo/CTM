import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./setup.ts'],
    // Exclude Playwright e2e specs — they require a running browser
    exclude: ['**/e2e/**', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: ['**/e2e/**', '**/node_modules/**', 'setup.ts', 'vitest.config.ts'],
      thresholds: { lines: 80, functions: 80, branches: 75 },
    },
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
  resolve: {
    alias: {
      '@ctm/shared-types': resolve(__dirname, '../packages/shared-types/src/index.ts'),
    },
  },
})
