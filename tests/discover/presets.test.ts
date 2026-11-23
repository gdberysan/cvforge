import { describe, expect, it } from 'vitest'
import { freshnessFrom, postingAgeDays, searchPresets } from '@/lib/discover/presets'

describe('searchPresets', () => {
  const exp = (title: string) => ({ title })

  it('crosses distinct recent titles with locations from the markets', () => {
    expect(
      searchPresets([exp('Marketing Engineer'), exp('Growth Analyst')], ['mx', 'us-remote']),
    ).toEqual([
      { q: 'Marketing Engineer', location: 'Mexico' },
      { q: 'Marketing Engineer', location: 'Remote' },
      { q: 'Growth Analyst', location: 'Mexico' },
      { q: 'Growth Analyst', location: 'Remote' },
    ])
  })

  it('dedupes repeated titles and remote markets', () => {
    expect(
      searchPresets(
        [exp('Engineer'), exp('Engineer'), exp('Engineer')],
        ['us-remote', 'eu-remote'],
      ),
    ).toEqual([{ q: 'Engineer', location: 'Remote' }])
  })

  it('caps the chips at six', () => {
    const many = ['A', 'B', 'C', 'D'].map(exp)
    expect(searchPresets(many, ['mx', 'us-remote'])).toHaveLength(6)
  })

  it('returns nothing without experience', () => {
    expect(searchPresets([], ['mx'])).toEqual([])
    expect(searchPresets([], [])).toEqual([])
  })

  it('falls back to Remote when no markets are configured', () => {
    expect(searchPresets([exp('Analyst')], [])).toEqual([{ q: 'Analyst', location: 'Remote' }])
  })
})

describe('postingAgeDays', () => {
  const now = '2026-08-26T12:00:00Z'
  it.each([
    ['2026-08-26', 0], // posted today
    ['2026-08-25', 1], // yesterday
    ['2026-08-20', 6],
    [null, null], // LinkedIn card carried no datetime
    ['', null],
  ])('%s → %s', (date, expected) => {
    expect(postingAgeDays(date, now)).toBe(expected)
  })

  it('never returns a negative age (clock skew / future datetime)', () => {
    expect(postingAgeDays('2026-08-27', now)).toBe(0)
  })
})

describe('freshnessFrom', () => {
  it.each([
    [undefined, 30], // first visit: default protects triage spend from stale postings
    ['', 30], // ?days= with no value — Number('') is 0, must not slip through as "any time"
    ['30', 30],
    ['7', 7],
    ['0', 0], // an explicit "any time" is respected
    ['999', 30], // not an offered option
    ['garbage', 30],
  ])('%s → %i', (raw, expected) => {
    expect(freshnessFrom(raw)).toBe(expected)
  })
})
