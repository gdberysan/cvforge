// tests/components/decide.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  type ChipRequirement,
  groupByTone,
  RequirementChips,
} from '@/components/application/RequirementChips'
import { VerdictPanel } from '@/components/application/VerdictPanel'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'
import type { Coverage, Requirement } from '@/lib/schemas'

afterEach(cleanup)
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})
const wrap = (ui: ReactNode) => render(<LocaleProvider locale="es">{ui}</LocaleProvider>)

const item = (o: Partial<ChipRequirement>): ChipRequirement => ({
  id: 'r',
  keyword: 'SQL',
  kind: 'hard',
  mandatory: true,
  strength: 'strong',
  unjudged: false,
  rationale: 'Lo usaste a diario.',
  text: 'SQL avanzado',
  sources: [],
  ...o,
})

describe('RequirementChips', () => {
  it('groups mandatory before preferred', () => {
    wrap(
      <RequirementChips
        items={[
          item({ id: '1', keyword: 'A', mandatory: false }),
          item({ id: '2', keyword: 'B' }),
          item({ id: '3', keyword: 'C' }),
        ]}
      />,
    )
    const groups = screen.getAllByRole('list')
    expect(
      within(groups[0])
        .getAllByRole('button')
        .map((b) => b.textContent?.split(',')[0]),
    ).toEqual(['B', 'C'])
    expect(
      within(groups[1])
        .getAllByRole('button')
        .map((b) => b.textContent?.split(',')[0]),
    ).toEqual(['A'])
  })
  it('splits a section into Te falta, Parcial, Cubres with counts, empty groups hidden', () => {
    wrap(
      <RequirementChips
        items={[
          item({ id: '1', keyword: 'GA4', strength: 'strong' }),
          item({ id: '2', keyword: 'Meta Ads', strength: 'none' }),
          item({ id: '3', keyword: 'CRO', strength: 'strong' }),
          item({ id: '4', keyword: 'Klaviyo', strength: 'none', mandatory: false }),
        ]}
      />,
    )
    const labels = [...document.querySelectorAll('.req-tone-label')].map((h) => h.textContent)
    expect(labels).toEqual(['Te faltan · 1', 'Los cumples · 2', 'Te faltan · 1'])
    expect(screen.queryByText(/A medias/)).toBeNull()
  })
  it('opens the source sheet from a grouped chip', () => {
    wrap(<RequirementChips items={[item({ strength: 'partial', rationale: 'A medias.' })]} />)
    fireEvent.click(screen.getByRole('button', { name: /SQL/ }))
    expect(screen.getByText('A medias.')).toBeTruthy()
  })
  it('opens a sheet with the rationale and the evidence quote', () => {
    wrap(
      <RequirementChips
        items={[
          item({
            sources: [{ id: 'e1', text: 'Manejé 90,000 MXN en ads', label: 'Voltis Electric' }],
          }),
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /SQL/ }))
    expect(screen.getByText('Lo usaste a diario.')).toBeTruthy()
    expect(screen.getByText(/Manejé 90,000 MXN en ads/)).toBeTruthy()
    expect(screen.getByText('Voltis Electric')).toBeTruthy()
  })
  it('a blocker reads "bloqueado", not "falta", on its chip and in its sheet', () => {
    wrap(<RequirementChips items={[item({ strength: 'none', blocker: true })]} />)
    const chip = screen.getByRole('button', { name: /SQL/ })
    expect(chip.textContent).toContain('bloqueado')
    fireEvent.click(chip)
    expect(screen.getAllByText('bloqueado').length).toBeGreaterThan(0)
  })
  it('says an evidence record is gone instead of dropping it', () => {
    wrap(<RequirementChips items={[item({ sources: [{ id: 'gone', text: null, label: '' }] })]} />)
    fireEvent.click(screen.getByRole('button', { name: /SQL/ }))
    expect(screen.getByText(/ya no está en tu experiencia/i)).toBeTruthy()
  })
  it('shows unjudged requirements with the unjudged notice, not a rationale', () => {
    wrap(<RequirementChips items={[item({ unjudged: true, strength: 'none', rationale: 'x' })]} />)
    fireEvent.click(screen.getByRole('button', { name: /SQL/ }))
    expect(screen.getByText(/no respondió sobre este/i)).toBeTruthy()
  })
  it('always shows what the posting asked, even when unjudged', () => {
    wrap(
      <RequirementChips
        items={[item({ unjudged: true, strength: 'none', text: 'Vivir en CDMX o alrededores' })]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /SQL/ }))
    expect(screen.getByText('Vivir en CDMX o alrededores')).toBeTruthy()
  })
  it('caps a group at 24 and offers the rest', () => {
    const many = Array.from({ length: 30 }, (_, i) => item({ id: `m${i}`, keyword: `K${i}` }))
    wrap(<RequirementChips items={many} />)
    expect(screen.getAllByRole('button', { name: /^K\d+/ })).toHaveLength(24)
    fireEvent.click(screen.getByRole('button', { name: /6 más/ }))
    expect(screen.getAllByRole('button', { name: /^K\d+/ })).toHaveLength(30)
  })
})

