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
 *  "marzo de 2019" and a bare "2019" (stored as its January; readPeriod
 *  says it was only a year, so nothing prints a month the CV never gave). */
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

/** True when the CV gave only a year ("2019"), not a month. */
export function isYearOnly(raw: string | undefined): boolean {
  return /^\d{4}$/.test(raw?.trim() ?? '')
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
export type ReadPeriod = {
  start?: string
  end?: string
  unreadableEnd: boolean
  /** Only a year was given for that end: see PeriodSchema. */
  startYearOnly?: boolean
  endYearOnly?: boolean
}

export function readPeriod(raw: RawPeriod | undefined): ReadPeriod {
  const start = readCvMonth(raw?.start)
  const startYearOnly = start !== undefined && isYearOnly(raw?.start) ? { startYearOnly: true } : {}
  const endRaw = raw?.end?.trim()
  if (!endRaw || isPresent(endRaw)) return { start, unreadableEnd: false, ...startYearOnly }
  const end = readCvMonth(endRaw)
  const endYearOnly = end !== undefined && isYearOnly(endRaw) ? { endYearOnly: true } : {}
  return { start, end, unreadableEnd: end === undefined, ...startYearOnly, ...endYearOnly }
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

/**
 * A role the CV names without an employer or a title. Stopped before the
 * second paid call like an undated one: the stored profile needs both, and
 * filling either in ("Freelance") would be inventing it.
 */
export class IncompleteRoleError extends Error {
  readonly code = 'cv-incomplete-role'
  constructor(readonly roles: string[]) {
    super(
      `The CV names these roles without an employer or a title: ${roles.join('; ')}. Add both (for self-employment, write it as the employer) and import again.`,
    )
    this.name = 'IncompleteRoleError'
  }
}

/**
 * A CV the reader found no name in. Stopped before the second paid call like
 * an incomplete role: the stored profile needs a name, and there is no
 * honest one to put there.
 */
export class MissingNameError extends Error {
  readonly code = 'cv-missing-name'
  constructor() {
    super(
      'No name could be read from the CV. Make sure your full name appears as text at the top and import again.',
    )
    this.name = 'MissingNameError'
  }
}

/** Human-readable span for display and prompts; '' when nothing is known. */
export function formatSpan(
  period:
    | { start?: string; end?: string; startYearOnly?: boolean; endYearOnly?: boolean }
    | undefined,
  present: string,
  separator = '–',
): string {
  // A date the CV gave only as a year is written as that year: "2015", not
  // "2015-01", which a reader (or the model) would take for January.
  const start = period?.start && period.startYearOnly ? period.start.slice(0, 4) : period?.start
  const end = period?.end && period.endYearOnly ? period.end.slice(0, 4) : period?.end
  if (!start) return end ?? ''
  return `${start}${separator}${end ?? present}`
}
