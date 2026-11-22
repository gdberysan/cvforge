import { z } from 'zod'

/** A search-result card from LinkedIn's public jobs-guest list. */
export const JobCardSchema = z.object({
  id: z.string().regex(/^\d{6,}$/),
  title: z.string().min(1),
  company: z.string().nullable(),
  companyUrl: z.string().nullable(),
  location: z.string().nullable(),
  /** ISO date from the card's datetime attribute, when present. */
  date: z.string().nullable(),
  url: z.string().url().startsWith('https://'),
})
export type JobCard = z.infer<typeof JobCardSchema>

export const JobDetailSchema = JobCardSchema.extend({
  // Empty when the page carried no title — never a placeholder string, which
  // would land verbatim as the first line of the posting the user pastes.
  title: z.string(),
  description: z.string().nullable(),
  seniority: z.string().nullable(),
  employmentType: z.string().nullable(),
})
export type JobDetail = z.infer<typeof JobDetailSchema>

/**
 * `dropped` is the honest part: cards the parser saw (by URN marker) but
 * could not read. The UI reports it; silently under-counting is upstream's
 * behaviour, not ours.
 */
export const SearchResultSchema = z.object({
  cards: z.array(JobCardSchema),
  dropped: z.number().int().min(0),
})
export type SearchResult = z.infer<typeof SearchResultSchema>

/**
 * Search options. Lives here (a shippable schema file), not in linkedin.ts, so
 * the buyer-facing stub can reference it without importing the scraper — the
 * scraper source (linkedin.ts) never ships, but the app's #discover surface
 * must still compile from source.
 */
export type SearchOptions = {
  query?: string
  location: string
  /** Posted within N days; omit for any time. */
  jobageDays?: number
  remote?: 'remote' | 'hybrid' | 'onsite'
  /** 1-indexed, 10 results per page. One page per call — never a loop. */
  page?: number
}
