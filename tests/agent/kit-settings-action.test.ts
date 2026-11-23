import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { must } from '../support/must'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

let dir: string
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cvforge-kitact-'))
  process.env.CVFORGE_CONFIG_PATH = path.join(dir, 'config.json')
  writeFileSync(process.env.CVFORGE_CONFIG_PATH, JSON.stringify({ anthropicApiKey: 'sk-keep' }))
})
afterEach(() => {
  delete process.env.CVFORGE_CONFIG_PATH
  rmSync(dir, { recursive: true, force: true })
})

describe('setKitSettingsAction', () => {
  it('saves both values and keeps everything else in config.json', async () => {
    const { setKitSettingsAction } = await import('@/app/(app)/settings/actions')
    expect(await setKitSettingsAction({ onChase: false, dailyCap: 3 })).toEqual({ ok: true })
    const saved = JSON.parse(
      readFileSync(must(process.env.CVFORGE_CONFIG_PATH, 'CVFORGE_CONFIG_PATH'), 'utf8'),
    )
    expect(saved).toEqual({ anthropicApiKey: 'sk-keep', kitOnChase: false, kitDailyCap: 3 })
  })

  it('refuses a cap outside 1–10', async () => {
    const { setKitSettingsAction } = await import('@/app/(app)/settings/actions')
    expect((await setKitSettingsAction({ onChase: true, dailyCap: 40 })).ok).toBe(false)
    expect((await setKitSettingsAction({ onChase: true, dailyCap: 0 })).ok).toBe(false)
  })
})
