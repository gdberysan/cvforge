import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpendRecord } from '@/lib/ai/spend-hook'

const record: SpendRecord = {
  stage: 'parse-cv-profile',
  model: 'claude-opus-5',
  inputTokens: 10,
  outputTokens: 20,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
}

describe('the spend recorder across module registries', () => {
  beforeEach(() => {
    vi.resetModules()
    delete (globalThis as { __cvforgeSpendRecorder?: unknown }).__cvforgeSpendRecorder
  })

  it('records through the registry that registered it', async () => {
    const { setSpendRecorder, reportSpend } = await import('@/lib/ai/spend-hook')
    const seen: SpendRecord[] = []
    setSpendRecorder((r) => seen.push(r))

    reportSpend(record)

    expect(seen).toEqual([record])
  })

  it('still records from a SECOND module instance of the hook', async () => {
    // Next builds route handlers into a different bundle than pages, and each
    // gets its own module registry: `instrumentation.ts` registering the
    // recorder was proven to leave `/api/ai/parse-cv` with a null one, so every
    // CV import — two Opus calls at high effort — recorded no spend at all
    // while the Anthropic console bill climbed. Module-level `let` cannot span
    // that boundary; globalThis can, which is what the SDK client already does.
    const registrar = await import('@/lib/ai/spend-hook')
    const seen: SpendRecord[] = []
    registrar.setSpendRecorder((r) => seen.push(r))

    vi.resetModules()
    const routeBundle = await import('@/lib/ai/spend-hook')
    expect(routeBundle).not.toBe(registrar)
    routeBundle.reportSpend(record)

    expect(seen).toEqual([record])
  })

  it('swallows a recorder failure rather than losing a paid response', async () => {
    const { setSpendRecorder, reportSpend } = await import('@/lib/ai/spend-hook')
    setSpendRecorder(() => {
      throw new Error('disk full')
    })

    expect(() => reportSpend(record)).not.toThrow()
  })

  it('clears cleanly, so a null recorder is a no-op and not a crash', async () => {
    const { setSpendRecorder, reportSpend } = await import('@/lib/ai/spend-hook')
    setSpendRecorder(null)

    expect(() => reportSpend(record)).not.toThrow()
  })
})
