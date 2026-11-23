import path from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * The database suites on sqlite-wasm (the web edition's engine). Tests about
 * files on disk — backup, restore, auto-backup, reopening a path — have no
 * meaning in a browser and stay on the native run only.
 */
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/support/wasm-db.ts'],
    include: [
      'tests/db/**/*.test.ts',
      'tests/variants.test.ts',
      'tests/variant-translation.test.ts',
      'tests/kit/**/*.test.ts',
      'tests/followup/**/*.test.ts',
      'tests/discover/dismissed.test.ts',
      'tests/application/**/*.test.ts*',
      'tests/api/**/*.test.ts',
    ],
    exclude: [
      'tests/db/backup.test.ts',
      'tests/db/restore.test.ts',
      'tests/db/auto-backup.test.ts',
    ],
  },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '.') } },
})
