/**
 * Reading the dates a CV import produced. The model is asked for YYYY-MM, but
 * a `pattern` in a model-facing schema is unenforceable pressure (see
 * CLAUDE.md), so the skeleton accepts any string and the code reads it here.
 * A date the code cannot read is reported as absent — never guessed.
 */

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  ene: 1,
  enero: 1,
  feb: 2,
  february: 2,
  febrero: 2,
  mar: 3,
  march: 3,
  marzo: 3,
  apr: 4,
  april: 4,
  abr: 4,
  abril: 4,
  may: 5,
  mayo: 5,
  jun: 6,
  june: 6,
  junio: 6,
  jul: 7,
  july: 7,
  julio: 7,
  aug: 8,
  august: 8,
  ago: 8,
  agosto: 8,
  sep: 9,
  sept: 9,
  september: 9,
  septiembre: 9,
  setiembre: 9,
  oct: 10,
  october: 10,
  octubre: 10,
  nov: 11,
  november: 11,
  noviembre: 11,
  dec: 12,
  december: 12,
  dic: 12,
  diciembre: 12,
}

const PRESENT = new Set([
  'present',
  'current',
  'now',
  'today',
  'ongoing',
  'actual',
  'actualidad',
  'presente',
  'hoy',
  'a la fecha',
  'en curso',
])

function month(year: number, m: number): string | undefined {
  if (year < 1900 || year > 2100 || m < 1 || m > 12) return undefined
  return `${year}-${String(m).padStart(2, '0')}`
}

/** "2019-03", "2019-3", "2019/03", "2019-03-15", "03/2019", "Mar 2019",
 *  "marzo de 2019" and a bare "2019" (its January, as the prompt specifies). */
export function readCvMonth(raw: string | undefined): string | undefined {
  const s = raw?.trim().toLowerCase()
  if (!s) return undefined

  let m = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/)
  if (m) return month(Number(m[1]), Number(m[2]))

  m = s.match(/^(\d{1,2})[-/.](\d{4})$/)
  if (m) return month(Number(m[2]), Number(m[1]))

  m = s.match(/^(\d{4})$/)
  if (m) return month(Number(m[1]), 1)

  m = s.match(/^([a-z]+)\.?(?:\s+de)?\s+(\d{4})$/)
  if (m && MONTHS[m[1]]) return month(Number(m[2]), MONTHS[m[1]])

  return undefined
}

/** Whether an end date says the period is still open. */
export function isPresent(raw: string | undefined): boolean {
  return PRESENT.has(raw?.trim().toLowerCase() ?? '')
}

export type RawPeriod = { start?: string; end?: string }

/**
 * A period the code could read. `end` absent means open ("present") — so an
 * end that is present but unreadable is NOT resolved to open: claiming a
 * finished job is ongoing is exactly the misrepresentation the composer's
 * tense rule exists to prevent.
 */
export type ReadPeriod = { start?: string; end?: string; unreadableEnd: boolean }

export function readPeriod(raw: RawPeriod | undefined): ReadPeriod {
  const start = readCvMonth(raw?.start)
  const endRaw = raw?.end?.trim()
  if (!endRaw || isPresent(endRaw)) return { start, unreadableEnd: false }
  const end = readCvMonth(endRaw)
  return { start, end, unreadableEnd: end === undefined }
}

/**
 * A role the CV gives no readable start date for. Roles carry the dates the
 * whole pipeline leans on (tense, overlap matching, interview framing), and
 * there is nothing honest to fill one in with — so import stops, early and
 * specifically, instead of storing an invented month.
 */
export class UndatedRoleError extends Error {
  readonly code = 'cv-undated-role'
  constructor(readonly roles: string[]) {
    super(
      `The CV gives no readable dates for: ${roles.join('; ')}. Add a start date (month and year) for each role and import again.`,
    )
    this.name = 'UndatedRoleError'
  }
}

/** Human-readable span for display and prompts; '' when nothing is known. */
export function formatSpan(
  period: { start?: string; end?: string } | undefined,
  present: string,
  separator = '–',
): string {
  if (!period?.start) return period?.end ?? ''
  return `${period.start}${separator}${period.end ?? present}`
}
