import { describe, expect, it } from 'vitest'
import { compareExtraction, type ReqSnapshot } from '@/lib/evals/compare'

/**
 * Spec §12 gate 4 — prompt regression evals. The comparison is the part that
 * must be trustworthy in code; the runner just feeds it real postings.
 */
const req = (keyword: string, over: Partial<ReqSnapshot> = {}): ReqSnapshot => ({
  keyword,
  kind: 'hard',
  mandatory: true,
  ...over,
})

describe('compareExtraction', () => {
  it('an identical extraction is a perfect match', () => {
    const diff = compareExtraction([req('SQL'), req('Google Ads')], [req('SQL'), req('Google Ads')])
    expect(diff).toEqual({
      matched: 2,
      missing: [],
      added: [],
      renamed: [],
      mandatoryFlips: [],
      kindFlips: [],
      jaccard: 1,
    })
  })

  it('keeps C, C++ and C# apart — punctuation is part of the name', () => {
    const diff = compareExtraction([req('C++')], [req('C#')])
    expect(diff.matched).toBe(0)
    expect(diff.missing).toEqual(['C++'])
    expect(diff.added).toEqual(['C#'])
    expect(
      compareExtraction([req('C'), req('C++'), req('C#')], [req('C'), req('C++'), req('C#')])
        .matched,
    ).toBe(3)
  })

  it('names what the new prompt dropped and what it invented', () => {
    const diff = compareExtraction([req('SQL'), req('Google Ads')], [req('SQL'), req('Python')])
    expect(diff.missing).toEqual(['Google Ads'])
    expect(diff.added).toEqual(['Python'])
    expect(diff.jaccard).toBeCloseTo(1 / 3)
  })

  it('matches keywords case- and whitespace-insensitively', () => {
    const diff = compareExtraction([req('Google Ads')], [req('  google ads ')])
    expect(diff.matched).toBe(1)
    expect(diff.missing).toEqual([])
  })

  it('a mandatory ↔ desirable flip is reported — it moves the verdict', () => {
    const diff = compareExtraction(
      [req('SQL', { mandatory: true })],
      [req('SQL', { mandatory: false })],
    )
    expect(diff.mandatoryFlips).toEqual(['SQL'])
  })

  it('a kind flip is reported — gating kinds judge differently', () => {
    const diff = compareExtraction(
      [req('CDMX', { kind: 'location' })],
      [req('CDMX', { kind: 'soft' })],
    )
    expect(diff.kindFlips).toEqual([{ keyword: 'CDMX', was: 'location', now: 'soft' }])
  })

  it('two empty extractions are a perfect, if vacuous, match', () => {
    expect(compareExtraction([], []).jaccard).toBe(1)
  })
})

/**
 * Every pair below came out of a real `npm run eval` run on 2026-09-05, where
 * 3 of 6 fixtures "drifted" almost entirely on rewording. A gate that fails on
 * `&` vs `and` gets ignored, so the comparator has to tell a reworded
 * requirement from a dropped one.
 */
describe('compareExtraction — rewording is not regression', () => {
  it('matches a requirement that lost a brand prefix', () => {
    const diff = compareExtraction([req('Google Merchant Center')], [req('Merchant Center')])
    expect(diff.matched).toBe(1)
    expect(diff.missing).toEqual([])
    expect(diff.added).toEqual([])
  })

  it('reports a reworded match so a human still sees it', () => {
    const diff = compareExtraction([req('Google Merchant Center')], [req('Merchant Center')])
    expect(diff.renamed).toEqual([{ was: 'Google Merchant Center', now: 'Merchant Center' }])
  })

  it('reads & and "and" as the same word', () => {
    const diff = compareExtraction([req('Webhooks & APIs')], [req('Webhooks and APIs')])
    expect(diff.matched).toBe(1)
    expect(diff.renamed).toEqual([])
  })

  it('matches a tool named with and without its domain suffix', () => {
    const diff = compareExtraction([req('Instantly.ai')], [req('Instantly')])
    expect(diff.matched).toBe(1)
  })

  it('matches a requirement restated with an extra qualifier', () => {
    const diff = compareExtraction(
      [req('Zapier/Make automation')],
      [req('Automation platform experience (Zapier/Make)')],
    )
    expect(diff.matched).toBe(1)
  })

  it('does NOT match two requirements that merely share a word', () => {
    const diff = compareExtraction([req('Google Ads')], [req('YouTube Ads')])
    expect(diff.matched).toBe(0)
    expect(diff.missing).toEqual(['Google Ads'])
    expect(diff.added).toEqual(['YouTube Ads'])
  })

  it('does NOT match the same shape across different domains', () => {
    const diff = compareExtraction(
      [req('5+ years paid search experience')],
      [req('5+ years performance marketing experience')],
    )
    expect(diff.matched).toBe(0)
  })

  it('does NOT let a generic word swallow a specific requirement', () => {
    const diff = compareExtraction([req('5+ years paid search experience')], [req('Experience')])
    expect(diff.matched).toBe(0)
  })

  it('never lets one requirement absorb two', () => {
    const diff = compareExtraction(
      [req('Salesforce Marketing Cloud'), req('Salesforce CRM')],
      [req('Salesforce')],
    )
    expect(diff.matched).toBe(1)
    expect(diff.missing).toHaveLength(1)
    expect(diff.added).toEqual([])
  })

  it('carries flag flips across a reworded match', () => {
    const diff = compareExtraction(
      [req('Google Merchant Center', { mandatory: true })],
      [req('Merchant Center', { mandatory: false })],
    )
    expect(diff.mandatoryFlips).toEqual(['Google Merchant Center'])
  })
})
