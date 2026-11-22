/** Hours are the Mac's local time, 0–23. start > end spans midnight. */
export type QuietHours = { start: number; end: number }
export const DEFAULT_QUIET: QuietHours = { start: 22, end: 8 }

export function inQuietHours(now: Date, q: QuietHours): boolean {
  if (q.start === q.end) return false
  const h = now.getHours()
  return q.start < q.end ? h >= q.start && h < q.end : h >= q.start || h < q.end
}

/** When the current quiet window closes. */
export function quietEnds(now: Date, q: QuietHours): Date {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), q.end, 0, 0, 0)
  if (end <= now) end.setDate(end.getDate() + 1)
  return end
}
