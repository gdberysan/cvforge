// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GapDelta } from '@/components/application/GapDelta'
import type { GapDelta as Delta } from '@/lib/gaps/delta'

afterEach(cleanup)

const delta = (over: Partial<Delta> = {}): Delta => ({
  moves: [],
  verdictBefore: 'stretch',
  verdictAfter: 'stretch',
  verdictChanged: false,
  ...over,
})

describe('GapDelta', () => {
  it('names each requirement that moved, with where it came from and went', () => {
    render(
      <GapDelta
        delta={delta({
          moves: [
            { requirementId: 'req_1', keyword: 'Salesforce', before: 'none', after: 'strong' },
          ],
        })}
      />,
    )
    expect(screen.getByText('Salesforce')).toBeTruthy()
  })

  it('says plainly that nothing moved rather than dressing it up', () => {
    render(<GapDelta delta={delta()} />)
    expect(screen.getByText(/nothing moved/i)).toBeTruthy()
  })

  it('reports a partial move as partial, not as coverage', () => {
    render(
      <GapDelta
        delta={delta({
          moves: [{ requirementId: 'req_1', keyword: 'Airflow', before: 'none', after: 'partial' }],
        })}
      />,
    )
    expect(screen.getByText(/partial/i)).toBeTruthy()
  })

  it('shows a requirement that lost ground instead of hiding it', () => {
    render(
      <GapDelta
        delta={delta({
          moves: [
            { requirementId: 'req_1', keyword: 'Salesforce', before: 'strong', after: 'partial' },
          ],
        })}
      />,
    )
    expect(screen.getByText('Salesforce')).toBeTruthy()
    expect(screen.queryByText(/nothing moved/i)).toBeNull()
  })
})
