import { PDFParse } from 'pdf-parse'
import { describe, expect, it } from 'vitest'
import { renderCvHtml } from '@/lib/render/cv-html'
import {
  estimatePages,
  fitPairToPages,
  fitToPages,
  summarySentences,
} from '@/lib/render/page-budget'
import { isPdfEngineAvailable, renderPdf } from '@/lib/render/pdf'
import type { CVContent } from '@/lib/schemas'

// The shape of a real CV that printed three pages: six roles, 22 bullets of
// ~185 characters, a 520-character summary and five full skill rows.
const sentence =
  'Lideré la estrategia de marketplaces y medios de performance para la categoría, coordinando equipos de catálogo, pricing y logística con resultados medibles.'
function longCv(): CVContent {
  const perRole = [4, 4, 5, 6, 2, 1]
  return {
    header: {
      fullName: 'Dana Pérez',
      title: 'Head of E-commerce',
      contactLines: ['CDMX', 'd@p.com'],
    },
    summary: `${sentence} ${sentence} ${sentence}`.slice(0, 520),
    summaryCitedEvidenceIds: [],
    experience: perRole.map((n, r) => ({
      experienceId: `exp_${r}`,
      title: 'Gerente de E-commerce',
      company: `Empresa ${r}`,
      startDate: `${2024 - r * 3}-01`,
      endDate: `${2026 - r * 3}-01`,
      bullets: Array.from({ length: n }, (_, i) => ({
        id: `b${r}_${i}`,
        text: `${sentence} (${r}.${i})`,
        citedEvidenceIds: ['ev_1'],
        keywordsUsed: [],
      })),
    })),
    projects: [],
    education: [
      { degree: 'Licenciatura en Negocios', institution: 'Universidad', period: '2009 – 2013' },
    ],
    skills: Array.from({ length: 5 }, (_, i) => ({
      category: `Grupo ${i}`,
      items: [
        'Google Ads',
        'Amazon Vendor Central',
        'Mercado Norte',
        'BigQuery',
        'SQL',
        'Looker Studio',
        'HubSpot',
      ],
    })),
    extras: [
      {
        heading: 'Certificaciones',
        lines: ['Google Ads Search', 'Apple Search Ads', 'AI-Powered Performance Ads'],
      },
      { heading: 'Idiomas', lines: ['Español — nativo', 'Inglés — C1'] },
    ],
  }
}

const bullets = (cv: CVContent) => cv.experience.map((r) => r.bullets.length)

describe('fitToPages', () => {
  it('cuts a three-page CV to the two-page limit, older roles first', () => {
    const cv = longCv()
    expect(estimatePages(cv)).toBeGreaterThan(2)
    const fit = fitToPages(cv)
    expect(estimatePages(fit)).toBeLessThanOrEqual(2)
    // The three most recent roles keep their bullets while older ones give
    // theirs up; every role keeps its line, so the history stays complete.
    expect(bullets(fit).slice(0, 3)).toEqual([4, 4, 5])
    expect(fit.experience.map((r) => r.experienceId)).toEqual(
      cv.experience.map((r) => r.experienceId),
    )
    // Nothing is rewritten: every surviving bullet is one the composer wrote.
    const before = new Set(cv.experience.flatMap((r) => r.bullets.map((b) => b.text)))
    for (const b of fit.experience.flatMap((r) => r.bullets)) expect(before.has(b.text)).toBe(true)
  })

  it('leaves a CV that fits untouched', () => {
    const cv = longCv()
    cv.experience = cv.experience.slice(0, 2)
    expect(fitToPages(cv)).toEqual(cv)
  })

  it('does not mutate its input', () => {
    const cv = longCv()
    fitToPages(cv)
    expect(bullets(cv)).toEqual([4, 4, 5, 6, 2, 1])
  })

  it('prints within the limit when rendered for real', async () => {
    if (!(await isPdfEngineAvailable())) {
      console.warn('No PDF engine; skipping the real-render page count.')
      return
    }
    const pages = async (cv: CVContent) => {
      const pdf = await renderPdf(renderCvHtml(cv, { language: 'es-MX' }))
      return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
    }
    expect(await pages(longCv())).toBeGreaterThan(2)
    expect(await pages(fitToPages(longCv()))).toBeLessThanOrEqual(2)
  }, 120_000)
})

