/**
 * The other names an employer writes under (spec 2026-10-17 mail accuracy
 * §4–5): "Pavo" applied to, "Pavo Pagos" in the subject, `pavo.mx` in the
 * sender. The job agent's mail pass ties a reply to the application when the
 * company OR any alias appears; an alias that is a domain matches the
 * sender's domain. Only the user writes these — nothing guesses them.
 *
 * An alias is a claim that mail from somewhere IS this employer, so a too-wide
 * one would tie unrelated mail to an application — an outcome the user never
 * had. Those are refused here (`aliasProblem`) and ignored again by the agent
 * (`usableAliases`), since the database is editable by hand. No runtime
 * imports: the satellite and the client bundle both read this file.
 */

export const MAX_ALIASES = 10
export const MAX_ALIAS_LENGTH = 80

/** Personal mail: anyone writes from these. */
export const FREE_MAIL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'yahoo.com.mx',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
]

/** Applicant-tracking systems and job boards: they carry every employer's mail. */
export const JOB_BOARD_ALIAS_DOMAINS = [
  'greenhouse.io',
  'greenhouse-mail.io',
  'lever.co',
  'hire.lever.co',
  'ashbyhq.com',
  'workablemail.com',
  'workable.com',
  'myworkday.com',
  'myworkdayjobs.com',
  'linkedin.com',
  'indeed.com',
  'occ.com.mx',
  'computrabajo.com',
]

/** Two-label public suffixes: `x.com.mx` is registrable, `com.mx` is not. */
const TWO_LABEL_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'com.mx',
  'org.mx',
  'net.mx',
  'gob.mx',
  'edu.mx',
  'com.br',
  'net.br',
  'org.br',
  'com.ar',
  'org.ar',
  'com.co',
  'org.co',
  'com.au',
  'net.au',
  'org.au',
  'com.es',
  'com.pe',
  'com.cl',
  'com.ec',
  'com.uy',
  'com.ve',
  'com.gt',
  'co.jp',
  'co.in',
  'co.nz',
  'co.za',
  'com.sg',
])

/**
 * One word that names a kind of company, not a company: "Talent" in a
 * subject or sender says nothing about which employer wrote.
 */
export const GENERIC_NAME_WORDS = new Set([
  'talent',
  'media',
  'growth',
  'marketing',
  'digital',
  'group',
  'global',
  'solutions',
  'partners',
  'consulting',
  'agency',
  'recruiting',
  'recruitment',
  'careers',
  'career',
  'jobs',
  'job',
  'team',
  'hr',
  'rh',
  'people',
  'hiring',
  'talento',
  'empleos',
  'empleo',
  'grupo',
  'soluciones',
  'consultores',
  'agencia',
  'reclutamiento',
  'services',
  'servicios',
  'tech',
  'labs',
  'studio',
  'company',
  'empresa',
])

/**
 * Legal forms, as folded word sequences, longest first. "The Northwind Talent
 * Co." and "The Northwind Talent Co" are one employer; so are "Pavo Limited"
 * and "Pavo".
 */
const LEGAL_SUFFIXES: string[][] = [
  's a p i de c v',
  'sapi de c v',
  'sapi de cv',
  's de r l de c v',
  's a de c v',
  'sa de c v',
  'sa de cv',
  's de r l',
  's a p i',
  's a',
  'sapi',
  'sa',
  'inc',
  'llc',
  'ltd',
  'limited',
  'co',
  'corp',
  'corporation',
  'gmbh',
  'ag',
  'bv',
  'sl',
  'sas',
]
  .map((s) => s.split(' '))
  .sort((a, b) => b.length - a.length)

