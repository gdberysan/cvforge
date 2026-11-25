import { knownGaps } from '@/lib/ai/compose'
import { buildEntityIndex } from '@/lib/ai/projection'
import type { DocumentLanguage, EvidenceItem } from '@/lib/schemas'
import { BEATS, type PrepContent } from '@/lib/schemas/prep'
import { allowedQuantityForms, wholeWord } from '@/lib/verify/checks'
import {
  extractCounts,
  extractQuantities,
  extractYearSpans,
  normaliseQuantity,
  numbersIn,
} from '@/lib/verify/quantities'
import { recordedYears } from '@/lib/verify/sections'
import { findTells } from '@/lib/verify/tells'
import type { PrepContext } from './context'

export type PrepFlag = {
  /** Where: `stories.s2.result`, `cvDefense.b8`, `gapAnswers.g1.bridge`… */
  path: string
  kind:
    | 'uncited'
    | 'number'
    | 'gap'
    | 'distortion'
    | 'placement'
    | 'overlooked'
    | 'duration'
    | 'inflation'
    | 'link'
  reason: string
}

/** Style notes, kept apart from grounding flags: a cliché is not a lie. */
export type PrepTell = { path: string; phrases: string[] }

export type PrepReport = { flags: PrepFlag[]; tells: PrepTell[]; passed: boolean }

/** A spoken line that states facts, with what it stands on. */
export type FactLine = { path: string; text: string; citedEvidenceIds: string[]; gapCheck: boolean }

/** Every line of the prep that makes a factual claim. `admit`/`plan` speak about the gap by design. */
export function factLines(content: PrepContent): FactLine[] {
  return [
    ...content.stories.flatMap((s) =>
      BEATS.map((b) => ({ path: `stories.${s.id}.${b}`, ...s[b], gapCheck: true })),
    ),
    ...content.cvDefense.map((d) => ({
      path: `cvDefense.${d.bulletId}`,
      ...d.facts,
      gapCheck: true,
    })),
    ...content.gapAnswers.map((g) => ({
      path: `gapAnswers.${g.id}.bridge`,
      ...g.bridge,
      gapCheck: true,
    })),
    // The short version is what he glances at in the room: it stands on the
    // records its story's beats cite, and is checked like them.
    ...content.stories.flatMap((s) => {
      const cites = [...new Set(BEATS.flatMap((b) => s[b].citedEvidenceIds))]
      return s.short.map((text, i) => ({
        path: `stories.${s.id}.short.${i}`,
        text,
        citedEvidenceIds: cites,
        gapCheck: true,
      }))
    }),
  ]
    .filter((l) => l.text.trim() !== '')
    .map(({ path, text, citedEvidenceIds, gapCheck }) => ({
      path,
      text,
      citedEvidenceIds,
      gapCheck,
    }))
}

/**
 * A whole year said of time that was not one: "in 2025 I spent the year as a
 * consultant" for a role of eight months (audit 2026-11-24).
 */
const YEAR_CLAIM =
  /\b(?:spent|for|throughout|over|during)\s+(?:the|that|a|all of the|the whole|the entire|a full|a whole)\s+(?:whole\s+|entire\s+|full\s+)?year\b|\ball\s+(?:of\s+)?(?:20\d\d|that year)\b|\b(?:pasé|estuve|trabajé|viví)\s+(?:todo\s+)?(?:el|un|ese)\s+año\b|\btodo\s+(?:el\s+)?(?:año|20\d\d)\b/iu

/**
 * Ownership said in his voice that none of the line's records states:
 * "owned the budget" over a record of executing it. Each
 * family: the words that claim it in the line, and the wider set of words
 * that, in a record, earn it.
 */
