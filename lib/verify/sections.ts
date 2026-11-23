import { credentialSources } from '@/lib/ai/projection'
import type { CVContent, EvidenceItem, GroundingReport, MasterProfile } from '@/lib/schemas'
import {
  extractCounts,
  extractQuantities,
  extractYearSpans,
  normaliseQuantity,
  numbersIn,
} from './quantities'

/**
 * The code checks for everything on a CV that is not a bullet: the header
 * title, skills, education and extras. None of them cite anything, so each
 * is held to the record directly where code can judge it exactly — a known
 * gap named anywhere, a figure not on record, a degree or a year not on
 * file, a language above its recorded level, a header title that is nobody's.
 *
 * Whether a skill or a free-text extras line is supported is NOT decided
 * here: the composer paraphrases ("ROAS optimization") and translates, and
 * phrase matching flagged 5–19 honest skills on every real CV. Those lines
 * go to the model's distortion check instead (sectionLines), with the
 * person's own skills list and the evidence as sources. (The summary cites,
 * so it runs the bullet checks; name and contact lines are copied from the
 * profile and cannot drift.)
 */
export function checkSections(args: {
  cv: CVContent
  profile: MasterProfile
  evidence: EvidenceItem[]
  /** Keywords and variants of requirements mapped strong or partial: posting
   *  wording the evidence backs, which a CV may mirror. */
  supportedTerms: Set<string>
  /** A base CV's focus: it names a kind of role, and the CV may be headed with it. */
  targetTitle?: string
  /**
   * The title of the posting a tailored CV is for. Never its heading unless
   * the person has held it: at the top of a CV a title reads as one held, so
   * it goes in the summary, as the role sought.
   */
  soughtTitle?: string
  /** One test per known gap: [keyword, requirement text, whole-word matcher]. */
  gapMatchers: (readonly [string, string, RegExp])[]
  /** Every normalised quantity any evidence or credential records. */
  recordedQuantities: Set<string>
}): Pick<GroundingReport, 'unsupportedClaims' | 'claimedGaps' | 'unverifiedNumbers'> {
  const found: Pick<GroundingReport, 'unsupportedClaims' | 'claimedGaps' | 'unverifiedNumbers'> = {
    unsupportedClaims: [],
    claimedGaps: [],
    unverifiedNumbers: [],
  }
  const { cv, profile } = args
  const corpus = factCorpus(profile, args.evidence, args.supportedTerms)
  // Titles a heading may state: the person's own headline and the titles
  // they held, and a base CV's focus. Never the target titles they wish for.
  const heldTitles = [profile.basics.headline, ...profile.experience.map((r) => r.title)]
  const titles = fold([...heldTitles, args.targetTitle ?? ''].join('\n'))
  const credentialLines = [...credentialSources(profile).values()].join('\n')
  const years = recordedYears(profile.experience.map((r) => r.period))

  /** A known gap stated anywhere is the fabrication most likely to cost an offer. */
  const claimsGap = (section: string, text: string): boolean => {
    let hit = false
    for (const [keyword, requirementText, matcher] of args.gapMatchers) {
      if (!matcher.test(text)) continue
      found.claimedGaps.push({ bulletId: section, keyword, requirementText })
      hit = true
    }
    return hit
  }

  /** Numbers in a section line: only what the record states, or a span of years on record. */
  const checkNumbers = (section: string, text: string, allowed: Set<number>) => {
    for (const token of extractQuantities(text))
      if (!args.recordedQuantities.has(normaliseQuantity(token)))
        found.unverifiedNumbers.push({ bulletId: section, token })
    for (const count of extractCounts(text))
      if (!allowed.has(count))
        found.unverifiedNumbers.push({ bulletId: section, token: `${count}` })
    for (const span of extractYearSpans(text))
      if (span > Math.round(years))
        found.unverifiedNumbers.push({ bulletId: section, token: `${span}` })
  }
  const recordedNumbers = numbersIn(`${corpus}\n${credentialLines}`)

  // Header title — every part of it is one of the person's titles or
  // something they have on file ("Amazon Ads"), and never the posting's
  // title unless they held it: the specialty headline the composer writes.
  const title = cv.header.title.trim()
  const sought = args.soughtTitle?.trim() ?? ''
  const heldSought = sought !== '' && heldTitles.some((t) => sameJobTitle(t, sought))
  if (title && !claimsGap('title', title)) {
    checkNumbers('title', title, new Set())
    if (sought && !heldSought && hasPhrase(fold(title), sought)) {
      found.unsupportedClaims.push({ bulletId: 'title', text: sought })
    } else {
      for (const part of splitParts(title)) {
        if (!hasPhrase(titles, part) && !hasPhrase(corpus, part))
          found.unsupportedClaims.push({ bulletId: 'title', text: part })
      }
    }
  }

  for (const group of cv.skills) {
    for (const item of group.items) {
      if (!item.trim() || claimsGap('skills', item)) continue
      checkNumbers('skills', item, recordedNumbers)
      if (languageOnFile(profile, item) === false)
        found.unsupportedClaims.push({ bulletId: 'skills', text: item })
    }
  }

  for (const entry of cv.education) {
    const label = [entry.degree, entry.institution].filter((s) => s.trim()).join(' — ')
    if (!label) continue
    if (!educationOnFile(profile, entry))
      found.unsupportedClaims.push({ bulletId: 'education', text: label })
  }

  for (const group of cv.extras) {
    for (const line of group.lines) {
      if (!line.trim() || claimsGap('extras', line)) continue
      checkNumbers('extras', line, recordedNumbers)
      if (languageOnFile(profile, line) === false || degreeOutOfRecord(profile, line))
        found.unsupportedClaims.push({ bulletId: 'extras', text: line })
    }
  }

  return found
}

