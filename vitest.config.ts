import { existsSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

const here = (p: string) => path.resolve(import.meta.dirname, p)
/** The real entry when this checkout has it (the private repo), else the stub. */
const either = (real: string, stub: string) => (existsSync(here(real)) ? here(real) : here(stub))

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'] },
  resolve: {
    alias: {
      '#satellite-ui': either('components/satellite/index.ts', 'components/satellite-ui-stub.ts'),
      '#satellite': either('lib/satellite/index.ts', 'lib/satellite-stub.ts'),
      '@': here('.'),
    },
  },
})
