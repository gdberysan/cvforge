// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StrengthCard, say } from '@/components/evidence/StrengthCard'
import { makeTranslate } from '@/lib/i18n'
import type { ProfileStrength, Suggestion } from '@/lib/strength'

afterEach(cleanup)

const strength: ProfileStrength = {
  score: 50,
  suggestions: [],
  categories: [
    { id: 'summary', points: 15, earned: true, got: 15 },
    { id: 'experience', points: 15, earned: true, got: 15 },
    { id: 'evidencePerRole', points: 20, earned: false, got: 0 },
    { id: 'metrics', points: 25, earned: false, got: 0 },
    { id: 'tags', points: 10, earned: true, got: 10 },
    { id: 'skills', points: 10, earned: true, got: 10 },
    { id: 'targetTitles', points: 5, earned: false, got: 0 },
  ],
}

describe('StrengthCard', () => {
  it('shows all seven categories with a point value, earned ones plain and unearned ones prefixed with +', () => {
    render(<StrengthCard strength={strength} t={makeTranslate('en')} />)
    expect(screen.getByText('Summary')).toBeTruthy()
    expect(screen.getByText('Every role has something written')).toBeTruthy()
    expect(screen.getByText('+20')).toBeTruthy()
    expect(screen.getByText('+5')).toBeTruthy()
    expect(screen.getAllByText('15')).toHaveLength(2)
  })

  it('opens with one card: the score ring and the single top fix', () => {
    const t = makeTranslate('en')
    const s1: Suggestion = {
      id: 'role-only-stubs',
      severity: 'high',
      targetId: 'exp_6',
      params: { company: 'Bazario' },
    }
    const s2: Suggestion = { id: 'target-titles-empty', severity: 'low' }
    render(<StrengthCard strength={{ ...strength, suggestions: [s1, s2] }} t={t} />)
    const card = screen.getByTestId('strength-card')
    expect(card.textContent).toContain('50')
    expect(card.querySelector('svg.strength-ring')).toBeTruthy()
    expect(within(card).getByText(say(t, s1), { exact: false })).toBeTruthy()
    // The rest wait folded under "How it's scored", not beside the one fix.
    expect(card.querySelector('.strength-card-fix')?.textContent).toBe(say(t, s1))
    expect(card.querySelector('details:not([open])')?.textContent).toContain(say(t, s2))
  })

  it('folds how it is scored, and the other fixes, under one summary', () => {
    const t = makeTranslate('en')
    const s1: Suggestion = { id: 'summary-empty', severity: 'high' }
    const s2: Suggestion = { id: 'target-titles-empty', severity: 'low' }
    render(<StrengthCard strength={{ ...strength, suggestions: [s1, s2] }} t={t} />)
    const how = document.querySelector('details.strength-how')
    expect(how?.querySelector('summary')?.textContent).toBe("How it's scored")
    expect(how?.querySelector('.strength-breakdown')).toBeTruthy()
    expect(how?.textContent).toContain(say(t, s2))
  })

  it('a part-earned slice shows what it earned out of its points', () => {
    const part = {
      ...strength,
      categories: strength.categories.map((c) => (c.id === 'metrics' ? { ...c, got: 20 } : c)),
    }
    render(<StrengthCard strength={part} t={makeTranslate('en')} />)
    expect(screen.getByText('20/25')).toBeTruthy()
  })
})
