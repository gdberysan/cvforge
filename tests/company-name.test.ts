import { describe, expect, it } from 'vitest'
import { companyName } from '@/lib/company-name'

describe('companyName', () => {
  it('keeps a real name, trimmed', () => {
    expect(companyName('  Grupo Salinas ')).toBe('Grupo Salinas')
  })
  it('treats the model placeholders as no company', () => {
    for (const p of [
      'Not specified',
      'not specified.',
      'N/A',
      'No especificado',
      'Desconocida',
      '',
    ])
      expect(companyName(p)).toBe('')
  })
  it('never hides a company that merely contains a placeholder word', () => {
    expect(companyName('Unknown Worlds Entertainment')).toBe('Unknown Worlds Entertainment')
  })
})
