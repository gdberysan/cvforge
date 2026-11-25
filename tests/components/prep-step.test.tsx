// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PrepStep, type PrepView } from '@/components/prep/PrepStep'
import { buildPrepContext } from '@/lib/prep/context'
import { sanitizePrep } from '@/lib/prep/sanitize'
import { cv, input } from '../prep/fixtures'
import { rawPrep } from '../prep/raw'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

const ctx = buildPrepContext(input(), Date.parse('2026-10-18T09:00:00Z'))
const content = sanitizePrep(rawPrep(), ctx)
const interview = {
  state: 'scheduled' as const,
  outcomeId: 'out_1',
  kind: 'interview' as const,
  month: 'Oct',
  day: 20,
  weekday: 'Tuesday',
  longDate: 'Tuesday, October 20',
  dayLabel: 'Tue Oct 20',
  time: '10:45 a.m.',
  daysFromToday: 2,
  source: 'agent' as const,
  inputDate: '2026-10-20',
  inputTime: '10:45',
}

const view = (over: Partial<PrepView> = {}): PrepView => ({
  applicationId: 'app_1',
  documentLanguage: 'en',
  preps: { en: { content, report: { flags: [], tells: [], passed: true }, stale: false } },
  interview,
  people: [
    {
      name: 'Marco Ibarra',
      role: 'eComm Strategy & Planning Sr. Manager',
      roleQuote: 'tu entrevista con Marco Ibarra, eComm Strategy & Planning Sr. Manager',
    },
  ],
  meetingUrl: 'https://teams.microsoft.com/l/meetup-join/x',
  cv: cv('Growth Lead'),
  cvIsSnapshot: true,
  flaggedBulletIds: [],
  requirements: ctx.requirements.map((r) => ({
    id: r.id,
    keyword: r.keyword,
    mandatory: r.mandatory,
  })),
  labels: { ev_funnel: 'Marketplace Coordinator at Shopco' },
  ...over,
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PrepStep', () => {
  it('briefs who, when and how to join, with the calendar tile', () => {
    render(<PrepStep view={view()} />)
    expect(screen.getByText('Interview in 2 days')).toBeTruthy()
    expect(screen.getByText('Marco Ibarra')).toBeTruthy()
    expect(screen.getByText('eComm Strategy & Planning Sr. Manager')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Join the meeting' }).getAttribute('href')).toBe(
      'https://teams.microsoft.com/l/meetup-join/x',
    )
    expect(screen.getByText('20')).toBeTruthy()
  })

  it('never offers a meeting link that is not https', () => {
    render(<PrepStep view={view({ meetingUrl: 'javascript:alert(1)' })} />)
    expect(screen.queryByRole('link', { name: 'Join the meeting' })).toBeNull()
  })

  it('shows readiness by question: story, honest gap, nothing', () => {
    render(<PrepStep view={view()} />)
    expect(
      screen.getByText(
        "Of 3 questions: 1 with a story of yours, 1 with an honest answer about what's missing, 1 with nothing yet.",
      ),
    ).toBeTruthy()
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'P' &&
          (el.textContent ?? '').startsWith('1 story has a part only you can tell.'),
      ),
    ).toBeTruthy()
  })

  it('draws a missing beat as a note with memory prompts, and no text box', () => {
    render(<PrepStep view={view()} />)
    // Stories open short; the open part is one tap away.
    fireEvent.click(
      screen.getByRole('button', { name: 'Parts only you can tell: see the whole story' }),
    )
    expect(screen.getByText('Task · tell it from memory')).toBeTruthy()
    expect(screen.getByText('¿Qué pedía tu jefe cuando empezaste?')).toBeTruthy()
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  })

  it('opens a story short, and flips to the full beats and back', () => {
    render(<PrepStep view={view()} />)
    expect(screen.getByText('Automated the funnel')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Full' }))
    expect(screen.getByText('I automated the conversion funnel.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Short version' }))
    expect(screen.getByText('Automated the funnel')).toBeTruthy()
  })

  it('groups a question nothing answers on its own', () => {
    render(<PrepStep view={view()} />)
    const group = screen.getByRole('region', { name: 'No story yet' })
    expect(within(group).getByText('Tell me about a time you worked across teams')).toBeTruthy()
  })

  it('shows why a flagged line should be checked', () => {
    const report = {
      flags: [
        {
          path: 'stories.s1.action',
          kind: 'distortion' as const,
          reason: 'the record never says nightly',
        },
      ],
      tells: [],
      passed: false,
    }
    render(<PrepStep view={view({ preps: { en: { content, report, stale: false } } })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Full' }))
    expect(
      screen.getByText('Check this line before you say it: the record never says nightly'),
    ).toBeTruthy()
  })

  it('shows the CV line exactly as sent, and an empty state with no CV', () => {
    render(<PrepStep view={view()} />)
    expect(screen.getByText('Automated the signup flow to a steady 45% conversion')).toBeTruthy()
    cleanup()
    render(<PrepStep view={view({ cv: null })} />)
    expect(
      screen.getByText(
        'There is no CV on file for this application, so there is nothing to defend line by line.',
      ),
    ).toBeTruthy()
  })

  it('says when the evidence moved since the prep', () => {
    render(
      <PrepStep
        view={view({
          preps: { en: { content, report: { flags: [], tells: [], passed: true }, stale: true } },
        })}
      />,
    )
    expect(
      screen.getByText(
        'Your experience changed since this prep was written. Prepare again to include it.',
      ),
    ).toBeTruthy()
  })

  it('offers to prepare, with its cost, and posts the chosen language', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<PrepStep view={view({ preps: {} })} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Spanish' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare me · ≈ US$0.55–1.20' }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/prep',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ applicationId: 'app_1', language: 'es-MX' }),
      }),
    )
  })

  it('shows a flag on a short line, a gap plan and the interviewer note too', () => {
    const report = {
      flags: [
        {
          path: 'stories.s1.short.2',
          kind: 'number' as const,
          reason: '70% is not in its records',
        },
        {
          path: 'gapAnswers.g1.plan',
          kind: 'number' as const,
          reason: '8x is not in any of his records',
        },
        {
          path: 'interviewerNote',
          kind: 'number' as const,
          reason: '45% is not in any of his records',
        },
      ],
      tells: [],
      passed: false,
    }
    const withNote = { ...content, interviewerNote: 'Lead with your 45% growth.' }
    render(<PrepStep view={view({ preps: { en: { content: withNote, report, stale: false } } })} />)
    expect(
      screen.getByText('Check this line before you say it: 8x is not in any of his records'),
    ).toBeTruthy()
    expect(
      screen.getByText('Check this line before you say it: 45% is not in any of his records'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Short version' }))
    expect(
      screen.getByText('Check this line before you say it: 70% is not in its records'),
    ).toBeTruthy()
  })

  it('shows the CV line a card is about even after the CV changed', () => {
    const edited = cv('Growth Lead')
    const role = edited.experience[0]
    if (role)
      role.bullets = [{ id: 'b9', text: 'Rewritten line', citedEvidenceIds: [], keywordsUsed: [] }]
    render(<PrepStep view={view({ cv: edited, cvIsSnapshot: false })} />)
    expect(screen.getByText('Automated the signup flow to a steady 45% conversion')).toBeTruthy()
  })

  it('says so when an older prep points at a line no longer in the CV', () => {
    const old = { ...content, cvDefense: content.cvDefense.map(({ line: _, ...d }) => d) }
    const edited = cv('Growth Lead')
    const role = edited.experience[0]
    if (role) role.bullets = []
    render(
      <PrepStep
        view={view({
          cv: edited,
          cvIsSnapshot: false,
          preps: {
            en: { content: old, report: { flags: [], tells: [], passed: true }, stale: false },
          },
        })}
      />,
    )
    expect(screen.getByText('This line is no longer in your CV.')).toBeTruthy()
  })

  it('says when no CV line needs defending', () => {
    const none = { ...content, cvDefense: [] }
    render(
      <PrepStep
        view={view({
          preps: {
            en: { content: none, report: { flags: [], tells: [], passed: true }, stale: false },
          },
        })}
      />,
    )
    expect(
      screen.getByText('No line of this CV looks likely to draw a follow-up question.'),
    ).toBeTruthy()
  })

  it('shows a know note as general knowledge, and nothing for an older prep without one', () => {
    const withKnow = {
      ...content,
      questions: content.questions.map((q, i) =>
        i === 0 ? { ...q, know: 'In 1P the retailer buys wholesale.' } : q,
      ),
    }
    render(
      <PrepStep
        view={view({
          preps: {
            en: { content: withKnow, report: { flags: [], tells: [], passed: true }, stale: false },
          },
        })}
      />,
    )
    expect(screen.getByText('In 1P the retailer buys wholesale.')).toBeTruthy()
    expect(screen.getAllByText('Know this')).toHaveLength(1)
    cleanup()
    const older = {
      ...content,
      questions: content.questions.map(({ know: _know, ...q }) => q),
    }
    render(
      <PrepStep
        view={view({
          preps: {
            en: { content: older, report: { flags: [], tells: [], passed: true }, stale: false },
          },
        })}
      />,
    )
    expect(screen.queryByText('Know this')).toBeNull()
  })

  it('points a gap he may have covered to Evidence', () => {
    render(<PrepStep view={view()} />)
    expect(screen.getByRole('link', { name: 'Go to My experience' }).getAttribute('href')).toBe(
      '/evidence',
    )
  })
})
