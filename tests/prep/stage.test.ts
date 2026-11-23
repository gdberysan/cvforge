import { beforeEach, describe, expect, it, vi } from 'vitest'

const callStructured = vi.fn()
vi.mock('@/lib/ai/client', () => ({ callStructured }))

const { generatePrep } = await import('@/lib/ai/stages/interview-prep')
const { buildPrepContext } = await import('@/lib/prep/context')
const { input } = await import('./fixtures')
const { rawPrep } = await import('./raw')

const ctx = () => buildPrepContext(input(), Date.parse('2026-10-18T09:00:00Z'))

describe('generatePrep', () => {
  beforeEach(() => {
    callStructured.mockReset().mockResolvedValue(rawPrep())
  })

  it('names its stage, gives the model the sent CV and his answers, and sanitizes', async () => {
    const out = await generatePrep(ctx())
    const call = callStructured.mock.calls[0]?.[0]
    expect(call.stage).toBe('interview-prep')
    expect(call.maxTokens).toBe(21000)
    expect(call.effort).toBe('medium')
    expect(call.user).toContain('<sent_cv')
    expect(call.user).toContain('<his_answers>')
    expect(out.coverage).toHaveLength(3)
  })

  it('is a refine, with its own stage and the problems to fix, when given problems', async () => {
    await generatePrep(ctx(), {
      previous: { ...rawPrep(), coverage: [] },
      problems: ['stories.s1.result: 70% is not recorded'],
    })
    const call = callStructured.mock.calls[0]?.[0]
    expect(call.stage).toBe('interview-prep-refine')
    expect(call.user).toContain('70% is not recorded')
    expect(call.user).toContain('<previous_prep>')
  })

  it('tells the model to write speech in the output language', async () => {
    await generatePrep(
      buildPrepContext(input({ language: 'es-MX' }), Date.parse('2026-10-18T09:00:00Z')),
    )
    const system = callStructured.mock.calls[0]?.[0].system
      .map((b: { text: string }) => b.text)
      .join('\n')
    expect(system).toMatch(/out loud/i)
    expect(system).toMatch(/Mexican Spanish/)
    // A plan is what he would do next, never a skill he is quietly claiming.
    expect(system).toMatch(/"plan" says only what he would do next/)
  })
})
