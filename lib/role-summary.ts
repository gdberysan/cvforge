/**
 * "De qué trata el puesto" (spec 2026-10-17 §2): two or three lines of the
 * posting's own words, taken from the stored text — no model call, nothing
 * paraphrased. The first paragraph of at least MIN characters that is not
 * boilerplate, clipped at a sentence end to at most MAX. When nothing
 * qualifies the answer is null and the block is left out: a thin or padded
 * summary is worse than none.
 *
 * Verbatim, strictly: the answer is always a substring of one input line,
 * trimmed only at its ends. Nothing is inserted, collapsed or repaired.
 */

import { companyCore } from '@/lib/company-aliases'

const MIN = 80
const MAX = 280

/**
 * Company, legal, perks and how-to-apply copy: true of every posting, about
 * no role.
 */
const BOILERPLATE =
  /about us|sobre nosotros|equal opportunity|igualdad de oportunidades|benefits|beneficios|apply|postula/i

/**
 * Pay lines, in any wording: the overview prints a salary only from a stored
 * field, never lifted out of a paragraph. A currency sign before a digit or
 * a USD/MXN amount counts, whatever the words around it.
 */
const PAY =
  /compensation|compensaci[oó]n|base pay|pay range|salary|salario|sueldo|remuneraci[oó]n|[$€£]\s?\d|\d\s?(USD|MXN)\b|\b(USD|MXN)\s?\$?\d/i

/**
 * A heading that opens a section about the company rather than the role
 * ("About Pinecrest Studio", "Sobre Acme", "Quiénes somos"): the paragraph under it
 * describes the employer, so the whole section is skipped, not just the line.
 * Only ever tested against a heading line (see `isCompanyHeading`), so a
 * sentence like "About 40% of your time…" never opens one.
 */
const COMPANY_HEADING =
  /^(about|sobre|acerca de|qui[eé]nes somos|who we are|our company|nuestra empresa)\b/i

/**
 * A heading that opens the role itself ("About the job", "The Role", "Sobre
 * el puesto"), matched only as the whole line, optionally ending in ":".
 * Checked before COMPANY_HEADING, which "About the job" would otherwise
 * match. Never cut out of a sentence: "The role reports to the CMO" stays
 * whole.
 */
const ROLE_HEADING =
  /^(about (the|this) (job|role|position|opportunity)|the (role|job|position|opportunity)|role overview|job (description|summary)|position summary|(sobre|acerca) (del?|el) (puesto|empleo|rol|la vacante)|el (puesto|rol)|descripci[oó]n del puesto)\s*:?$/i

/**
 * The same heading words pasted onto their paragraph with no break: "The
 * RoleAs a…", "About Marea SocialMarea Social is…". The heading ends where a
 * lowercase letter runs straight into a capital within the first words.
 * Such a line is skipped whole — never trimmed — and still moves the
 * section on (role: the company section ends; company: it begins).
 */
const GLUED_ROLE_WORDS =
  /^(about (the|this) (job|role|position|opportunity)|the (role|job|position|opportunity)|sobre el puesto|el puesto)/i
/** The capital is checked without /i, or "The positioning…" would read as "The position" + "ing". */
const gluedRole = (line: string) => {
  const m = GLUED_ROLE_WORDS.exec(line)
  return m !== null && /^[A-ZÁÉÍÓÚÑ¿¡]/.test(line.slice(m[0].length))
}
/**
 * A company heading glued on: within the first six words a lowercase letter
 * runs into a capital, and the word starting there repeats a word of the
 * heading ("About Marea SocialMarea Social is…"). The repeat is what tells a
 * paste from a brand: "About our McDonald's account:" is a sentence.
 */
function gluedCompany(line: string): boolean {
  if (!COMPANY_HEADING.test(line)) return false
  const join = /^((?:\S+\s+){0,5}\S*?[a-záéíóúñ])([A-ZÁÉÍÓÚÑ][\p{L}]*)/u.exec(line)
  if (!join) return false
  const head = (join[1] ?? '').toLowerCase().split(/[^\p{L}]+/u)
  return head.includes((join[2] ?? '').toLowerCase())
}