/**
 * One job title written two ways: case, accents, punctuation and the
 * gender marker a posting adds ("Coordinador(a)", "Gerente/a") aside.
 * "Coordinador(a) de Marketing Digital" is the title a person who was
 * "Coordinador de Marketing Digital" has held.
 */
export function sameJobTitle(a: string, b: string): boolean {
  const norm = (t: string) =>
    fold(t)
      .replace(/\((?:a|o|as|os|e|x)\)/g, '')
      .replace(/\/(?:a|o|as|os)\b/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  const x = norm(a)
  return x !== '' && x === norm(b)
}

/** Lower-case, accents off, whitespace collapsed: "Análisis" and "analisis" are one word. */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Whole-phrase containment on folded text — "SQL" is not found inside "SQLite". */
function hasPhrase(foldedHaystack: string, phrase: string): boolean {
  const needle = fold(phrase)
  if (needle.length < 2) return false
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(foldedHaystack)
}

/** "Google Ads / Meta Ads", "SQL (BigQuery)": a list in one line, judged part by part. */
function splitParts(text: string): string[] {
  return text
    .split(/\s*[,/;()·•|]\s*|\s+[–—-]\s+|\s+(?:y|and|e|&)\s+/i)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2)
}

/**
 * Everything the person has stated about themselves, folded into one text:
 * the profile, every evidence record and its tags, and the posting terms the
 * evidence was found to support. Target titles are deliberately absent —
 * they are where the person wants to go, not what they have done.
 */
function factCorpus(
  profile: MasterProfile,
  evidence: EvidenceItem[],
  supportedTerms: Set<string>,
): string {
  return fold(
    [
      profile.basics.headline,
      profile.basics.location,
      profile.summary,
      ...profile.experience.flatMap((r) => [r.title, r.company, r.location ?? '', r.summary]),
      ...profile.skills.flatMap((g) => g.items),
      ...profile.education.flatMap((e) => [e.degree, e.institution]),
      ...profile.certifications.flatMap((c) => [c.name, c.issuer]),
      ...profile.languages.flatMap((l) => languageNames(l.language)),
      ...profile.projects.flatMap((p) => [p.name, p.description, ...p.stack]),
      ...profile.workAuthorization.flatMap((w) => [w.country, w.status]),
      ...evidence.flatMap((e) => [e.text, ...e.tags, ...e.metrics.map((m) => m.raw)]),
      ...supportedTerms,
    ].join('\n'),
  )
}

/** The education record a CV entry prints: same institution, or with none recorded, same degree. */
export function educationRecordOf(
  profile: MasterProfile,
  entry: CVContent['education'][number],
): MasterProfile['education'][number] | undefined {
  const printed = fold(`${entry.degree} ${entry.institution}`)
  return profile.education.find((e) =>
    e.institution.trim()
      ? hasPhrase(printed, e.institution) || hasPhrase(fold(e.institution), entry.institution)
      : e.degree.trim() !== '' && hasPhrase(printed, e.degree),
  )
}

/**
 * How high a degree's wording says it is: 4 doctorate, 3 master's, 2
 * bachelor's, 1 below a bachelor's, 0 when the words do not say. English and
 * Spanish, since a CV may translate the record.
 */