// Builders for the step-order tests: n roles of the given bullet counts,
// skills rows, and a summary of whole sentences.
function cvOf(opts: {
  perRole: number[]
  skills?: number[]
  summarySentences?: number
  projects?: number[]
  bulletText?: string
}): CVContent {
  const base = longCv()
  const text = opts.bulletText ?? sentence
  return {
    ...base,
    summary: Array.from(
      { length: opts.summarySentences ?? 2 },
      (_, i) =>
        `Frase número ${i + 1} del resumen con foco en marketplaces y medios de performance.`,
    ).join(' '),
    experience: opts.perRole.map((n, r) => ({
      ...base.experience[0],
      experienceId: `exp_${r}`,
      company: `Empresa ${r}`,
      bullets: Array.from({ length: n }, (_, i) => ({
        id: `b${r}_${i}`,
        text: `${text} (${r}.${i})`,
        citedEvidenceIds: [`ev_${r}_${i}`],
        keywordsUsed: [],
      })),
    })),
    projects: (opts.projects ?? []).map((n, p) => ({
      projectId: `prj_${p}`,
      name: `Proyecto ${p}`,
      bullets: Array.from({ length: n }, (_, i) => ({
        id: `p${p}_${i}`,
        text: `${text} [${p}.${i}]`,
        citedEvidenceIds: [`ev_p${p}_${i}`],
        keywordsUsed: [],
      })),
    })),
    skills: (opts.skills ?? [4, 4, 4]).map((n, g) => ({
      category: `Grupo ${g}`,
      items: Array.from({ length: n }, (_, i) => `Herramienta ${g}.${i}`),
    })),
  }
}

/** Trims until the CV is under `pages`, by lowering the headroom. */
const fitUnder = (
  cv: CVContent,
  pages: number,
  relevance?: (id: string) => number,
  mandatoryEvidence?: string[][],
) =>
  fitToPages(cv, {
    headroom: 2 - 0.02 - pages,
    ...(relevance ? { relevance: (b) => relevance(b.id) } : {}),
    ...(mandatoryEvidence ? { mandatoryEvidence } : {}),
  })

/** Every budget from just under the CV's length down to nothing. */
function sweep(
  cv: CVContent,
  relevance?: (id: string) => number,
  mandatoryEvidence?: string[][],
): CVContent[] {
  const start = estimatePages(cv)
  return Array.from({ length: 80 }, (_, i) =>
    fitUnder(cv, start - 0.01 - i * 0.025, relevance, mandatoryEvidence),
  )
}

const idsOf = (sections: { bullets: { id: string }[] }[]) =>
  sections.flatMap((s) => s.bullets.map((b) => b.id))

