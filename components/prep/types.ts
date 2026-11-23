import type { PrepReport } from '@/lib/prep/verify'
import type { PrepContent } from '@/lib/schemas/prep'

export type ShownPrep = { content: PrepContent; report: PrepReport; stale: boolean }

/** How a line is marked: why to check it, and whether it sounds written. */
export type LineMarks = { flags: Map<string, string>; tells: Set<string> }

export function marksOf(report: PrepReport): LineMarks {
  return {
    flags: new Map(report.flags.map((f) => [f.path, f.reason])),
    tells: new Set(report.tells.map((t) => t.path)),
  }
}
