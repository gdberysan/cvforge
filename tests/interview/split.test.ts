import { describe, expect, it } from 'vitest'
import { splitEvidenceForInterview } from '@/lib/interview/split'
import type { EvidenceItem, EvidenceOrigin } from '@/lib/schemas'

function ev(id: string, roleId: string, origin: EvidenceOrigin): EvidenceItem {
  return {
    id,
    kind: 'achievement',
    sourceRef: { type: 'experience', id: roleId },
    text: `Evidence ${id}`,
    metrics: [],
    tags: [],
    period: { start: '2016-01' },
    strength: 'core',
    origin,
  }
}

describe('splitEvidenceForInterview', () => {
  it('treats only import-origin records as stubs', () => {
    const { stubs } = splitEvidenceForInterview(
      [ev('ev_1', 'exp_1', 'import'), ev('ev_2', 'exp_1', 'interview')],
      'exp_1',
    )
    expect(stubs.map((s) => s.id)).toEqual(['ev_1'])
  })

  it('keeps interviewed and manual records as existing evidence, never stubs', () => {
    // Re-running an interview must not treat real records as scaffolding to
    // be replaced — that is how hand-edited evidence gets deleted.
    const { stubs, existing } = splitEvidenceForInterview(
      [ev('ev_1', 'exp_1', 'interview'), ev('ev_2', 'exp_1', 'manual')],
      'exp_1',
    )
    expect(stubs).toEqual([])
    expect(existing.map((e) => e.id)).toEqual(['ev_1', 'ev_2'])
  })

  it('ignores evidence belonging to other roles', () => {
    const { stubs, existing } = splitEvidenceForInterview(
      [ev('ev_1', 'exp_OTHER', 'import'), ev('ev_2', 'exp_OTHER', 'manual')],
      'exp_1',
    )
    expect(stubs).toEqual([])
    expect(existing).toEqual([])
  })
})
