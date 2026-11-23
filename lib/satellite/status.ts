import type { AgentSettings } from './shared'

/** What the Ajustes card shows; produced by readAgentStatus in ./settings.ts. */
export type AgentStatus = {
  settings: AgentSettings
  /** When the last tick that triaged something ran (ISO), if ever. */
  lastTriagedAt: string | null
  /** Postings triaged since local midnight — what the cap bounds. */
  triagedToday: number
  /** The newest scan's numbers (the satellite's `scan` run_log row), if any. */
  lastScan?: LastScan | null
}

export type LastScan = { at: string; seen: number; judged: number; found: number }