const ESCALATIONS: { word: string; said: RegExp; earned: RegExp }[] = [
  {
    word: 'owned',
    said: /\b(?:owned|owning|ownership|owns)\b|\bdueñ[oa]s?\b/iu,
    earned: /\bown(?:ed|ing|ership|s)?\b|\bdueñ|\bpropi[oa]s?\b|\bresponsab/iu,
  },
  {
    word: 'led',
    said: /\bled\b|\bI lead\b|\blider(?:é|aba|o|ando|ar)\b|\bencabec/iu,
    earned:
      /\bl[ie]d(?:er|ere|eraba|eré|ar|ando)?\b|\blead|\blider|\bencabec|\ba cargo\b|\bequipo\b|\bteam\b/iu,
  },
  {
    word: 'managed',
    said: /\bmanaged\b|\bI manage\b|\bgestion(?:é|aba)\b|\badministr(?:é|aba)\b/iu,
    earned: /\bmanag|\bgestion|\badministr|\bmanej|\ba cargo\b|\bresponsab/iu,
  },
  {
    word: 'ran',
    said: /\b(?:ran|running|run)\s+(?:the|a|my|its|that)\s+(?:\S+\s+){0,2}budget\b/iu,
    earned: /\bran\b|\brun\b|\bmanej|\bgestion|\badministr|\bpropi[oa]\b|\bown/iu,
  },
  {
    word: 'headed',
    said: /\bheaded\b|\bdirected\b|\bdirig(?:í|ía)\b|\bestuve a cargo\b/iu,
    earned: /\bhead|\bdirect|\bdirig|\ba cargo\b|\bresponsab/iu,
  },
]

/**
 * Two records joined by a link neither states: "Sacaba reportes del CRM. Con
 * eso armé un tablero" (audit 2026-11-24, four times across two preps). True
 * facts, invented relation.
 */
