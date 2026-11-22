/**
 * Finding a company's job site (spec 2026-10-16 agent stage B). The agent
 * reads public job boards on Greenhouse, Lever, Ashby and Workable; this is
 * CVForge's own small probe so "Hugging Face" can resolve to a board without
 * the user knowing which site hosts it. It trusts only a board that answers
 * 200 with at least one posting: an empty or unknown slug proves nothing.
 */
export type Site = 'greenhouse' | 'lever' | 'ashby' | 'workable'

const SITES: Site[] = ['greenhouse', 'lever', 'ashby', 'workable']

const HOSTS: Record<string, Site> = {
  'boards.greenhouse.io': 'greenhouse',
  'job-boards.greenhouse.io': 'greenhouse',
  'jobs.lever.co': 'lever',
  'jobs.ashbyhq.com': 'ashby',
  'apply.workable.com': 'workable',
}

/** A careers URL on one of the five known hosts → its site and board slug. */
export function parseBoardUrl(raw: string): { site: Site; board: string } | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const site = HOSTS[url.hostname.toLowerCase()]
  if (!site) return null
  const board = url.pathname.split('/').filter(Boolean)[0]
  if (!board) return null
  try {
    return { site, board: decodeURIComponent(board) }
  } catch {
    return null
  }
}

/** The slugs a company name is likely to live under: joined, then hyphenated. */
export function boardCandidates(name: string): string[] {
  const words = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  if (words.length === 0) return []
  return [...new Set([words.join(''), words.join('-')])].slice(0, 2)
}

function probeUrl(site: Site, board: string): string {
  const b = encodeURIComponent(board)
  switch (site) {
    case 'greenhouse':
      return `https://boards-api.greenhouse.io/v1/boards/${b}/jobs`
    case 'lever':
      return `https://api.lever.co/v0/postings/${b}?mode=json`
    case 'ashby':
      return `https://api.ashbyhq.com/posting-api/job-board/${b}`
    case 'workable':
      return `https://apply.workable.com/api/v1/widget/accounts/${b}`
  }
}

function hasPostings(site: Site, json: unknown): boolean {
  if (site === 'lever') return Array.isArray(json) && json.length > 0
  const jobs = (json as { jobs?: unknown } | null)?.jobs
  return Array.isArray(jobs) && jobs.length > 0
}

async function live(site: Site, board: string, f: typeof fetch): Promise<boolean> {
  try {
    const res = await f(probeUrl(site, board), {
      headers: { accept: 'application/json', 'user-agent': 'cvforge/1.0' },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status !== 200) return false
    return hasPostings(site, await res.json())
  } catch {
    // A timeout or a non-JSON answer is just "not here".
    return false
  }
}

/**
 * The live board that comes first in the spec's order (greenhouse → lever →
 * ashby → workable, candidates in order). The at most 8 requests go out at
 * once, so the worst case is one timeout, not eight; the order still decides
 * the winner whichever answers first.
 */
export async function probeBoard(
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ site: Site; board: string } | null> {
  const tries = SITES.flatMap((site) => boardCandidates(name).map((board) => ({ site, board })))
  const alive = await Promise.all(tries.map((t) => live(t.site, t.board, fetchImpl)))
  return tries.find((_, i) => alive[i]) ?? null
}