export function degreeLevel(degree: string): number {
  const d = fold(degree)
  if (/\b(?:phd|ph\.d|doctor|doctorado|doctorate)\b/.test(d)) return 4
  if (
    /\b(?:maestria|master|masters|mba|msc|m\.sc|magister|mastere|posgrado|postgrado|postgraduate|especialidad|especializacion)\b/.test(
      d,
    )
  )
    return 3
  if (
    /\b(?:licenciatura|licenciado|licenciada|bachelor|bachelors|bachiller|grado|ingenieria|ingeniero|ingeniera|bsc|b\.sc|ba|bs)\b/.test(
      d,
    )
  )
    return 2
  if (/\b(?:tecnico|tecnica|tsu|associate|diplomado|diploma)\b/.test(d)) return 1
  return 0
}

/**
 * An education entry is one on file: it prints a recorded school (or degree)
 * at no higher level than recorded, and any year it prints is a year of that
 * record. Wording that differs from the record (a translation) is judged by
 * the model (`verifiableLines`); a raised level is decided here. A
 * certification the composer filed under education is on file too.
 */
function educationOnFile(profile: MasterProfile, entry: CVContent['education'][number]): boolean {
  const printed = fold(`${entry.degree} ${entry.institution}`)
  const years = entry.period.match(/\b(?:19|20)\d{2}\b/g) ?? []
  const record = educationRecordOf(profile, entry)
  if (record) {
    // The school alone used to pass the entry, whatever degree it printed.
    const recorded = degreeLevel(record.degree)
    if (recorded > 0 && degreeLevel(entry.degree) > recorded) return false
    const onRecord = [record.period?.start, record.period?.end]
      .filter((m): m is string => Boolean(m))
      .map((m) => m.slice(0, 4))
    return years.every((y) => onRecord.includes(y))
  }
  return profile.certifications.some((c) => hasPhrase(printed, c.name))
}

const LEVEL_RANK: Record<string, number> = { a1: 1, a2: 2, b1: 3, b2: 4, c1: 5, c2: 6, native: 7 }

/** The highest level a line claims, by CEFR code or by word. */
function claimedLevel(foldedLine: string): number {
  if (/nativ|materna|bilingu/.test(foldedLine)) return 7
  const cefr = foldedLine.match(/(?<![a-z0-9])([abc][12])(?![a-z0-9])/)
  if (cefr) return LEVEL_RANK[cefr[1]]
  if (/fluid|fluent|avanzad|advanced|profici/.test(foldedLine)) return 5
  if (/intermedi/.test(foldedLine)) return 3
  return 0
}

const LANGUAGE_ALIASES: string[][] = [
  ['ingles', 'english'],
  ['espanol', 'spanish', 'castellano'],
  ['frances', 'french'],
  ['aleman', 'german'],
  ['portugues', 'portuguese'],
  ['italiano', 'italian'],
  ['chino', 'chinese', 'mandarin'],
  ['japones', 'japanese'],
  ['coreano', 'korean'],
]

/** A language as either product language names it: "Inglés" is also "English". */
function languageNames(language: string): string[] {
  const folded = fold(language)
  return LANGUAGE_ALIASES.find((names) => names.includes(folded)) ?? [folded]
}

/** One language and the level beside it: "Español (nativo), Inglés (C1)" is two. */
const LANGUAGE_SEPARATOR = /[,;·|/•]|\s(?:y|e|and)\s/

/**
 * Whether a line naming a language is on file: true when every language it
 * names is on file at or below the recorded level, false when one is above
 * it ("Inglés C2" over a recorded B2 is an inflated claim, not a
 * translation) or not on file at all, and undefined when the line names no
 * language. Each language is judged by the level printed beside it, never by
 * another's: "nativo" belongs to Spanish, not to the English next to it.
 */
function languageOnFile(profile: MasterProfile, line: string): boolean | undefined {
  let named = false
  for (const chunk of fold(line).split(LANGUAGE_SEPARATOR)) {
    const onFile = profile.languages.filter((l) =>
      languageNames(l.language).some((name) => hasPhrase(chunk, name)),
    )
    const covered = new Set(onFile.flatMap((l) => languageNames(l.language)))
    const unrecorded = LANGUAGE_ALIASES.some(
      (names) => names.some((name) => hasPhrase(chunk, name)) && !names.some((n) => covered.has(n)),
    )
    if (unrecorded) return false
    if (onFile.length === 0) continue
    named = true
    const claimed = claimedLevel(chunk)
    if (onFile.some((l) => claimed > LEVEL_RANK[l.level.toLowerCase()])) return false
  }
  return named ? true : undefined
}