const LINK =
  /\b(?:con eso|con ellos|con ellas|con esos datos|de ahí (?:salió|nació|vino|surgió)|a partir de (?:eso|ahí|ellos)|gracias a (?:eso|ello)|sobre eso|lo que (?:permitió|llevó)|eso (?:permitió|llevó)|para (?:los|esos) datos|esos datos (?:alimentaban|alimentaron|servían)|que alimentaban?)\b|\b(?:on top of (?:that|this|it|those|them)|built (?:it )?on (?:that|those|them)|from (?:that|those) (?:data|reports)|which (?:let|allowed|led)|that(?:'s| is) how|thanks to (?:that|this|those)|as a result)\b/iu

/** Problems a line's wording makes beyond its figures: a year that wasn't, a raised verb, an invented link. */
function wordingFlags(
  line: FactLine,
  cited: EvidenceItem[],
  months: Map<string, number>,
): PrepFlag[] {
  const flags: PrepFlag[] = []
  const year = line.text.match(YEAR_CLAIM)?.[0]
  if (year) {
    const roles = cited
      .filter((r) => r.sourceRef.type === 'experience')
      .map((r) => months.get(r.sourceRef.id) ?? 0)
    const shortest = roles.length > 0 ? Math.min(...roles) : 0
    if (shortest < 12)
      flags.push({
        path: line.path,
        kind: 'duration',
        reason: `"${year}" is longer than the role: ${shortest > 0 ? `${shortest} months on record` : 'no period on record'}; say the months`,
      })
  }
  const recordText = cited.map((r) => r.text).join('\n')
  for (const e of ESCALATIONS) {
    const said = line.text.match(e.said)?.[0]
    if (said && !e.earned.test(recordText))
      flags.push({
        path: line.path,
        kind: 'inflation',
        reason: `"${said}" says more than its records; use the verb they use`,
      })
  }
  const link = line.text.match(LINK)?.[0]
  if (
    link &&
    line.citedEvidenceIds.length >= 2 &&
    !recordText.toLowerCase().includes(link.toLowerCase())
  )
    flags.push({
      path: line.path,
      kind: 'link',
      reason: `"${link}" joins records that never say one led to the other; tell them side by side`,
    })
  return flags
}

/** His answers as records the checks can cite: his own words, nothing more. */
export function answerRecords(ctx: PrepContext): EvidenceItem[] {
  return ctx.answers.map((a) => ({
    id: `answer:${a.id}`,
    kind: 'achievement',
    sourceRef: { type: 'experience', id: '' },
    text: `In his own words, asked "${a.question}": ${a.answer}`,
    metrics: [],
    tags: [],
    period: { start: (a.createdAt || '2000-01').slice(0, 7) },
    strength: 'supporting',
    origin: 'interview',
  }))
}

/**
 * The code half of the promise, the same rules a CV meets: a fact cites
 * something; a figure is one its sources record (values, not digit strings);
 * a requirement mapped to nothing is never claimed; project work is never
 * told as done at an employer.
 */
export function checkPrepInCode(content: PrepContent, ctx: PrepContext): PrepFlag[] {
  const records = new Map([...ctx.evidence, ...answerRecords(ctx)].map((e) => [e.id, e]))
  // A requirement one of his records names is not a gap, whatever the
  // mapping said: claiming it is then the truth, not an invention.
  const gaps = [
    ...knownGaps(
      ctx.requirements.filter((r) => !ctx.mentionedIn.has(r.id)),
      ctx.requirements.flatMap((r) => (r.mapping ? [r.mapping] : [])),
    ),
  ]
  const employers = ctx.profile.experience.map((r) => r.company).filter((c) => c.trim().length > 1)
  const flags: PrepFlag[] = []
  // For figures an answer is the answer alone. Its record's text carries the
  // question too (for the model's context), and a figure only the question
  // named — "¿Subiste el ROAS 30%?" / "sí" — must ground nothing.
  const answerOnly = new Map(ctx.answers.map((a) => [`answer:${a.id}`, a.answer]))
  const forFigures = (r: EvidenceItem): EvidenceItem => {
    const answer = answerOnly.get(r.id)
    return answer === undefined ? r : { ...r, text: answer }
  }
  const statedIn = (records: EvidenceItem[]) =>
    numbersIn(
      records
        .flatMap((r) => [r.text, ...r.metrics.map((m) => `${m.raw} ${m.value ?? ''}`)])
        .join('\n'),
    )
  // A span of years may not exceed the time on record, as on a CV.
  const careerYears = Math.round(recordedYears(ctx.profile.experience.map((r) => r.period)))
  const badSpan = (text: string, stated: Set<number>) =>
    extractYearSpans(text).find((y) => y > careerYears && !stated.has(y))

  for (const line of factLines(content)) {
    const cited = line.citedEvidenceIds.flatMap((id) => {
      const r = records.get(id)
      return r ? [r] : []
    })
    if (cited.length === 0) {
      flags.push({ path: line.path, kind: 'uncited', reason: 'no record behind this line' })
      continue
    }
    const figures = cited.map(forFigures)
    const allowed = allowedQuantityForms(figures)
    const badQuantity = extractQuantities(line.text).find((t) => !allowed.has(normaliseQuantity(t)))
    const stated = statedIn(figures)
    const badCount = extractCounts(line.text).find((n) => !stated.has(n))
    const badYears = badSpan(line.text, stated)
    if (badQuantity !== undefined || badCount !== undefined || badYears !== undefined) {
      flags.push({
        path: line.path,
        kind: 'number',
        reason: `${badQuantity ?? badCount ?? badYears} is not in its records`,
      })
    }
    if (line.gapCheck) {
      const claimed = gaps.find(([keyword]) => wholeWord(keyword).test(line.text))
      if (claimed)
        flags.push({
          path: line.path,
          kind: 'gap',
          reason: `claims "${claimed[0]}", which nothing on file shows`,
        })
    }
    flags.push(...wordingFlags(line, cited, ctx.months))
    const onlyProjects = cited.every((r) => r.sourceRef.type === 'project')
    const employer = onlyProjects ? employers.find((c) => wholeWord(c).test(line.text)) : undefined
    if (employer)
      flags.push({
        path: line.path,
        kind: 'placement',
        reason: `own project told as work at ${employer}`,
      })
  }
  flags.push(...overlookedRecords(content, ctx))
  const everything = [...records.values()].map(forFigures)
  const allowedAll = allowedQuantityForms(everything)
  const statedAll = statedIn(everything)
  for (const line of uncitedLines(content)) {
    const badQuantity = extractQuantities(line.text).find(
      (t) => !allowedAll.has(normaliseQuantity(t)),
    )
    const badCount = extractCounts(line.text).find((n) => !statedAll.has(n))
    const badYears = badSpan(line.text, statedAll)
    if (badQuantity !== undefined || badCount !== undefined || badYears !== undefined) {
      flags.push({
        path: line.path,
        kind: 'number',
        reason: `${badQuantity ?? badCount ?? badYears} is not in any of his records`,
      })
    }
  }
  return flags
}

/**
 * A gap answer that never touches the record naming the very thing it admits
 * lacking: "No tengo experiencia con SQL" while a BigQuery SQL record sits on
 * file. Using the record — in the bridge, or in a story instead of a gap
 * answer — clears it; whether it is then a gap is the model's call to make
 * with the record in front of it, not this check's.
 */
export function overlookedRecords(content: PrepContent, ctx: PrepContext): PrepFlag[] {
  const keywordOf = new Map(ctx.requirements.map((r) => [r.id, r.keyword]))
  return content.gapAnswers.flatMap((g) => {
    const naming = ctx.mentionedIn.get(g.requirementId) ?? []
    if (naming.length === 0 || naming.some((id) => g.bridge.citedEvidenceIds.includes(id)))
      return []
    return [
      {
        path: `gapAnswers.${g.id}.admit`,
        kind: 'overlooked' as const,
        reason: `your record ${naming.join(', ')} names "${keywordOf.get(g.requirementId)}"; tell what it shows instead of admitting none`,
      },
    ]
  })
}

/**
 * Lines that cite nothing by design — the admission, the plan, the note on
 * an empty beat, the note on the interviewer — still may not carry a number
 * his records lack (spec §Verification): checked against everything on file.
 */
function uncitedLines(content: PrepContent): { path: string; text: string }[] {
  return [
    ...content.gapAnswers.flatMap((g) => [
      { path: `gapAnswers.${g.id}.admit`, text: g.admit },
      { path: `gapAnswers.${g.id}.plan`, text: g.plan },
    ]),
    ...content.stories.flatMap((s) =>
      BEATS.map((b) => ({ path: `stories.${s.id}.${b}.ask`, text: s[b].ask })),
    ),
    { path: 'interviewerNote', text: content.interviewerNote },
  ].filter((l) => l.text.trim() !== '')
}

/** Every line he will say aloud, for the AI-tell check. */
function spokenLines(content: PrepContent): { path: string; text: string }[] {
  return [
    ...factLines(content),
    ...content.stories.flatMap((s) =>
      s.short.map((text, i) => ({ path: `stories.${s.id}.short.${i}`, text })),
    ),
    ...content.gapAnswers.flatMap((g) => [
      { path: `gapAnswers.${g.id}.admit`, text: g.admit },
      { path: `gapAnswers.${g.id}.plan`, text: g.plan },
    ]),
  ]
}

/**
 * The app's words in his mouth: nobody says "my record" about their own life,
 * and "no tengo registro de…" sounds like quoting a file (audit 2026-11-24).
 */
const RECORD_VOICE =
  /\b(?:no tengo registro|no tengo documentad[oa]s?|(?:en |según )?mi registro|lo que (?:sostiene|dice) mi registro|no lo tengo documentado|my record(?:s)?(?: shows?| says| does not show| doesn't show)?|on record|not documented|i have it documented)\b/giu

export function findPrepTells(
  content: PrepContent,
  language: DocumentLanguage,
  ctx?: PrepContext,
): PrepTell[] {
  const exempt = ctx ? buildEntityIndex(ctx.profile, ctx.evidence) : new Set<string>()
  return spokenLines(content).flatMap((l) => {
    const voice = [...l.text.matchAll(RECORD_VOICE)].map((m) => m[0].toLowerCase())
    const phrases = [...findTells(l.text, language, exempt), ...voice]
    return phrases.length > 0 ? [{ path: l.path, phrases }] : []
  })
}
