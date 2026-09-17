import { describe, expect, it } from 'vitest'
import { findTells } from '@/lib/verify/tells'

describe('findTells — English', () => {
  it('catches the phrases that mark a letter as machine-written', () => {
    expect(findTells('I am passionate about growth marketing.', 'en')).toContain('passionate about')
    expect(findTells('This lets us leverage the existing funnel.', 'en')).toContain('leverage')
    expect(findTells('It delivered a seamless experience.', 'en')).toContain('seamless')
    expect(findTells('Moreover, the results held.', 'en')).toContain('moreover')
  })

  it('catches the em dash, which is the single loudest tell', () => {
    expect(findTells('I led the team — and the numbers moved.', 'en')).toContain('—')
  })

  it('catches a split construction across the words between its halves', () => {
    expect(findTells('Not only did it convert, but also retained.', 'en')).toContain(
      'not only … but also',
    )
  })

  it('is case-insensitive, because a tell at the start of a sentence is still a tell', () => {
    expect(findTells('Delve into the data.', 'en')).toContain('delve')
  })

  it('matches whole words only', () => {
    // "robust" is a tell; "robustness" in a real sentence about testing is not
    // what the banlist is for, and neither is a word that merely contains one.
    expect(findTells('The pipeline was rebuilt.', 'en')).toEqual([])
    expect(findTells('We measured undelverable rates.', 'en')).toEqual([])
  })

  it('says nothing about prose that is already plain', () => {
    expect(
      findTells('I ran Meta and Google Ads on a 450k MXN monthly budget for two years.', 'en'),
    ).toEqual([])
  })

  it('reports each distinct tell once, however many times it appears', () => {
    const found = findTells('Seamless here, seamless there, seamless everywhere.', 'en')
    expect(found.filter((f) => f === 'seamless')).toHaveLength(1)
  })

  it('spares a banned word that is actually the name of somewhere you worked', () => {
    // Seamless is a real employer. Telling the model to rewrite away the name
    // of the company on the CV would be worse than the tell.
    expect(findTells('At Seamless I ran acquisition.', 'en', new Set(['seamless']))).toEqual([])
  })
})

describe('findTells — Mexican Spanish', () => {
  it('uses its own list, not a translation of the English one', () => {
    expect(findTells('Cabe mencionar que el ROAS subió.', 'es-MX')).toContain('cabe mencionar')
    expect(findTells('Es importante destacar el resultado.', 'es-MX')).toContain(
      'es importante destacar',
    )
    expect(findTells('Asimismo, coordiné a la agencia.', 'es-MX')).toContain('asimismo')
    expect(findTells('Me apasiona el marketing digital.', 'es-MX')).toContain('me apasiona')
  })

  it('matches through accents and enye, which is how the words are really spelled', () => {
    // The list is stored unaccented and the text is folded before matching, so
    // "señalar" has to hit "senalar" and "conclusión" has to hit "conclusion".
    expect(findTells('Cabe señalar que el ROAS subió.', 'es-MX')).toContain('cabe senalar')
    expect(findTells('En conclusión, funcionó.', 'es-MX')).toContain('en conclusion')
    expect(findTells('Hoy en día opero la cuenta.', 'es-MX')).toContain('hoy en dia')
    expect(findTells('Tengo sólida experiencia en esto.', 'es-MX')).toContain('solida experiencia')
  })

  it('catches the em dash in Spanish too', () => {
    expect(findTells('Operé la cuenta — y el CAC bajó.', 'es-MX')).toContain('—')
  })

  it('leaves plain Mexican Spanish alone', () => {
    expect(
      findTells('Operé Meta y Google Ads con 450 mil MXN al mes durante dos años.', 'es-MX'),
    ).toEqual([])
  })

  it('does not apply the English list to Spanish text', () => {
    // "sin" is an ordinary Spanish word; an English banlist entry must never
    // fire inside it, and vice versa.
    expect(findTells('Cerré el trimestre sin exceder el presupuesto.', 'es-MX')).toEqual([])
  })
})