/**
 * A short line that reads as a heading: at most six words, no sentence end.
 * "About Pinecrest Studio" is one; "About 40% of your time is client work." is not.
 */
const isCompanyHeading = (line: string) =>
  COMPANY_HEADING.test(line) && line.split(/\s+/).length <= 6 && !/[.!?]["'”’)]?$/.test(line)

/**
 * The opener of a paragraph about the employer rather than the role: "We
 * are passionate about…", "Somos una empresa…", "Our mission is…". "We are
 * looking for / hiring / seeking…" is the role and is kept.
 */
const SELF_OPENER = /^(we are|we['’]re|somos|our mission|nuestra misi[oó]n)\b/i
/** What a company does when the sentence is about the job: "Acme is hiring a…". */
const HIRING =
  /^\s*(?:(?:currently|now|actively)\s+)?(?:hiring|looking|seeking|searching|recruiting|buscando|busca|contratando|en b[uú]squeda)\b/i
/**
 * Openers that name the company: "At Lumen Metrics," / "En Lumen Metrics," / "When you
 * join Lumen Metrics," / "Al unirte a Lumen Metrics,", then "Lumen Metrics is" / "Lumen Metrics es".
 */
const AT_COMPANY = /^(?:at|en|when you join|al unirte a)\s+([^,]{1,80}),/i
const COMPANY_IS = /\s(?:is|es)\b/gi

/**
 * True when the line opens like company copy (spec: Lumen Metrics's "At Lumen Metrics,
 * we are passionate about our work to power a better media future…"). The
 * company is compared by `companyCore` — case, accents and a legal suffix
 * ignored — and only at the very start of the line: a role paragraph that
 * merely mentions the company mid-sentence is kept.
 */
function opensAboutCompany(line: string, core: string): boolean {
  const self = SELF_OPENER.exec(line)
  if (self && !HIRING.test(line.slice(self[0].length))) return true
  if (!core) return false
  const at = AT_COMPANY.exec(line)
  if (at && companyCore(at[1] ?? '') === core) return true
  // Every " is"/" es" in the first 100 characters: the name may itself be
  // several words ("Grupo Bimbo, S.A. de C.V. es…").
  for (const m of line.slice(0, 100).matchAll(COMPANY_IS)) {
    if (companyCore(line.slice(0, m.index)) !== core) continue
    return !HIRING.test(line.slice(m.index + m[0].length))
  }
  return false
}

/** A list item reads as one requirement, not as what the job is. */
const BULLET = /^([-•*·–—▪◦]|\d+[.)])\s/

/** A short line with no sentence in it: a heading ("The Role", "¿Qué vas a hacer?"). */
const isHeading = (line: string) => line.length <= 60 && !/[.]["'”’)]?$/.test(line)

/** Words a period follows without ending the sentence. */
const ABBREVIATIONS = new Set([
  'e.g.',
  'i.e.',
  'etc.',
  'inc.',
  'ltd.',
  'co.',
  'corp.',
  'sr.',
  'sra.',
  'jr.',
  'no.',
  'approx.',
  'aprox.',
  'vs.',
  'dept.',
  'mr.',
  'mrs.',
  'ms.',
  'dr.',
  'dra.',
  'p.ej.',
  'ej.',
  'ph.d.',
  // Spanish titles and addresses: "Lic. en Mercadotecnia", "Ing. Ramírez".
  'lic.',
  'ing.',
  'mtro.',
  'mtra.',
  'arq.',
  'srta.',
  'col.',
  'av.',
  'st.',
  'núm.',
  // Months, English and Spanish.
  'jan.',
  'feb.',
  'mar.',
  'apr.',
  'jun.',
  'jul.',
  'aug.',
  'sep.',
  'sept.',
  'oct.',
  'nov.',
  'dec.',
  'ene.',
  'abr.',
  'may.',
  'ago.',
  'dic.',
])

/**
 * True when the period at `at` closes an abbreviation rather than a
 * sentence: a listed word ("e.g.", "Inc.", "Sr."), or initials — one letter
 * or a run of them ("J.", "S.A.", "C.V.", "U.S.").
 */
function isAbbreviation(text: string, at: number): boolean {
  if (text[at] !== '.') return false
  let start = at
  while (start > 0 && !/[\s("'“¿¡]/.test(text[start - 1] ?? '')) start--
  const token = text.slice(start, at + 1)
  return ABBREVIATIONS.has(token.toLowerCase()) || /^([A-Za-zÁÉÍÓÚÑáéíóúñ]\.)+$/.test(token)
}

type End = { at: number; glued: boolean }

/**
 * Sentence ends, as indices just after them. A period, ! or ? (with any
 * closing quote or bracket) followed by whitespace or the end of the line.
 * Never an end: an abbreviation or initials ("e.g.", "Lic.", "S.A. de
 * C.V.", "U.S."), or a period followed by a lowercase word ("Lic. en",
 * "Ph.D. in") — a sentence does not start in lowercase.
 *
 * A glued end ("engines.We", a paste artefact) counts only when at least two
 * lowercase letters come before the period and a capital then a lowercase
 * letter after it — so "Ph.D.", "Node.JS" and "Vue.JS" never split.
 */
function sentenceEnds(text: string): End[] {
  const ends: End[] = []
  const re = /[.!?…]["'”’)\]]*/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const at = m.index + m[0].length
    if (isAbbreviation(text, m.index)) continue
    const after = text.slice(at)
    if (after === '') {
      ends.push({ at, glued: false })
    } else if (/^\s/.test(after)) {
      if (m[0][0] === '.' && /^\s+[a-záéíóúñü]/.test(after)) continue
      ends.push({ at, glued: false })
    } else if (
      /[a-záéíóúñü]{2}$/.test(text.slice(0, m.index)) &&
      /^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]/.test(after)
    ) {
      ends.push({ at, glued: true })
    }
  }
  return ends
}

/**
 * The longest run of whole sentences that fits MAX; null when the first
 * sentence alone does not. A glued end closes the run: the next sentence
 * would print as "engines.We", and inserting the missing space would change
 * the posting's text.
 */
function clip(line: string): string | null {
  let end: number | undefined
  for (const e of sentenceEnds(line)) {
    if (e.at > MAX) break
    end = e.at
    if (e.glued) break
  }
  return end === undefined ? null : line.slice(0, end).trim()
}

/**
 * `company` is the application's or find's company name; with it, a
 * paragraph that opens "At <Company>," or "<Company> is…" is skipped as
 * company copy. Without it only the company-agnostic openers apply.
 */
export function roleSummary(postingRaw: string, company = ''): string | null {
  const core = company.trim() ? companyCore(company) : ''
  let inCompanySection = false
  for (const raw of postingRaw.split(/\r?\n/)) {
    // Trimmed, never collapsed: what is returned must be the line's own text.
    const line = raw.trim()
    if (!line) continue
    // Read with whitespace collapsed (a pasted double space must not hide a
    // heading); `line` itself is what gets clipped and returned.
    const flat = line.replace(/\s+/g, ' ')
    if (ROLE_HEADING.test(flat) || gluedRole(flat)) {
      inCompanySection = false
      continue
    }
    if (gluedCompany(flat)) {
      inCompanySection = true
      continue
    }
    if (isHeading(flat)) {
      inCompanySection = isCompanyHeading(flat) || BOILERPLATE.test(flat) || PAY.test(flat)
      continue
    }
    if (
      inCompanySection ||
      line.length < MIN ||
      BULLET.test(flat) ||
      BOILERPLATE.test(flat) ||
      PAY.test(flat) ||
      opensAboutCompany(flat, core)
    ) {
      continue
    }
    const summary = clip(line)
    if (summary && summary.length >= MIN) return summary
  }
  return null
}