describe('fitToPages trims by relevance, step by step', () => {
  const cv = cvOf({
    perRole: [4, 4, 4, 3, 3],
    projects: [2],
    // Within the 4 × 8 cap, so step 0 has nothing to do here.
    skills: [8, 8, 7, 6],
    summarySentences: 5,
  })

  it('cuts in order: old roles and projects, skills, summary, then the recent roles', () => {
    for (const fit of sweep(cv)) {
      const olderDone =
        bullets(fit)
          .slice(3)
          .every((n) => n === 0) && fit.projects.length === 0
      const skillsCut = JSON.stringify(fit.skills) !== JSON.stringify(cv.skills)
      const skillsDone = fit.skills.length <= 3 && fit.skills.every((g) => g.items.length <= 5)
      const sentences = summarySentences(fit.summary).length
      const recentCut = bullets(fit).slice(0, 3).join() !== '4,4,4'

      if (skillsCut) expect(olderDone).toBe(true)
      if (sentences < 5) expect(olderDone && skillsDone).toBe(true)
      if (recentCut) expect(olderDone && skillsDone && sentences === 2).toBe(true)

      // Every role keeps its line; the floors hold.
      expect(fit.experience).toHaveLength(5)
      expect(Math.min(...bullets(fit).slice(0, 3))).toBeGreaterThanOrEqual(1)
      expect(fit.skills.length).toBeGreaterThanOrEqual(3)
      expect(sentences).toBeGreaterThanOrEqual(2)

      // Everything left is a prefix of what was written: cuts come from the ends.
      expect(summarySentences(fit.summary)).toEqual(
        summarySentences(cv.summary).slice(0, sentences),
      )
      for (const [g, row] of fit.skills.entries())
        expect(row.items).toEqual(cv.skills[g].items.slice(0, row.items.length))
      for (const [r, role] of fit.experience.entries())
        expect(role.bullets).toEqual(cv.experience[r].bullets.slice(0, role.bullets.length))

      // Old roles go oldest first; recent ones the oldest of the three first.
      const [r0, r1, r2, r3, r4] = bullets(fit)
      if (r3 < 3) expect(r4).toBe(0)
      if (r1 < 4) expect(r2).toBe(1)
      if (r0 < 4) expect([r1, r2]).toEqual([1, 1])
    }
    // At the bottom of the sweep every step has run to its floor.
    const floor = fitUnder(cv, 0.1)
    expect(bullets(floor)).toEqual([1, 1, 1, 0, 0])
    expect(floor.skills.map((g) => g.items.length)).toEqual([5, 5, 5])
    expect(summarySentences(floor.summary)).toHaveLength(2)
  })

  it('a tailored CV cuts the bullets that answer nothing in this posting first, within each step', () => {
    // The oldest role's first bullet and the newest role's last answer the posting.
    const relevant = new Set(['b4_0', 'b0_3'])
    const score = (id: string) => (relevant.has(id) ? 2 : 0)
    for (const fit of sweep(cv, score)) {
      const kept = new Set([...idsOf(fit.experience), ...idsOf(fit.projects)])
      const olderPool = [...idsOf(cv.experience.slice(3)), ...idsOf(cv.projects)]
      if (!kept.has('b4_0')) for (const id of olderPool) expect(kept.has(id)).toBe(false)
      if (!kept.has('b0_3')) expect(bullets(fit)[0]).toBe(1)
      expect(Math.min(...bullets(fit).slice(0, 3))).toBeGreaterThanOrEqual(1)
    }
    // Deep enough, the newest role's one bullet is the relevant one.
    expect(fitUnder(cv, 0.1, score).experience[0].bullets.map((b) => b.id)).toEqual(['b0_3'])
    // And the steps keep their order: a relevant old bullet still goes before skills.
    const mid = sweep(cv, score).find((f) => JSON.stringify(f.skills) !== JSON.stringify(cv.skills))
    expect(mid && bullets(mid).slice(3)).toEqual([0, 0])
  })

  it('step 0: the skills cap (4 rows × 8 items) comes before any bullet', () => {
    const bloated = cvOf({
      perRole: [1, 1, 1, 1, 1, 1],
      skills: [10, 10, 9, 7, 8, 5, 5, 2],
      summarySentences: 3,
    })
    for (const fit of sweep(bloated)) {
      const capped = fit.skills.length <= 4 && fit.skills.every((g) => g.items.length <= 8)
      if (bullets(fit).join() !== '1,1,1,1,1,1') expect(capped).toBe(true)
      // Items go before rows: a row is dropped only once every row is at 8.
      if (fit.skills.length < 8) expect(fit.skills.every((g) => g.items.length <= 8)).toBe(true)
    }
    // Just under its length, the cap alone does it: every bullet stays.
    const first = fitUnder(bloated, estimatePages(bloated) - 0.05)
    expect(bullets(first)).toEqual([1, 1, 1, 1, 1, 1])
    expect(first.skills.length).toBeLessThan(8)
  })

  it('step 4: the newest role is cut only after the other two recent ones are at one', () => {
    // Halden's shape: the newest role holds the lowest-scored bullet.
    const halden = cvOf({ perRole: [4, 4, 4], skills: [5, 5, 5], summarySentences: 2 })
    const score = (id: string) => (id === 'b0_0' ? 1 : id.startsWith('b0_') ? 6 : 4)
    for (const fit of sweep(halden, score)) {
      const [r0, r1, r2] = bullets(fit)
      if (r0 < 4) expect([r1, r2]).toEqual([1, 1])
    }
    // At the floor the newest role keeps its most relevant bullet, not the 1-scorer.
    const floor = fitUnder(halden, 0.1, score)
    expect(floor.experience[0].bullets).toHaveLength(1)
    expect(floor.experience[0].bullets[0].id).not.toBe('b0_0')
  })

  it("a mandatory requirement's only evidence outlives every bullet that answers nothing", () => {
    const cv = cvOf({ perRole: [3, 3, 3, 2], skills: [5, 5, 5], summarySentences: 3 })
    // b3_0 (an old role) is the only bullet evidencing a mandatory requirement.
    // b0_2 (the newest role) and b3_1 (the old role) answer nothing.
    const scores: Record<string, number> = { b3_0: 9, b0_2: 0, b3_1: 0 }
    const score = (id: string) => scores[id] ?? 2
    const mandatory = [['ev_3_0']]
    const kept = (fit: CVContent) =>
      new Set(fit.experience.flatMap((r) => r.bullets.map((b) => b.id)))

    // The first cuts are the two that answer nothing, the old one first —
    // the recent one goes in step 1 too, before any skill or sentence.
    const light = sweep(cv, score, mandatory)
    const firstCut = light.find((f) => kept(f).size < 11)
    expect(firstCut && kept(firstCut).has('b3_1')).toBe(false)
    for (const fit of light) {
      const k = kept(fit)
      const others = [...k].filter((id) => !['b0_2', 'b3_1', 'b3_0'].includes(id))
      if (others.length < 8 || JSON.stringify(fit.skills) !== JSON.stringify(cv.skills))
        expect(k.has('b0_2') || k.has('b3_1')).toBe(false)
      // Protected until the final step: every recent role is at one by then.
      if (!k.has('b3_0')) expect(bullets(fit).slice(0, 3)).toEqual([1, 1, 1])
      expect(Math.min(...bullets(fit).slice(0, 3))).toBeGreaterThanOrEqual(1)
    }
    // Without the ruling the same bullet would go in step 1, with its role.
    const unprotected = fitUnder(cv, estimatePages(cv) - 0.12, score)
    expect(kept(unprotected).has('b3_0')).toBe(false)
    expect(kept(fitUnder(cv, estimatePages(cv) - 0.12, score, mandatory)).has('b3_0')).toBe(true)
  })

  it('composes to a tighter budget when asked for headroom', () => {
    const fit = fitToPages(longCv(), { headroom: 0.15 })
    expect(estimatePages(fit)).toBeLessThanOrEqual(2 - 0.15)
  })
})

