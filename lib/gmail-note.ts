/**
 * What makes an outcome the agent's (spec 2026-10-17 §1.3): its note starts
 * with `gmail:`. Both writers produce `gmail:<messageId> «<quote>»`, but the
 * prefix alone decides — the quote is optional, and a note that lost its «»
 * pair is still the agent's. Undo (`listMailOutcomes`) and Seguimiento's
 * thread (`buildThread`) read this one predicate, so an agent entry can
 * never be offered for Undo while it is listed under "Tú" as the user's.
 */
export const GMAIL_NOTE_PREFIX = 'gmail:'

export function isGmailNote(note: string | null | undefined): note is string {
  return typeof note === 'string' && note.startsWith(GMAIL_NOTE_PREFIX)
}

/** `messageId` is '' when the note carries none; `quote` is '' when it has none. */
export function parseGmailNote(
  note: string | null | undefined,
): { messageId: string; quote: string } | null {
  if (!isGmailNote(note)) return null
  const rest = note.slice(GMAIL_NOTE_PREFIX.length)
  const id = /^\S*/.exec(rest)?.[0] ?? ''
  let quote = rest.slice(id.length).trim()
  const wrapped = /^«([\s\S]*)»$/.exec(quote)
  if (wrapped) quote = wrapped[1] ?? ''
  return { messageId: id, quote }
}