/** An extras line that reads as a degree ("MBA", "Maestría en…") the record does not hold. */
function degreeOutOfRecord(profile: MasterProfile, line: string): boolean {
  const folded = fold(line)
  if (!/\b(?:mba|maestria|master|licenciatura|bachelor|doctorado|phd|ingenieria en)\b/.test(folded))
    return false
  return (
    !profile.education.some(
      (e) =>
        (e.degree.trim() && hasPhrase(folded, e.degree)) ||
        (e.institution.trim() && hasPhrase(folded, e.institution)),
    ) && !profile.certifications.some((c) => hasPhrase(folded, c.name))
  )
}

/**
 * The section lines the model's distortion check judges, since code cannot
 * tell a paraphrase from an invention: every skill, and every extras line
 * that is not a credential or language the code already checked. Each is one
 * candidate whose sources are the person's own skills list and the evidence.
 */
export function sectionLines(
  cv: CVContent,
  profile: MasterProfile,
): { id: string; text: string }[] {
  const skills = cv.skills
    .filter((g) => g.items.some((i) => i.trim()))
    .map((g) => `${g.category}: ${g.items.join('; ')}`)
  const extras = cv.extras.flatMap((g) =>
    g.lines
      .filter((line) => line.trim() && !onlyCredential(profile, line))
      .map((line) => `${g.heading}: ${line}`),
  )
  return [
    ...(skills.length > 0 ? [{ id: 'skills', text: skills.join('\n') }] : []),
    ...(extras.length > 0 ? [{ id: 'extras', text: extras.join('\n') }] : []),
  ]
}

/** A certification, degree or language on file — checked in code, no model needed. */
function namesCredential(profile: MasterProfile, line: string): boolean {
  const folded = fold(line)
  return (
    languageOnFile(profile, line) !== undefined ||
    profile.certifications.some(
      (c) => hasPhrase(folded, c.name) || hasPhrase(fold(c.name), line),
    ) ||
    profile.education.some((e) => e.degree.trim() !== '' && hasPhrase(folded, e.degree))
  )
}

// What a bare credential line is made of besides the credential itself.
const CREDENTIAL_WORDS = new Set(
  (
    'certificado certificada certificacion certificaciones certification certifications ' +
    'certified certificate credential credencial idioma idiomas language languages ' +
    'educacion formacion education degree titulo nivel level lengua materna native nativo ' +
    'nativa bilingue bilingual fluido fluida fluent avanzado avanzada advanced intermedio ' +
    'intermedia intermediate basico basica basic profesional professional proficiency ' +
    'a1 a2 b1 b2 c1 c2 de del en in of the el la los las y e and por by'
  ).split(' '),
)

/**
 * Whether the line is only credentials: with every certification (and its
 * issuer), degree, institution and language on file taken out, along with
 * levels, dates and punctuation, nothing is left. Anything left is a claim
 * code does not check — "usada para auditar cuentas Fortune 500" — so the
 * line goes to the model like any other.
 */
function onlyCredential(profile: MasterProfile, line: string): boolean {
  if (!namesCredential(profile, line)) return false
  let rest = ` ${fold(line)} `
  const phrases = [
    ...profile.certifications.flatMap((c) => [c.name, c.issuer]),
    ...profile.education.flatMap((e) => [e.degree, e.institution]),
    ...profile.languages.flatMap((l) => languageNames(l.language)),
  ]
    .map((p) => fold(p))
    .filter((p) => p.length >= 2)
    .sort((a, b) => b.length - a.length)
  for (const p of phrases) {
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    rest = rest.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'gu'), ' ')
  }
  return rest
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .every((word) => CREDENTIAL_WORDS.has(word) || /^\d+$/.test(word))
}

/**
 * Years of work on record: the union of the given periods, so overlapping
 * roles are not counted twice and a gap between them is not counted at all.
 */
export function recordedYears(
  periods: { start?: string; end?: string }[],
  now: Date = new Date(),
): number {
  const current = now.getUTCFullYear() * 12 + now.getUTCMonth()
  const months = new Set<number>()
  for (const p of periods) {
    if (!p.start) continue
    const from = monthIndex(p.start)
    const to = p.end ? monthIndex(p.end) : current
    for (let m = from; m <= to && m - from < 1200; m++) months.add(m)
  }
  return months.size / 12
}

function monthIndex(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return y * 12 + ((m || 1) - 1)
}
