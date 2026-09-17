// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GapEntry } from '@/components/application/GapEntry'
import { makeTranslate } from '@/lib/i18n'
import type { Coverage, EvidenceMapping, Requirement } from '@/lib/schemas'

afterEach(cleanup)

const t = makeTranslate('en')
const coverage = { verdict: 'stretch' } as Coverage

const req = (id: string, over: Partial<Requirement> = {}): Requirement => ({
  id,
  text: 'Some requirement',
  keyword: id.toUpperCase(),
  variants: [],
  kind: 'hard',
  mandatory: true,
  weight: 2,
  ...over,
})

const map = (id: string, strength: EvidenceMapping['strength']): EvidenceMapping => ({
  requirementId: id,
  evidenceIds: [],
  strength,
  rationale: '',
})

function renderEntry(requirements: Requirement[], mappings: EvidenceMapping[], gapdelta?: string) {
  return render(
    <GapEntry
      t={t}
      applicationId="app_1"
      coverage={coverage}
      requirements={requirements}
      mappings={mappings}
      gapdelta={gapdelta}
    />,
  )
}

describe('GapEntry', () => {
  it('counts the unmet mandatory requirements when there are some', () => {
    renderEntry([req('req_1'), req('req_2')], [map('req_1', 'none'), map('req_2', 'none')])
    expect(screen.getByText(/2 required things/i)).toBeTruthy()
    expect(screen.getByRole('link')).toBeTruthy()
  })

  it('never says "0" when every gap is partial or optional', () => {
    // The count is of unmet MANDATORY requirements, so a posting whose misses
    // are all partial or optional was announcing "0 required things have
    // nothing behind them" above a link to five real gaps.
    renderEntry(
      [req('req_1'), req('req_2', { mandatory: false })],
      [map('req_1', 'partial'), map('req_2', 'none')],
    )

    expect(screen.queryByText(/^0 /)).toBeNull()
    expect(screen.getByRole('link')).toBeTruthy()
    expect(screen.getByText(/2 requirements/i)).toBeTruthy()
  })

  it('offers nothing at all when the posting is fully covered', () => {
    renderEntry([req('req_1')], [map('req_1', 'strong')])
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('renders no delta when none came back', () => {
    renderEntry([req('req_1')], [map('req_1', 'none')])
    expect(screen.queryByText(/what changed/i)).toBeNull()
  })

  it('renders the delta when a snapshot came back', () => {
    const before = encodeURIComponent(
      JSON.stringify({ verdict: 'skip', strengths: { req_1: 'none' } }),
    )
    renderEntry([req('req_1')], [map('req_1', 'strong')], before)
    expect(screen.getByText(/what changed/i)).toBeTruthy()
  })

  it('ignores a hand-edited snapshot rather than crashing the page', () => {
    renderEntry([req('req_1')], [map('req_1', 'none')], 'not%20json%20at%20all')
    expect(screen.queryByText(/what changed/i)).toBeNull()
  })
})
