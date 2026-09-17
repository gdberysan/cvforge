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
  passed: false,
}

describe('GroundingFlags', () => {
  it('shows the full requirement text, not just the bare keyword', () => {
    render(<GroundingFlags report={report} />)
    expect(screen.getByText(/5\+ years administering Kubernetes clusters/)).toBeTruthy()
  })

  it('marking a flag reviewed strikes it through and updates the count, without removing it', () => {
    render(<GroundingFlags report={report} />)
    const button = screen.getByRole('button', { name: /mark reviewed/i })
    fireEvent.click(button)
    expect(screen.getByText(/1\/1 reviewed/)).toBeTruthy()
    expect(screen.getByText(/kubernetes/)).toBeTruthy()
  })
})
