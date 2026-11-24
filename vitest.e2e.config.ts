import path from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Real-browser checks of the built web edition (npm run web:build first) and
 * the extension's store build. The network beyond the site is faked in each
 * test: no Anthropic, no trial server, no LinkedIn.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['e2e/**/*.test.ts'],
    testTimeout: 90_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '.') } },
})