describe('summarySentences', () => {
  it('never splits after a common abbreviation or inside a decimal', () => {
    expect(
      summarySentences(
        'Sr. Manager de performance con 2.7x ROAS en Amazon. Trabajé con el Lic. Pérez y la Dra. Ruiz, p. ej. en Grupo S.A. de C.V. Lideré equipos en EE. UU., U.S. Inc. y Co. Ltd., e.g. Mercado Norte, vs. la competencia, etc. Cerré el No. 1 del canal.',
      ),
    ).toEqual([
      'Sr. Manager de performance con 2.7x ROAS en Amazon.',
      'Trabajé con el Lic. Pérez y la Dra. Ruiz, p. ej. en Grupo S.A. de C.V. Lideré equipos en EE. UU., U.S. Inc. y Co. Ltd., e.g. Mercado Norte, vs. la competencia, etc. Cerré el No. 1 del canal.',
    ])
  })

  it('a trailing cut never leaves an abbreviation dangling', () => {
    const cv = cvOf({ perRole: [3, 3, 3], skills: [5, 5, 5], summarySentences: 1 })
    cv.summary = `${cv.summary} Reporté al Sr. Director Comercial cada semana. Gestioné 2.7x ROAS.`
    for (const fit of sweep(cv)) expect(fit.summary).not.toMatch(/\b(Sr|3)\.$/)
  })

  it('splits on sentence ends, not on figures or decimals', () => {
    expect(
      summarySentences('Subí ventas 3.4x en Amazon. Gestioné $1.2M MXN al año. ¿Más? Sí.'),
    ).toEqual(['Subí ventas 3.4x en Amazon.', 'Gestioné $1.2M MXN al año.', '¿Más?', 'Sí.'])
  })
})

