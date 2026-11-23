import { describe, expect, it } from 'vitest'
import { postingBlocks } from '@/lib/ui/posting-blocks'

describe('postingBlocks', () => {
  it('reads headings, bullets and paragraphs, keeping every word', () => {
    const raw =
      'Propósito del puesto:\nLiderar la estrategia\ndigital del equipo.\n\nRequisitos\n• SQL\n- Python\n\nOfrecemos un buen ambiente.'
    expect(postingBlocks(raw)).toEqual([
      { kind: 'heading', text: 'Propósito del puesto:' },
      { kind: 'para', lines: ['Liderar la estrategia', 'digital del equipo.'] },
      { kind: 'heading', text: 'Requisitos' },
      { kind: 'list', items: ['SQL', 'Python'] },
      { kind: 'para', lines: ['Ofrecemos un buen ambiente.'] },
    ])
  })

  it('never turns a sentence into a heading', () => {
    expect(
      postingBlocks('We are hiring a manager for our LATAM team, based in Mexico City.')[0].kind,
    ).toBe('para')
  })
})
