import { beforeEach, describe, expect, it, vi } from 'vitest'
import { must } from '../support/must'

const callStructured = vi.fn()
vi.mock('@/lib/ai/client', () => ({ callStructured }))

const { runPrep } = await import('@/lib/prep/pipeline')
const { buildPrepContext } = await import('@/lib/prep/context')
const { input } = await import('./fixtures')
const { rawPrep } = await import('./raw')

const ctx = () => buildPrepContext(input(), Date.parse('2026-10-18T09:00:00Z'))
const allSupported = (opts: { user: string }) => ({
  verdicts: [...opts.user.matchAll(/<bullet id="([^"]+)"/g)].map((m) => ({
    bulletId: m[1],
    supported: true,
    reason: '',
  })),
})
const stages = () => callStructured.mock.calls.map((c) => c[0].stage)

describe('runPrep', () => {
  beforeEach(() => {
    callStructured.mockReset()
  })

  it('checks a clean prep once and keeps it', async () => {
    callStructured.mockImplementation(async (o) =>
      o.stage === 'verify-distortion' ? allSupported(o) : rawPrep(),
    )
    const { content, report } = await runPrep(ctx())
    expect(report.passed).toBe(true)
    expect(content.stories).toHaveLength(1)
    expect(stages()).toEqual(['interview-prep', 'verify-distortion'])
  })

  it('keeps a refine that fixes the flag without losing anything', async () => {
    const bad = rawPrep()
    must(bad.stories[0]).result.text = 'Conversion held at 70%.'
    callStructured.mockImplementation(async (o) =>
      o.stage === 'verify-distortion'
        ? allSupported(o)
        : o.stage === 'interview-prep'
          ? bad
          : rawPrep(),
    )
    const { content, report } = await runPrep(ctx())
    expect(stages()).toContain('interview-prep-refine')
    expect(content.stories[0]?.result.text).toBe('The conversion rate held at 45%.')
    expect(report.passed).toBe(true)
  })

  it('discards a refine that deletes a story', async () => {
    const bad = rawPrep()
    must(bad.stories[0]).result.text = 'Conversion held at 70%.'
    callStructured.mockImplementation(async (o) =>
      o.stage === 'verify-distortion'
        ? allSupported(o)
        : o.stage === 'interview-prep'
          ? bad
          : { ...rawPrep(), stories: [] },
    )
    const { content, report } = await runPrep(ctx())
    expect(content.stories).toHaveLength(1)
    expect(report.flags.map((f) => f.path)).toContain('stories.s1.result')
    expect(report.passed).toBe(false)
  })

  it('returns the checked first draft when the refine throws', async () => {
    const bad = rawPrep()
    must(bad.stories[0]).result.text = 'Conversion held at 70%.'
    callStructured.mockImplementation(async (o) => {
      if (o.stage === 'verify-distortion') return allSupported(o)
      if (o.stage === 'interview-prep') return bad
      throw new Error('overloaded')
    })
    const { report } = await runPrep(ctx())
    expect(report.flags.map((f) => f.path)).toContain('stories.s1.result')
  })

  it('reports what the model checker doubts, by path', async () => {
    callStructured.mockImplementation(async (o) =>
      o.stage === 'verify-distortion'
        ? {
            verdicts: [...o.user.matchAll(/<bullet id="([^"]+)"/g)].map((m) => ({
              bulletId: m[1],
              supported: !m[1].startsWith('stories.s1.situation'),
              reason: m[1].startsWith('stories.s1.situation')
                ? 'the record never says sellers stalled'
                : '',
            })),
          }
        : rawPrep(),
    )
    const { report } = await runPrep(ctx())
    expect(report.flags).toContainEqual(
      expect.objectContaining({
        path: 'stories.s1.situation',
        kind: 'distortion',
        reason: expect.stringContaining('the record never says sellers stalled'),
      }),
    )
  })

  it('judges each sentence on its own, so an invented one cannot hide behind a true one', async () => {
    const two = rawPrep()
    must(two.stories[0], 'story').result.text =
      'The conversion rate held at 45%. The whole team finally trusted the numbers.'
    callStructured.mockImplementation(async (o) => {
      if (o.stage !== 'verify-distortion') return two
      return {
        verdicts: [...o.user.matchAll(/<bullet id="([^"]+)">\s*<text>([^<]*)<\/text>/g)].map(
          (m) => ({
            bulletId: m[1],
            supported: !m[2].includes('trusted'),
            reason: m[2].includes('trusted') ? 'no record says the team trusted anything' : '',
          }),
        ),
      }
    })
    const { report } = await runPrep(ctx())
    expect(report.flags).toContainEqual(
      expect.objectContaining({
        path: 'stories.s1.result',
        kind: 'distortion',
        reason: expect.stringContaining('The whole team finally trusted the numbers.'),
      }),
    )
  })

  it('never keeps a refine with more doubted lines, however many style notes it clears (#5)', async () => {
    const draft = rawPrep()
    must(draft.stories[0], 'story').action.text =
      'I leveraged automation seamlessly to automate the funnel.'
    must(draft.gapAnswers[0], 'gap').admit = "I haven't leveraged SQL seamlessly in a job."
    must(draft.gapAnswers[0], 'gap').plan =
      'I would seamlessly leverage a SQL course in the first month.'
    const refined = rawPrep()
    must(refined.stories[0], 'story').action.text =
      'I automated the conversion funnel for the team.'
    let checks = 0
    callStructured.mockImplementation(async (o) => {
      if (o.stage === 'interview-prep') return draft
      if (o.stage === 'interview-prep-refine') return refined
      checks++
      // The draft: one doubted sentence. The refine: two.
      const doubted =
        checks === 1
          ? ['stories.s1.situation#0']
          : ['stories.s1.situation#0', 'stories.s1.action#0']
      return {
        verdicts: [...o.user.matchAll(/<bullet id="([^"]+)"/g)].map((m) => ({
          bulletId: m[1],
          supported: !doubted.includes(m[1]),
          reason: doubted.includes(m[1]) ? 'not in the record' : '',
        })),
      }
    })
    const { content, report } = await runPrep(ctx())
    expect(content.stories[0]?.action.text).toBe(
      'I leveraged automation seamlessly to automate the funnel.',
    )
    expect(report.flags).toHaveLength(1)
  })
})
