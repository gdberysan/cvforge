// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { extractPosting, linkedInJobUrl, postingText } from '@/web/extension/src/extract'

const DESCRIPTION = `Acerca del empleo
Buscamos a una persona que lleve nuestras campañas pagadas en Google Ads y Meta Ads.
Requisitos
- 3 años operando campañas de performance.
- Dominio de Google Analytics 4.`

const linkedin = (descriptionClass: string) => {
  document.body.innerHTML = `
    <header>LinkedIn · Empleos</header>
    <main>
      <div class="job-details-jobs-unified-top-card__job-title"><h1>Especialista en Performance</h1></div>
      <div class="job-details-jobs-unified-top-card__company-name"><a>Casa Tolteca</a></div>
      <div class="job-details-jobs-unified-top-card__primary-description-container"><span class="tvm__text">Guadalajara, Jalisco · hace 2 días · 54 solicitantes</span></div>
      <button>Solicitud sencilla</button><button>Guardar</button>
      <div class="${descriptionClass}">${DESCRIPTION.replace(/\n/g, '<br>')}</div>
      <aside>Personas que quizá conozcas</aside>
    </main>`
  return document
}

describe('reading a posting from the page', () => {
  it('reads LinkedIn’s job view: title, company, location and the description only', () => {
    const p = extractPosting(
      linkedin('jobs-description__content'),
      'https://www.linkedin.com/jobs/view/4012345678/?trk=x',
    )
    expect(p.source).toBe('linkedin')
    expect(p.title).toBe('Especialista en Performance')
    expect(p.company).toBe('Casa Tolteca')
    expect(p.location).toBe('Guadalajara, Jalisco')
    expect(p.url).toBe('https://www.linkedin.com/jobs/view/4012345678/')
    expect(p.text).toContain('Dominio de Google Analytics 4.')
    expect(p.text).not.toMatch(/Solicitud sencilla|Guardar|quizá conozcas|solicitantes/)
  })

  it('survives a renamed description container (any jobs-description class)', () => {
    const p = extractPosting(
      linkedin('jobs-description-v2__body'),
      'https://www.linkedin.com/jobs/search/?currentJobId=4012345678',
    )
    expect(p.source).toBe('linkedin')
    expect(p.url).toBe('https://www.linkedin.com/jobs/view/4012345678/')
  })

  it('prefers what the person selected, on any site', () => {
    linkedin('jobs-description__content')
    const picked =
      'Senior Growth Marketer — we need someone who owns paid search and paid social end to end.'
    const p = extractPosting(document, 'https://jobs.example.com/123', picked)
    expect(p).toMatchObject({ source: 'selection', text: picked })
  })

  it('falls back to the page’s main text elsewhere', () => {
    document.body.innerHTML = `<nav>Menu</nav><main><h1>Growth Lead</h1><p>${'Own the funnel. '.repeat(10)}</p></main>`
    const p = extractPosting(document, 'https://careers.example.com/growth-lead')
    expect(p.source).toBe('page')
    expect(p.title).toBe('Growth Lead')
    expect(p.text).toContain('Own the funnel.')
    expect(p.text).not.toContain('Menu')
  })

  it('knows a LinkedIn job URL from a search URL, and nothing else', () => {
    expect(
      linkedInJobUrl('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=99'),
    ).toBe('https://www.linkedin.com/jobs/view/99/')
    expect(linkedInJobUrl('https://www.linkedin.com/feed/')).toBeNull()
    expect(linkedInJobUrl('https://evil.example.com/jobs/view/1/')).toBeNull()
  })

  it('puts the header facts first in the text the console starts from', () => {
    expect(
      postingText({
        title: 'T',
        company: 'C',
        location: 'L',
        text: 'Body',
        url: '',
        source: 'linkedin',
      }),
    ).toBe('T\nC · L\n\nBody')
  })
})
