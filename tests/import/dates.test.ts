import { describe, expect, it } from 'vitest'
import {
  formatSpan,
  isPresent,
  readCvMonth,
  readPeriod,
  UndatedRoleError,
} from '@/lib/import/dates'

describe('readCvMonth', () => {
  it.each([
    ['2019-03', '2019-03'],
    ['2019-3', '2019-03'],
    ['2019/03', '2019-03'],
    ['2019-03-15', '2019-03'],
    ['03/2019', '2019-03'],
    ['3-2019', '2019-03'],
    ['2019', '2019-01'],
    ['Mar 2019', '2019-03'],
    ['Sept. 2019', '2019-09'],
    ['marzo de 2019', '2019-03'],
    [' Dic 2020 ', '2020-12'],
  ])('reads %s as %s', (raw, expected) => {
    expect(readCvMonth(raw)).toBe(expected)
  })

  it.each([undefined, '', '   ', 'recently', '2019-13', '13/2019', '1850', 'Q3 2019'])(
    'reports %s as absent rather than guessing',
    (raw) => {
      expect(readCvMonth(raw)).toBeUndefined()
    },
  )
})

describe('isPresent', () => {
  it.each(['present', 'Actualidad', 'a la fecha', 'current'])('%s is an open period', (raw) => {
    expect(isPresent(raw)).toBe(true)
  })

  it('a date is not', () => {
    expect(isPresent('2020-01')).toBe(false)
  })
})

describe('readPeriod', () => {
  it('reads an open period as having no end', () => {
    expect(readPeriod({ start: '2021', end: 'Presente' })).toEqual({
      start: '2021-01',
      unreadableEnd: false,
    })
  })

  it('never reads an unreadable end as ongoing', () => {
    // Claiming a finished job is current is the misrepresentation the
    // composer's tense rule exists to prevent.
    expect(readPeriod({ start: '2018-01', end: 'last year' })).toEqual({
      start: '2018-01',
      end: undefined,
      unreadableEnd: true,
    })
  })
})

describe('formatSpan', () => {
  it('prints an open span, an end-only year, and nothing for an undated entry', () => {
    expect(formatSpan({ start: '2019-01' }, 'present')).toBe('2019-01–present')
    expect(formatSpan({ start: '2019-01', end: '2020-06' }, 'present', ' → ')).toBe(
      '2019-01 → 2020-06',
    )
    expect(formatSpan({ end: '2015-01' }, 'present')).toBe('2015-01')
    expect(formatSpan(undefined, 'present')).toBe('')
  })
})

describe('UndatedRoleError', () => {
  it('names every undated role and carries a stable code for the UI', () => {
    const error = new UndatedRoleError(['Engineer at Kavak', 'Analyst at Bimbo'])
    expect(error.code).toBe('cv-undated-role')
    expect(error.message).toContain('Engineer at Kavak')
    expect(error.message).toContain('Analyst at Bimbo')
  })
})
