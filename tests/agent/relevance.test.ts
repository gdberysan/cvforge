import { describe, expect, it } from 'vitest'
import { fold, isRelevantTitle, meaningful, related, relevanceWords } from '@/lib/agent/relevance'

const rel = relevanceWords(['Growth and Acquisition Marketing Manager', 'marketing automation'])

describe('relevance — the agent screen and the Ajustes preview share it', () => {
  it('folds accents and case', () => {
    expect(fold('Automatización GERENTE')).toBe('automatizacion gerente')
  })

  it('drops titles that share no meaningful word', () => {
    expect(isRelevantTitle('Account Manager', rel)).toBe(false)
    expect(isRelevantTitle('Gerente de Ventas', rel)).toBe(false)
  })

  it('keeps titles that share one, accent-folded, across languages', () => {
    expect(isRelevantTitle('Gerente de Automatización', rel)).toBe(true)
    expect(isRelevantTitle('Growth Lead', rel)).toBe(true)
    expect(isRelevantTitle('Gerente de Mercadotecnia Digital', rel)).toBe(true)
    expect(isRelevantTitle('Líder de Crecimiento', rel)).toBe(true)
  })

  it('no relevance words, or no word to judge in the title: no verdict, kept', () => {
    expect(isRelevantTitle('Account Manager', relevanceWords(['Manager', 'Gerente']))).toBe(true)
    expect(isRelevantTitle('Account Manager', [])).toBe(true)
    expect(isRelevantTitle('Especialista Sr.', relevanceWords(['Growth Marketing Manager']))).toBe(
      true,
    )
  })

  it('ignores short and generic words, but keeps the trade acronyms', () => {
    expect(relevanceWords(['Head of Growth & CRM', 'Senior Marketing Manager'])).toEqual([
      'growth',
      'crm',
      'marketing',
    ])
    expect(relevanceWords(['Head of PR and IT'])).toEqual([])
    const ppc = relevanceWords(['PPC Specialist', 'Paid Media Manager'])
    expect(isRelevantTitle('Especialista en Amazon PPC', ppc)).toBe(true)
    expect(isRelevantTitle('SEO Specialist', ppc)).toBe(false)
  })

  it('does not join "development" to "developer"', () => {
    const dev = relevanceWords(['automation developer'])
    expect(isRelevantTitle('Sales Development Representative', dev)).toBe(false)
    expect(isRelevantTitle('Desarrollador de Automatización', dev)).toBe(true)
  })

  it('joins six-letter prefixes, nothing shorter', () => {
    expect(related('automatizacion', 'automation')).toBe(true)
    expect(related('sales', 'salesforce')).toBe(false)
    expect(meaningful('Mercadeo y Ventas')).toEqual(['marketing', 'sales'])
  })
})
