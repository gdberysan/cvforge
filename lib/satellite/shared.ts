/**
 * The satellite's settings shape and rules, with no runtime imports — the
 * Ajustes card runs in the browser and must not drag better-sqlite3 into a
 * client bundle. Database access lives in ./settings.ts.
 */
export type AgentSettings = {
  dailyCap: number
  digestSize: number
  verdictFloor: 'stretch' | 'worth-it' | 'strong'
  salaryFloor: number | null
  wakeStart: number
  wakeEnd: number
  paused: boolean
  /** Asks about applications with no news for a week. */
  followUps: boolean
  /** The Monday summary. */
  weeklyReport: boolean
}

/** The satellite's own starting points (src/db/settings.ts DEFAULTS). */
export const AGENT_DEFAULTS: AgentSettings = {
  dailyCap: 5,
  digestSize: 3,
  verdictFloor: 'stretch',
  salaryFloor: null,
  wakeStart: 8,
  wakeEnd: 23,
  paused: false,
  followUps: true,
  weeklyReport: true,
}

export const VERDICT_FLOORS = ['stretch', 'worth-it', 'strong'] as const

/** The satellite's own confirmation threshold for the cap, taken as a ceiling here. */
export const MAX_DAILY_CAP = 10

export const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
export const isFloor = (v: unknown): v is AgentSettings['verdictFloor'] =>
  typeof v === 'string' && (VERDICT_FLOORS as readonly string[]).includes(v)

export type AgentValidation = { ok: true } | { ok: false; code: 'agent-invalid' | 'agent-window' }

/** The satellite's /settings rules, applied to a whole proposed set at once. */
export function validateAgentSettings(s: AgentSettings): AgentValidation {
  const bad =
    !isInt(s.dailyCap) ||
    s.dailyCap < 1 ||
    s.dailyCap > MAX_DAILY_CAP ||
    !isInt(s.digestSize) ||
    s.digestSize < 1 ||
    !isFloor(s.verdictFloor) ||
    !(s.salaryFloor === null || (isInt(s.salaryFloor) && s.salaryFloor >= 0)) ||
    !isInt(s.wakeStart) ||
    !isInt(s.wakeEnd) ||
    s.wakeStart < 0 ||
    s.wakeStart > 23 ||
    s.wakeEnd < 0 ||
    s.wakeEnd > 23 ||
    typeof s.paused !== 'boolean' ||
    typeof s.followUps !== 'boolean' ||
    typeof s.weeklyReport !== 'boolean'
  if (bad) return { ok: false, code: 'agent-invalid' }
  // Strictly less than: equal bounds make the wake window empty and the
  // digest silently never fires.
  if (s.wakeStart >= s.wakeEnd) return { ok: false, code: 'agent-window' }
  return { ok: true }
}
