import type { ApplicationRecord } from '@/lib/db/queries/applications'

/**
 * The demo's "analysis": the same stage events the live route emits, with
 * pauses so the console reads like work is happening — because it did, once,
 * when the seed was built. Ends on the seeded result. Pure, so the route
 * just plays it.
 */
export function demoTriageEvents(app: ApplicationRecord): { event: unknown; delayMs: number }[] {
  return [
    { event: { stage: 'extracting' }, delayMs: 1800 },
    {
      event: {
        stage: 'mapping',
        detail: `${app.requirements.length} requirements · ${app.mappings.length} mapped`,
      },
      delayMs: 2200,
    },
    { event: { stage: 'saving' }, delayMs: 600 },
    {
      event: {
        done: true,
        applicationId: app.id,
        cached: false,
        company: app.company,
        jobTitle: app.jobTitle,
        requirements: app.requirements,
        mappings: app.mappings,
        coverage: app.coverage,
      },
      delayMs: 0,
    },
  ]
}
