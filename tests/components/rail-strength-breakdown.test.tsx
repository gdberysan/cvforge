// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Rail } from '@/components/evidence/Rail'
import { makeTranslate } from '@/lib/i18n'
import type { ProfileStrength } from '@/lib/strength'

afterEach(cleanup)

const strength: ProfileStrength = {
  score: 50,
  suggestions: [],
  categories: [
    { id: 'summary', points: 15, earned: true },
    { id: 'experience', points: 15, earned: true },
    { id: 'evidencePerRole', points: 20, earned: false },
    { id: 'metrics', points: 25, earned: false },
    { id: 'tags', points: 10, earned: true },
    { id: 'skills', points: 10, earned: true },
    { id: 'targetTitles', points: 5, earned: false },
  ],
}

describe('Rail — strength breakdown', () => {
  it('shows all seven categories with a point value, earned ones plain and unearned ones prefixed with +', () => {
    render(<Rail strength={strength} roles={[]} t={makeTranslate('en')} />)
    expect(screen.getByText('Summary')).toBeTruthy()
    expect(screen.getByText('Every role has evidence')).toBeTruthy()
    expect(screen.getByText('+20')).toBeTruthy()
    expect(screen.getByText('+5')).toBeTruthy()
    expect(screen.getAllByText('15')).toHaveLength(2)
  })
})
