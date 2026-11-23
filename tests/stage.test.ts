import { describe, expect, it } from 'vitest'
import { latestOutcome, nextOutcomes, stageFacts, stagePosition } from '@/lib/stage'

describe('stagePosition', () => {
  it('walks the four stages with the status', () => {
    expect(stagePosition('triaged')).toEqual({ stage: 'analysed', end: null, milestone: null })
    expect(stagePosition('drafting')).toEqual({ stage: 'documents', end: null, milestone: null })
    expect(stagePosition('applied', 'applied')).toEqual({
      stage: 'sent',
      end: null,
      milestone: null,
    })
    expect(stagePosition('interviewing', 'screen')).toEqual({
      stage: 'reply',
      end: null,
      milestone: 'call',
    })
  })

  it('a reply on a sent application reaches "Reply"', () => {
    expect(stagePosition('applied', 'acknowledged')).toEqual({
      stage: 'reply',
      end: null,
      milestone: 'reply',
    })
  })

  it('an ending names the closing event, never a guessed rejection', () => {
    expect(stagePosition('offer', 'offer')).toEqual({
      stage: 'reply',
      end: 'offer',
      milestone: null,
    })
    expect(stagePosition('closed', 'rejected').end).toBe('rejected')
    expect(stagePosition('closed', 'ghosted').end).toBe('ghosted')
    expect(stagePosition('closed', 'withdrawn').end).toBe('withdrawn')
    expect(stagePosition('closed', null).end).toBe('closed')
    expect(stagePosition('archived')).toEqual({
      stage: 'analysed',
      end: 'archived',
      milestone: null,
    })
  })
})

describe('latestOutcome', () => {
  it('is the newest by date, not by array order', () => {
    expect(
      latestOutcome([
        { at: '2026-10-10T00:00:00Z', type: 'rejected' },
        { at: '2026-10-01T00:00:00Z', type: 'screen' },
      ]),
    ).toBe('rejected')
    expect(latestOutcome([])).toBeNull()
  })
})

describe('nextOutcomes', () => {
  it('after "no answer" a late reply can still be logged; after a no, nothing', () => {
    expect(nextOutcomes('closed', { latest: 'ghosted' })).toEqual([
      'acknowledged',
      'screen',
      'interview',
      'rejected',
    ])
    expect(nextOutcomes('closed', { latest: 'rejected' })).toEqual([])
    expect(nextOutcomes('closed', { latest: 'withdrawn' })).toEqual([])
  })

  it('is one move before sending, an even four after', () => {
    expect(nextOutcomes('drafting')).toEqual(['applied'])
    expect(nextOutcomes('applied')).toHaveLength(4)
    expect(nextOutcomes('interviewing')).toHaveLength(4)
    expect(nextOutcomes('closed')).toEqual([])
  })

  it('offers "No answer" only once the silence is stale', () => {
    expect(nextOutcomes('applied')).not.toContain('ghosted')
    expect(nextOutcomes('applied', { stale: true })).toEqual([
      'acknowledged',
      'screen',
      'rejected',
      'ghosted',
    ])
  })
})

describe('stagePosition from what the log proves', () => {
  it('shows an interview before a rejection, and no send that never happened', () => {
    const facts = stageFacts([{ type: 'applied' }, { type: 'interview' }, { type: 'rejected' }])
    expect(stagePosition('closed', 'rejected', facts)).toEqual({
      stage: 'reply',
      end: 'rejected',
      milestone: 'interview',
    })
    expect(stagePosition('closed', 'withdrawn', stageFacts([]))).toEqual({
      stage: 'analysed',
      end: 'withdrawn',
      milestone: null,
    })
  })
  it('keeps the CV step of a discarded application that has one', () => {
    expect(stagePosition('archived', null, { hasCv: true })).toEqual({
      stage: 'documents',
      end: 'archived',
      milestone: null,
    })
  })
  it('names the furthest answer, read from the log and never from the status', () => {
    const screened = stageFacts([{ type: 'applied' }, { type: 'acknowledged' }, { type: 'screen' }])
    expect(stagePosition('interviewing', 'screen', screened).milestone).toBe('call')
    // A screen makes a row "interviewing"; that alone is no interview.
    expect(stagePosition('interviewing', null).milestone).toBeNull()
    const three = stageFacts([{ type: 'applied' }, { type: 'interview' }, { type: 'offer' }])
    expect(stagePosition('offer', 'offer', three).milestone).toBe('interview')
    // A no with no answer before it has nothing to name.
    const flat = stageFacts([{ type: 'applied' }, { type: 'rejected' }])
    expect(stagePosition('closed', 'rejected', flat)).toEqual({
      stage: 'sent',
      end: 'rejected',
      milestone: null,
    })
  })
})
