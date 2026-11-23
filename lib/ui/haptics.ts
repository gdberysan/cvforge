/**
 * A short pulse under the finger when something happens that matters, on a
 * phone that can vibrate (Chrome on Android; Safari on iPhone has no
 * Vibration API, so there it stays silent). Four moments, and only these —
 * if everything vibrates, nothing means anything:
 *
 *   tick     switching to another place: a bottom-bar destination, an
 *            application step, a tab or filter (HapticsListener)
 *   confirm  a tap that saved something you will care about: an outcome
 *            logged, a find chased or dismissed, a follow-up marked sent,
 *            a document copied
 *   done     a long job you were waiting on finished (two quick pulses)
 *   failed   it did not (a heavier double buzz)
 *
 * No sound, on purpose: CVForge is used in offices and before calls.
 * On by default; Ajustes turns it off for this device only.
 */
export type Haptic = 'tick' | 'confirm' | 'done' | 'failed'

const PULSE: Record<Haptic, number | number[]> = {
  tick: 8,
  confirm: 12,
  done: [10, 60, 10],
  failed: [30, 60, 30],
}

/** A tick is one per touch (a finger can fire twice); a result is one per run. */
const MIN_GAP_MS: Record<Haptic, number> = { tick: 45, confirm: 300, done: 600, failed: 600 }

const KEY = 'cvforge.haptics'
const last: Partial<Record<Haptic, number>> = {}

/** On unless this device turned it off. Storage that cannot be read counts as on. */
export function hapticsOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setHapticsOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // No storage (private mode): the choice lasts this visit only.
  }
}

/** Cosmetic: never throws, and does nothing where the browser cannot vibrate. */
export function haptic(kind: Haptic): void {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
    if (!hapticsOn()) return
    const now = Date.now()
    if (now - (last[kind] ?? Number.NEGATIVE_INFINITY) < MIN_GAP_MS[kind]) return
    last[kind] = now
    navigator.vibrate(PULSE[kind])
  } catch {
    // Blocked or unsupported: the tap itself still works.
  }
}
