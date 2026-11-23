// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { CVContent, EvidenceItem, GroundingReport } from '@/lib/schemas'

vi.mock('@/components/studio/PdfPager', () => ({
  PdfPager: ({ seek }: { seek?: { text: string } | null }) => (
    <p data-testid="pager">{seek?.text ?? ''}</p>
  ),
}))
vi.mock('@/components/studio/VariantPicker', () => ({ VariantPicker: () => null }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

const { Studio } = await import('@/components/studio/Studio')

let narrow = true
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
  window.matchMedia = ((q: string) => ({
    matches: narrow && q === '(max-width: 899px)',
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  narrow = true
})

const ev = (id: string, text: string): EvidenceItem => ({
  id,
  kind: 'achievement',
  sourceRef: { type: 'experience', id: 'exp_1' },
  text,
  metrics: [],
  tags: [],
  period: { start: '2020-01' },
  strength: 'core',
  origin: 'manual',
})
const cv: CVContent = {
  header: { fullName: 'Dana', title: 'Growth', contactLines: [] },
  summary: '',
  summaryCitedEvidenceIds: [],
  experience: [
    {
      experienceId: 'exp_1',
      title: 'Lead',
      company: 'Acme',
      startDate: '2020-01',
      bullets: [
        {
          id: 'b1',
          text: 'Grew revenue 40% in a year',
          citedEvidenceIds: ['ev_1'],
          keywordsUsed: [],
        },
        { id: 'b2', text: 'Built the BI tool', citedEvidenceIds: ['ev_2'], keywordsUsed: [] },
      ],
    },
  ],
  projects: [],
  education: [],
  skills: [],
  extras: [],
}
const clean: GroundingReport = {
  uncitedBullets: [],
  invalidCitations: [],
  unverifiedNumbers: [],
  unknownEntities: [],
  distortions: [],
  claimedGaps: [],
  unsupportedClaims: [],
  passed: true,
}
const props = {
  applicationId: 'app_1',
  company: 'Acme',
  documentLanguage: 'en' as const,
  evidence: [ev('ev_1', 'Revenue +40%'), ev('ev_2', 'BI tool')],
  sourceLabels: { ev_1: 'Acme', ev_2: 'Acme' },
  initialCv: cv,
  initialReport: clean,
  variants: [],
}

describe('Studio — evidence under 900px', () => {
  it('is a button with its count that opens a sheet, not a column', () => {
    render(<Studio {...props} />)
    expect(document.querySelector('aside.evidence-ref')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Experience it uses \(2\)/ }))
    expect(document.querySelector('dialog[open]')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /show in the pdf/i })).toHaveLength(2)
  })

  it('"show in the PDF" closes the sheet and turns the pager to that line', () => {
    render(<Studio {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Experience it uses \(2\)/ }))
    fireEvent.click(screen.getAllByRole('button', { name: /show in the pdf/i })[0])
    expect(document.querySelector('dialog[open]')).toBeNull()
    expect(document.documentElement.classList.contains('sheet-open')).toBe(false)
    expect(screen.getByTestId('pager').textContent).toBe('Grew revenue 40% in a year')
  })

  it('above 900px the evidence stays a column', () => {
    narrow = false
    render(<Studio {...props} />)
    expect(document.querySelector('aside.evidence-ref')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Experience it uses \(2\)/ })).toBeNull()
  })
})

describe('Studio — every state has one primary', () => {
  it('no CV yet: one sentence and Generate as the only primary', () => {
    render(<Studio {...props} initialCv={null} initialReport={null} />)
    expect(screen.getByText(/using only your experience/)).toBeTruthy()
    expect([...document.querySelectorAll('.btn-primary')].map((b) => b.textContent)).toEqual([
      'Write my CV',
    ])
  })

  it('with a CV, Download PDF is the only primary', () => {
    render(<Studio {...props} />)
    expect([...document.querySelectorAll('.btn-primary')].map((b) => b.textContent)).toEqual([
      'Download PDF',
    ])
  })
})
