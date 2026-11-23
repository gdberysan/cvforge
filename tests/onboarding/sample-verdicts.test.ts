import { describe, expect, it } from 'vitest'
import seed from '@/demo/seed.json'
import { SAMPLE_VERDICTS } from '@/lib/onboarding/sample-verdicts'

describe('the first-run sample verdicts', () => {
  it('are exactly the demo seed’s analyses, so the example never claims what the tool did not say', () => {
    for (const s of SAMPLE_VERDICTS) {
      const app = seed.applications.find((a) => a.id === s.id)
      expect(app, s.id).toBeDefined()
      for (const k of ['company', 'jobTitle', 'requirements', 'mappings', 'coverage'] as const) {
        expect(s[k], `${s.id}.${k}`).toEqual(app?.[k])
      }
    }
  })

  it('show the three answers, the honest gap first', () => {
    expect(SAMPLE_VERDICTS.map((s) => s.coverage.verdict)).toEqual(['worth-it', 'strong', 'skip'])
  })
})
