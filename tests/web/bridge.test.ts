import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generate } from '@/scripts/gen-web-bridge'

describe('the web bridge to the desktop’s actions and routes', () => {
  it('is up to date (run `npm run web:bridge` after adding or renaming an action or route)', () => {
    for (const [file, text] of Object.entries(generate())) {
      expect(readFileSync(file, 'utf8'), file).toBe(text)
    }
  })

  it('leaves out every desktop-only module and keeps the AI routes', () => {
    const registry = generate()['web/worker/registry.gen.ts'] ?? ''
    for (const gone of [
      'app/api/export/pdf',
      'export/backup',
      'import/backup',
      'shutdown',
      '/push/',
      'app/(app)/settings/actions',
      'agent/actions',
      'agent-actions',
      'discover/actions',
      '@/lib/satellite',
      '@/lib/agent',
    ]) {
      expect(registry).not.toContain(gone)
    }
    // The browser's own replacements stand in for the desktop-only ones.
    expect(registry).toContain("'/api/export/pdf': wr")
    expect(registry).toContain('@/web/worker/actions/settings')
    for (const kept of ['/api/ai/triage', '/api/ai/compose', '/api/ai/parse-cv', '/api/ai/prep']) {
      expect(registry).toContain(`'${kept}'`)
    }
  })
})