/** Accents folded, lower-cased, every non-alphanumeric run a single space — the agent's own fold. */
export function foldWords(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * The name without a trailing legal form (and its punctuation), folded.
 * Never strips to nothing, nor to a single generic word: "Global Co." stays
 * "global co".
 */
export function companyCore(name: string): string {
  return stripLegal(foldWords(name).split(' ').filter(Boolean), true).join(' ')
}

function stripLegal(words: string[], keepGeneric: boolean): string[] {
  let out = words
  for (;;) {
    const suffix = LEGAL_SUFFIXES.find(
      (s) => s.length < out.length && s.every((w, i) => out[out.length - s.length + i] === w),
    )
    if (!suffix) return out
    const rest = out.slice(0, out.length - suffix.length)
    if (keepGeneric && rest.length === 1 && GENERIC_NAME_WORDS.has(rest[0] as string)) return out
    out = rest
  }
}

/** A domain alias has a dot and no whitespace: `pavo.mx`, not "Northwind Talent Co.". */
export function isDomainAlias(alias: string): boolean {
  return alias.includes('.') && !/\s/.test(alias)
}

const under = (domain: string, list: string[]) =>
  list.some((d) => domain === d || domain.endsWith(`.${d}`))

export type AliasProblem =
  | 'alias-free-mail'
  | 'alias-job-board'
  | 'alias-not-a-domain'
  | 'alias-too-short'
  | 'alias-generic'

/** Why an alias could tie mail that is not this employer's, or null when it cannot. */
export function aliasProblem(alias: string): AliasProblem | null {
  const a = alias.trim()
  if (isDomainAlias(a)) {
    const d = a.toLowerCase().replace(/\.$/, '')
    if (under(d, FREE_MAIL_DOMAINS)) return 'alias-free-mail'
    if (under(d, JOB_BOARD_ALIAS_DOMAINS)) return 'alias-job-board'
    const labels = d.split('.')
    if (labels.length < 2 || labels.some((l) => !/^[a-z0-9-]+$/.test(l)))
      return 'alias-not-a-domain'
    // A registrable label must stand before the public suffix.
    if (TWO_LABEL_SUFFIXES.has(labels.slice(-2).join('.')) && labels.length < 3) {
      return 'alias-not-a-domain'
    }
    return null
  }
  // Judged without its legal form: "Recruiting Ltd" is still just "recruiting".
  const words = stripLegal(foldWords(a).split(' ').filter(Boolean), false)
  if (words.join('').length < 4) return 'alias-too-short'
  if (words.length === 1 && GENERIC_NAME_WORDS.has(words[0] as string)) return 'alias-generic'
  return null
}

/** The aliases the agent may match on: trimmed, domains lower-cased, every problem one dropped. */
export function usableAliases(aliases: readonly unknown[] | undefined): string[] {
  const out: string[] = []
  for (const raw of aliases ?? []) {
    if (typeof raw !== 'string') continue
    const a = isDomainAlias(raw.trim()) ? raw.trim().toLowerCase() : raw.trim()
    if (a && aliasProblem(a) === null) out.push(a)
  }
  return out
}

export type AliasCode = 'invalid-request' | 'aliases-too-many' | 'alias-too-long' | AliasProblem

/**
 * Trimmed, blanks dropped, deduped case-insensitively (the first spelling
 * stays). A pasted address (`talent@pavo.mx`) or `@pavo.mx` keeps only its
 * domain, lower-cased like every domain. Refused, never truncated or quietly
 * dropped: a cut alias would match something the user did not write.
 */
export function normalizeAliases(
  input: unknown,
): { ok: true; aliases: string[] } | { ok: false; code: AliasCode } {
  if (!Array.isArray(input) || input.some((a) => typeof a !== 'string')) {
    return { ok: false, code: 'invalid-request' }
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of input as string[]) {
    let a = raw.trim()
    if (!/\s/.test(a) && a.includes('@')) a = a.slice(a.lastIndexOf('@') + 1)
    if (isDomainAlias(a)) a = a.toLowerCase()
    if (!a) continue
    if (a.length > MAX_ALIAS_LENGTH) return { ok: false, code: 'alias-too-long' }
    const problem = aliasProblem(a)
    if (problem) return { ok: false, code: problem }
    const key = a.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(a)
  }
  if (out.length > MAX_ALIASES) return { ok: false, code: 'aliases-too-many' }
  return { ok: true, aliases: out }
}

/** What the column holds, read defensively: anything but a list of strings is none. */
export function readAliases(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((a): a is string => typeof a === 'string') : []
}
