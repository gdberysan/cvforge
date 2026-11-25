/**
 * What one sync should do, decided from facts only (no I/O), so every case
 * is tested: whether Drive has a copy, whether it changed since this browser
 * last saw it, and whether this browser changed since its last sync.
 *
 * - nothing on Drive: push (the first copy);
 * - Drive unchanged since our last sync: push if we changed, else nothing;
 * - Drive changed elsewhere: pull if we have nothing of our own to lose
 *   (no changes since our last sync, or nothing here at all), else ask —
 *   never overwrite one side's work with the other's on a guess.
 */
export type SyncPlan = 'push' | 'pull' | 'nothing' | 'ask'

export function planSync(facts: {
  remoteModified: string | null
  lastSeenRemote: string | null
  localChanged: boolean
  localEmpty: boolean
}): SyncPlan {
  const { remoteModified, lastSeenRemote, localChanged, localEmpty } = facts
  if (remoteModified === null) return localEmpty ? 'nothing' : 'push'
  if (remoteModified === lastSeenRemote) return localChanged ? 'push' : 'nothing'
  if (localEmpty || !localChanged) return 'pull'
  return 'ask'
}
