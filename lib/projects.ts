import { manualId } from '@/lib/manual-id'
import type { MasterProfile, Project } from '@/lib/schemas'

export type NewProject = {
  name: string
  description: string
  url?: string
  stack: string[]
  /** YYYY-MM */
  start: string
  /** YYYY-MM; absent means the project is ongoing. */
  end?: string
}

function toProject(id: string, input: NewProject): Project {
  return {
    id,
    name: input.name,
    description: input.description,
    ...(input.url ? { url: input.url } : {}),
    stack: input.stack,
    period: { start: input.start, ...(input.end ? { end: input.end } : {}) },
  }
}

/**
 * The home for self-built work. Before this, the only way to record a tool
 * you built on your own was to file it under an invented employer. The id is
 * random-suffixed so it can never collide with import's sequential proj_N.
 */
export function addProject(
  profile: MasterProfile,
  input: NewProject,
): { profile: MasterProfile; projectId: string } {
  const projectId = manualId('proj')
  return {
    projectId,
    profile: { ...profile, projects: [...profile.projects, toProject(projectId, input)] },
  }
}

/** Facts print verbatim on the CV, so they must be correctable. Null when absent. */
export function updateProject(
  profile: MasterProfile,
  projectId: string,
  input: NewProject,
): MasterProfile | null {
  if (!profile.projects.some((p) => p.id === projectId)) return null
  return {
    ...profile,
    projects: profile.projects.map((p) => {
      if (p.id !== projectId) return p
      const next = toProject(p.id, input)
      // An untouched year-only date stays a year (see PeriodSchema).
      return {
        ...next,
        period: {
          ...next.period,
          ...(p.period?.startYearOnly && input.start === p.period.start
            ? { startYearOnly: true }
            : {}),
          ...(p.period?.endYearOnly && input.end && input.end === p.period.end
            ? { endYearOnly: true }
            : {}),
        },
      }
    }),
  }
}

/** Removes a project. Its evidence rows are the caller's responsibility. */
export function removeProject(profile: MasterProfile, projectId: string): MasterProfile | null {
  if (!profile.projects.some((p) => p.id === projectId)) return null
  return { ...profile, projects: profile.projects.filter((p) => p.id !== projectId) }
}