describe('fitPairToPages', () => {
  /** The same CV with every text ~40% longer: a translation that runs long. */
  function longer(cv: CVContent): CVContent {
    const pad = (s: string) => `${s} ${s.slice(0, Math.ceil(s.length / 2.5))}`
    return {
      ...cv,
      summary: summarySentences(cv.summary)
        .map((s) => `${s.slice(0, -1)} y más contexto.`)
        .join(' '),
      experience: cv.experience.map((r) => ({
        ...r,
        bullets: r.bullets.map((b) => ({ ...b, text: pad(b.text) })),
      })),
    }
  }

  it('leaves a pair that fits untouched', () => {
    const cv = cvOf({ perRole: [2, 2] })
    expect(fitPairToPages(cv, cv)).toEqual({ source: cv, translated: cv, trims: 0 })
  })

  it('removes the same bullets, skill items and sentences from both sides', () => {
    const source = cvOf({ perRole: [4, 4, 4, 3, 3], skills: [8, 8, 8, 8], summarySentences: 4 })
    const translated = longer(source)
    expect(estimatePages(source)).toBeLessThanOrEqual(2)
    expect(estimatePages(translated)).toBeGreaterThan(2)
    const fit = fitPairToPages(source, translated)
    expect(estimatePages(fit.translated)).toBeLessThanOrEqual(2)
    const ids = (cv: CVContent) => cv.experience.map((r) => r.bullets.map((b) => b.id))
    expect(ids(fit.source)).toEqual(ids(fit.translated))
    expect(fit.source.skills.map((g) => g.items.length)).toEqual(
      fit.translated.skills.map((g) => g.items.length),
    )
    expect(summarySentences(fit.source.summary).length).toBe(
      summarySentences(fit.translated.summary).length,
    )
    // Nothing on the translated side that the source lacks.
    expect(fit.translated.experience.flatMap((r) => r.bullets).length).toBeLessThan(
      translated.experience.flatMap((r) => r.bullets).length,
    )
  })

  it('leaves the summaries alone when their sentences do not line up', () => {
    const source = cvOf({ perRole: [4, 4, 4, 3, 3], skills: [5, 5, 5], summarySentences: 4 })
    const translated = { ...longer(source), summary: 'Una sola frase larga que lo dice todo.' }
    const fit = fitPairToPages(source, translated, 0.6)
    expect(fit.source.summary).toBe(source.summary)
    expect(fit.translated.summary).toBe(translated.summary)
  })
})

describe('a role with no bullets', () => {
  it('prints its line and no empty list', async () => {
    const cv = cvOf({ perRole: [2, 0, 0], skills: [3, 3, 3] })
    const html = renderCvHtml(cv, { language: 'es-MX' })
    expect(html).not.toMatch(/<ul>\s*<\/ul>/)
    expect(html).toContain('Empresa 1')
    if (!(await isPdfEngineAvailable())) {
      console.warn('No PDF engine; skipping the real render of a bullet-less role.')
      return
    }
    const parser = new PDFParse({ data: new Uint8Array(await renderPdf(html)) })
    const { text } = await parser.getText()
    await parser.destroy()
    // Each bullet-less role prints its title line, and no stray bullet mark.
    expect(text).toContain('Empresa 1')
    expect(text).toContain('Empresa 2')
    expect((text.match(/•/g) ?? []).length).toBeLessThanOrEqual(2)
    const afterRoles = text.slice(text.indexOf('Empresa 1'))
    expect(afterRoles.slice(0, afterRoles.indexOf('Educación'))).not.toMatch(/[•·▪●]\s*\n/)
  }, 120_000)
})
