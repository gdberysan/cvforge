import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SeedSchema } from '@/lib/demo/seed'

describe('demo/seed.json', () => {
  it('parses and tells the three stories', () => {
    const seed = SeedSchema.parse(JSON.parse(readFileSync('demo/seed.json', 'utf8')))
    const byId = Object.fromEntries(seed.applications.map((a) => [a.id, a]))
    expect(byId.app_demo_1.coverage.verdict).toBe('strong')
    expect(byId.app_demo_2.coverage.verdict).toBe('worth-it')
    expect(byId.app_demo_3.coverage.verdict).toBe('skip')
    expect(byId.app_demo_1.documents).toHaveProperty('cv')
    expect(byId.app_demo_1.documents).toHaveProperty('coverLetter')
    expect(byId.app_demo_2.documents).toHaveProperty('cv')
    expect(byId.app_demo_3.archived).toBe(true)
    expect(Object.keys(seed.interviewPlans)).toHaveLength(3)
  })
})
