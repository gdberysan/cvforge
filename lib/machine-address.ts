/**
 * An address that belongs to a system, not a person: the scheduler that sent
 * the invite (schedule@…greenhouse.io), a no-reply sender, a calendar. A
 * meeting invite lists them beside the real interviewers; shown as "who you
 * will meet", they read as people. Display-only: nothing stored changes.
 */
const MACHINE =
  /^(schedul(e|ing)|no-?reply|do-?not-?reply|notifications?|calendar|invites?|recruiting-?ops|mailer-daemon|bounces?)([+.-][^@]*)?@/i

export function isMachineAddress(email: string | null | undefined): boolean {
  return MACHINE.test((email ?? '').trim())
}