const blocker: Requirement = {
  id: 'l',
  text: 'Vivir en Madrid',
  keyword: 'Residencia en Madrid',
  variants: [],
  kind: 'location',
  mandatory: true,
  weight: 3,
}
const cov = (o: Partial<Coverage>): Coverage => ({
  mandatoryTotal: 3,
  mandatoryStrong: 1,
  mandatoryPartial: 1,
  mandatoryMissing: 1,
  desirableTotal: 0,
  desirableStrong: 0,
  desirablePartial: 0,
  desirableMissing: 0,
  hardBlockers: [],
  unjudgedGates: [],
  verdict: 'worth-it',
  ...o,
})

describe('VerdictPanel', () => {
  it('leads with the verdict word and the sentence, with a legend in text', () => {
    wrap(<VerdictPanel coverage={cov({})} sentence="Cubres de lleno 1 de 3." />)
    expect(screen.getByText('Vale la pena')).toBeTruthy()
    expect(screen.getByText('Cubres de lleno 1 de 3.')).toBeTruthy()
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toContain('1 que cumples')
  })
  it('shows a skip blocker as a gate inside the card', () => {
    wrap(
      <VerdictPanel
        coverage={cov({ verdict: 'skip', hardBlockers: [blocker] })}
        sentence="Te bloquea Residencia en Madrid."
      />,
    )
    expect(screen.getByText(/Lo que te bloquea/, { selector: '.gate-title' })).toBeTruthy()
    expect(screen.getByText('Residencia en Madrid')).toBeTruthy()
  })
  it('opens a gate to show the requirement text', () => {
    wrap(<VerdictPanel coverage={cov({ verdict: 'skip', hardBlockers: [blocker] })} sentence="x" />)
    fireEvent.click(screen.getByRole('button', { name: /Residencia en Madrid/ }))
    expect(screen.getByText('Vivir en Madrid')).toBeTruthy()
  })
  it('draws no meter when nothing mandatory was found', () => {
    const { container } = wrap(
      <VerdictPanel
        coverage={cov({
          mandatoryTotal: 0,
          mandatoryStrong: 0,
          mandatoryPartial: 0,
          mandatoryMissing: 0,
          verdict: 'stretch',
        })}
        sentence="x"
      />,
    )
    expect(container.querySelector('.verdict-meter')).toBeNull()
  })
})

describe('groupByTone', () => {
  const k = (r: ChipRequirement) => r.keyword
  it('orders missing, partial, covered, unjudged and drops empty groups', () => {
    const g = groupByTone([
      item({ id: '1', keyword: 'a', strength: 'strong' }),
      item({ id: '2', keyword: 'b', strength: 'none', unjudged: true }),
      item({ id: '3', keyword: 'c', strength: 'none' }),
    ])
    expect(g.map((x) => x.tone)).toEqual(['missing', 'strong', 'unjudged'])
  })
  it('puts short chips first and keeps the given order on ties', () => {
    const [g] = groupByTone([
      item({ id: '1', keyword: 'Internet confiable y home office', strength: 'none' }),
      item({ id: '2', keyword: 'Meta Ads', strength: 'none' }),
      item({ id: '3', keyword: 'Shopify', strength: 'none' }),
      item({ id: '4', keyword: 'Klaviyo', strength: 'none' }),
    ])
    expect(g?.rows.map(k)).toEqual([
      'Shopify',
      'Klaviyo',
      'Meta Ads',
      'Internet confiable y home office',
    ])
  })
  it('a blocker leads its group whatever its length', () => {
    const [g] = groupByTone([
      item({ id: '1', keyword: 'SQL', strength: 'none' }),
      item({ id: '2', keyword: 'Residencia en Madrid', strength: 'none', blocker: true }),
    ])
    expect(g?.rows.map(k)).toEqual(['Residencia en Madrid', 'SQL'])
  })
})
