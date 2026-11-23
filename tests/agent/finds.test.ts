import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deletePendingFind, getPendingFind, listPendingFinds } from '@/lib/agent/finds'
import { addShown, find, satelliteFile } from './fixtures'

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cvforge-finds-'))
  file = satelliteFile(dir)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('pending finds', () => {
  it('lists newest first and skips a row it cannot read', () => {
    addShown(
      file,
      '1000001',
      JSON.stringify(find({ jobTitle: 'Older' })),
      '2026-10-15T10:00:00.000Z',
    )
    addShown(
      file,
      '1000002',
      JSON.stringify(find({ jobTitle: 'Newer' })),
      '2026-10-15T12:00:00.000Z',
    )
    addShown(file, '1000003', '{not json', '2026-10-15T13:00:00.000Z')
    const finds = listPendingFinds(file)
    expect(finds.map((f) => f.analysis.jobTitle)).toEqual(['Newer', 'Older'])
    expect(finds[0]).toMatchObject({ postingId: '1000002', createdAt: '2026-10-15T12:00:00.000Z' })
  })

  it('gets one, null when gone, and deletes', () => {
    addShown(file, '1000001', JSON.stringify(find()), '2026-10-15T10:00:00.000Z')
    expect(getPendingFind(file, '1000001')?.analysis.company).toBe('Acme')
    expect(getPendingFind(file, '9999999')).toBeNull()
    deletePendingFind(file, '1000001')
    expect(getPendingFind(file, '1000001')).toBeNull()
  })

  it('reads an older satellite with no shown_postings table as no finds', () => {
    const empty = path.join(dir, 'empty.db')
    expect(listPendingFinds(empty)).toEqual([])
  })
})

describe('pending finds — review fixes', () => {
  it('Hoy shows only recent finds', () => {
    addShown(file, '1000001', JSON.stringify(find({ jobTitle: 'Old' })), '2026-09-07T10:00:00.000Z')
    addShown(file, '1000002', JSON.stringify(find({ jobTitle: 'New' })), '2026-10-14T10:00:00.000Z')
    const recent = listPendingFinds(file, { maxAgeDays: 7, now: new Date('2026-10-15T18:00:00Z') })
    expect(recent.map((f) => f.analysis.jobTitle)).toEqual(['New'])
  })

  it('a file it cannot read is no finds, never a broken Hoy', () => {
    const bad = path.join(dir, 'corrupt.db')
    writeFileSync(bad, 'this is not a database')
    expect(listPendingFinds(bad)).toEqual([])
  })
})
