/**
 * Spec §12 gate 4 — prompt regression evals. The snapshot is what a prompt
 * produced on a real posting the day it was judged good; the diff says
 * whether a later prompt is better, or merely different. Keywords are the
 * unit of comparison because they are what mapping and coverage consume.
 *
 * Comparison is deliberately fuzzy in one direction only. The 2026-09-05
 * baseline run drifted 3 of 6 fixtures almost entirely on wording — `Webhooks
 * & APIs` vs `Webhooks and APIs`, `Google Merchant Center` vs `Merchant
 * Center` — and a gate that cries wolf is a gate that gets ignored. So a
 * requirement whose words are a subset of another's is the SAME requirement
 * (reported in `renamed`, never silently), while two that merely share a word
 * are not: `Google Ads` and `YouTube Ads` stay distinct.
 */
export type ReqSnapshot = { keyword: string; kind: string; mandatory: boolean }

export type ExtractionDiff = {
  matched: number
  /** In the snapshot, absent now — the new prompt dropped a requirement. */
  missing: string[]
  /** Absent from the snapshot, present now — the new prompt found (or invented) one. */
  added: string[]
  /** Same requirement, reworded. Not a regression, but never hidden either. */
  renamed: { was: string; now: string }[]
  /** Same requirement, mandatory flag flipped — this alone can move a verdict. */
  mandatoryFlips: string[]
  /** Same requirement, kind flipped — gating kinds are judged differently. */
  kindFlips: { keyword: string; was: string; now: string }[]
  /** |∩| / |∪| over requirements; 1 when both are empty. */
  jaccard: number
}

/** Words too weak to carry a match on their own: "Experience" is not a requirement. */
const GENERIC = new Set([
  'a',
  'an',
  'and',
  'or',
  'of',
  'the',
  'in',
  'on',
  'to',
  'for',
  'with',
  'experience',
  'years',
  'year',
  'skills',
  'skill',
  'knowledge',
  'ability',
  'strong',
  'plus',
  'level',
  'proficiency',
  'background',
])

const tokenize = (k: string): string[] =>
  k
    .toLowerCase()
    .replace(/&/g, ' and ')
    // "+" and "#" are part of a name: C, C++ and C# used to canonicalise to
    // the same key, so a prompt swapping one for another passed the gate.
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

/** `Webhooks & APIs` and `Webhooks and APIs` are the same string here. */
const canon = (k: string) => tokenize(k).join(' ')

const isSubset = (small: Set<string>, big: Set<string>) => [...small].every((t) => big.has(t))
const carriesMeaning = (s: Set<string>) => [...s].some((t) => !GENERIC.has(t))

export function compareExtraction(expected: ReqSnapshot[], actual: ReqSnapshot[]): ExtractionDiff {
  const byKey = (list: ReqSnapshot[]) => new Map(list.map((r) => [canon(r.keyword), r]))
  const exp = byKey(expected)
  const act = byKey(actual)

  const diff: ExtractionDiff = {
    matched: 0,
    missing: [],
    added: [],
    renamed: [],
    mandatoryFlips: [],
    kindFlips: [],
    jaccard: 1,
  }

  const pair = (e: ReqSnapshot, a: ReqSnapshot) => {
    diff.matched += 1
    if (e.mandatory !== a.mandatory) diff.mandatoryFlips.push(e.keyword)
    if (e.kind !== a.kind) diff.kindFlips.push({ keyword: e.keyword, was: e.kind, now: a.kind })
  }

  // Pass 1 — identical wording. Exhausted first so a reworded near-match can
  // never steal a requirement that matched exactly.
  const expLeft = new Map(exp)
  const actLeft = new Map(act)
  for (const [key, e] of exp) {
    const a = actLeft.get(key)
    if (!a) continue
    pair(e, a)
    expLeft.delete(key)
    actLeft.delete(key)
  }

  // Pass 2 — one side's words contain the other's. Best overlap first, and
  // strictly one-to-one: a bare `Salesforce` may claim ONE of `Salesforce
  // Marketing Cloud` / `Salesforce CRM`, never both.
  const candidates: { eKey: string; aKey: string; overlap: number }[] = []
  for (const [eKey, e] of expLeft) {
    const eTok = new Set(tokenize(e.keyword))
    for (const [aKey, a] of actLeft) {
      const aTok = new Set(tokenize(a.keyword))
      const [small, big] = eTok.size <= aTok.size ? [eTok, aTok] : [aTok, eTok]
      if (!carriesMeaning(small) || !isSubset(small, big)) continue
      candidates.push({ eKey, aKey, overlap: small.size })
    }
  }
  candidates.sort((x, y) => y.overlap - x.overlap)
  for (const c of candidates) {
    const e = expLeft.get(c.eKey)
    const a = actLeft.get(c.aKey)
    if (!e || !a) continue
    pair(e, a)
    diff.renamed.push({ was: e.keyword, now: a.keyword })
    expLeft.delete(c.eKey)
    actLeft.delete(c.aKey)
  }

  for (const e of expLeft.values()) diff.missing.push(e.keyword)
  for (const a of actLeft.values()) diff.added.push(a.keyword)

  const union = exp.size + act.size - diff.matched
  diff.jaccard = union === 0 ? 1 : diff.matched / union
  return diff
}
