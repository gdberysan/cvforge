// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GroundingFlags } from '@/components/studio/GroundingFlags'
import type { GroundingReport } from '@/lib/schemas'

afterEach(cleanup)

const report: GroundingReport = {
  uncitedBullets: [],
  invalidCitations: [],
  unverifiedNumbers: [],
  unknownEntities: [],
  distortions: [],
  claimedGaps: [
    {
      bulletId: 'b1',
      keyword: 'kubernetes',
      requirementText: '5+ years administering Kubernetes clusters',
    },
  ],
  unsupportedClaims: [],
  passed: false,
}

describe('GroundingFlags', () => {
  it('shows the full requirement text, not just the bare keyword', () => {
    render(<GroundingFlags report={report} />)
    expect(screen.getByText(/5\+ years administering Kubernetes clusters/)).toBeTruthy()
  })

  it('marking a flag reviewed strikes it through and updates the count, without removing it', () => {
    render(<GroundingFlags report={report} />)
    const button = screen.getByRole('button', { name: 'Reviewed' })
    fireEvent.click(button)
    expect(screen.getByText(/1\/1 reviewed/)).toBeTruthy()
    expect(screen.getByText(/kubernetes/)).toBeTruthy()
  })

  it('a clean report is one line with the check icon', () => {
    render(<GroundingFlags report={{ ...report, claimedGaps: [], passed: true }} />)
    const line = screen.getByText(/Every line checked against your experience/)
    expect(line.closest('.verify-ok')?.querySelector('svg')).toBeTruthy()
  })

  it('each flag is a row with a pressed-state "Reviewed" toggle; every flag stays', () => {
    const two: GroundingReport = {
      ...report,
      unverifiedNumbers: [{ bulletId: 'b2', token: '40%' }],
    }
    render(
      <GroundingFlags report={two} textOf={{ b1: 'Ran the cluster', b2: 'Grew revenue 40%' }} />,
    )
    const toggles = screen.getAllByRole('button', { name: 'Reviewed' })
    expect(toggles).toHaveLength(2)
    fireEvent.click(toggles[0])
    expect(toggles[0].getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/1\/2 reviewed/)).toBeTruthy()
    expect(document.querySelectorAll('.verify-row')).toHaveLength(2)
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})
