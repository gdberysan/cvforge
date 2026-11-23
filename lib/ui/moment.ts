/**
 * The print-shop moments (Imprenta rebelde): a short full-screen beat after
 * the four logs that change a search — sending it, an interview, an offer,
 * a no. Raised where the outcome is confirmed by the server, shown by one
 * host in the layout, gone on the first tap. Nothing else gets one: if every
 * log celebrated, none would mean anything.
 */
export type MomentKind = 'sent' | 'interview' | 'offer' | 'loss'
export type Moment = { id: number; kind: MomentKind; applicationId: string }

const KIND_OF: Partial<Record<string, MomentKind>> = {
  applied: 'sent',
  interview: 'interview',
  offer: 'offer',
  rejected: 'loss',
}

/** The moment an outcome type earns, or null for the everyday ones. */
export function momentFor(type: string): MomentKind | null {
  return KIND_OF[type] ?? null
}

type Listener = (moment: Moment) => void
const listeners = new Set<Listener>()
let seq = 0

export function showMoment(kind: MomentKind, applicationId: string): void {
  const moment = { id: ++seq, kind, applicationId }
  for (const l of listeners) l(moment)
}

export function onMoment(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
