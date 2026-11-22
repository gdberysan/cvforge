/**
 * An id for a record the user added by hand (or one import had to rename):
 * `<prefix>_` plus 8 hex characters, the first always a letter.
 *
 * Import assigns sequential ids (exp_1, proj_2…) and evidence is keyed by
 * them, so a manual id must never read as one. A bare 8-hex slice of a UUID
 * is all digits about 2.3% of the time ((10/16)^8) — `exp_36229741` is a
 * perfectly sequential-looking id — so the first character is mapped onto
 * a–f. `random` is injectable so the all-digit case can be tested without
 * relying on chance.
 */
export function manualId(prefix: string, random: () => string = () => crypto.randomUUID()): string {
  const hex = random().replace(/-/g, '').slice(0, 8).toLowerCase()
  const lead = 'abcdef'[Number.parseInt(hex[0] ?? '0', 16) % 6] ?? 'a'
  return `${prefix}_${lead}${hex.slice(1)}`
}
