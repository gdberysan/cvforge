import { describe, expect, it } from 'vitest'
import { addProject, removeProject, updateProject } from '@/lib/projects'
import type { MasterProfile } from '@/lib/schemas'

const profile = {
  experience: [],
  projects: [],
} as unknown as MasterProfile

const input = { name: 'Shelf Tracker', description: 'd', stack: ['n8n'], start: '2024-03' }

describe('projects', () => {
  it('adds with a random id that cannot collide with import ids, ongoing when no end', () => {
    const { profile: next, projectId } = addProject(profile, input)
    expect(projectId).toMatch(/^proj_[0-9a-f]{8}$/)
    expect(next.projects[0]).toEqual({
      id: projectId,
      name: 'Shelf Tracker',
      description: 'd',
      stack: ['n8n'],
      period: { start: '2024-03' },
    })
  })

  it('updates in place and refuses an unknown id', () => {
    const { profile: next, projectId } = addProject(profile, input)
    const edited = updateProject(next, projectId, { ...input, end: '2025-01', url: 'x.dev' })
    expect(edited?.projects[0]).toMatchObject({
      period: { start: '2024-03', end: '2025-01' },
      url: 'x.dev',
    })
    expect(updateProject(next, 'proj_nope', input)).toBeNull()
  })

  it('removes, and refuses an unknown id', () => {
    const { profile: next, projectId } = addProject(profile, input)
    expect(removeProject(next, projectId)?.projects).toEqual([])
    expect(removeProject(next, 'proj_nope')).toBeNull()
  })
})
