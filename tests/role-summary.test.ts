import { describe, expect, it } from 'vitest'
import { roleSummary } from '@/lib/role-summary'

// Shaped like real stored postings (LinkedIn pastes, agency boards, OCC):
// one paragraph per line, headings on their own line or glued on.
const HALDEN = `Regional Growth Programs Lead
Job Type:  Full-Time
Location Type:  Onsite
Primary Location:  Mexico City, MX

The Regional Growth Lead shapes how Halden's online stores across LATAM win and keep customers. It is a senior individual contributor role for a hands-on planner: someone who turns customer research, store data and the regional teams' plans into campaigns, offers and site changes that ship every month and show up in the numbers.

Where You'll Make an Impact`

const STEP_LABS = `About Pinecrest Studio
Pinecrest Studio is a design and development agency for growing direct-to-consumer brands. We partner with online stores of every size, mostly in home goods and personal care, to plan, build and test what they sell online.
The Role
As an Account Strategist, you'll own growth and conversion strategy for a portfolio of DTC e-commerce brands. You'll sit at the intersection of paid media, CRO, and account management, shaping the plan with each client, running the weekly reviews and turning what the tests show into the next quarter's roadmap for every brand you own.
What You'll Do
Own CRO strategy across client e-commerce stores — identifying friction, prioritizing tests, and building experiment roadmaps.`

const APSA = `Gerente de E-commerce y Marketplaces (Amazon · Mercado Norte · Shopify · TikTok Shop)
Papelera Ejemplo (Papeles de Ejemplo del Centro, S.A. de C.V.) · Toluca, México, Mexico

En Papelera Ejemplo somos fabricantes con presencia en Amazon, Mercado Norte y nuestra tienda propia en Shopify. Buscamos a la persona que tome el control total del canal digital: estrategia, operación, crecimiento y resultados.
¿Qué vas a hacer?
Liderar la operación y el crecimiento de nuestras tiendas en Amazon, Mercado Norte y Shopify: catálogo, contenido, precios, inventario.`

describe('roleSummary', () => {
  it('takes the first real paragraph, clipped at a sentence end', () => {
    expect(roleSummary(HALDEN)).toBe(
      "The Regional Growth Lead shapes how Halden's online stores across LATAM win and keep customers.",
    )
  })

  it('skips a section about the company and reads the role (EN)', () => {
    expect(roleSummary(STEP_LABS)).toBe(
      "As an Account Strategist, you'll own growth and conversion strategy for a portfolio of DTC e-commerce brands.",
    )
  })

  it('reads Spanish postings and does not split inside "S.A. de C.V."', () => {
    expect(roleSummary(APSA)).toBe(
      'En Papelera Ejemplo somos fabricantes con presencia en Amazon, Mercado Norte y nuestra tienda propia en Shopify. Buscamos a la persona que tome el control total del canal digital: estrategia, operación, crecimiento y resultados.',
    )
  })

  it('skips a line with a heading glued on, whole — never trimmed, never garbled', () => {
    const nido = `Acerca del empleo
About Marea SocialMarea Social is a full-funnel eCommerce growth agency specializing in acquisition and retention for direct-to-consumer brands.
Our partnership-first approach has earned us a 90% client retention rate and recognition as an Inc. 5000 honoree.
The RoleAs a Paid Search Media Buyer at Marea Social, you will own the strategy, execution, and optimization of Google Ads accounts.
You will launch and manage search, shopping, and Performance Max campaigns while testing to drive scalable growth.`
    // The company section (glued "About …") is skipped; the glued role line is
    // dropped rather than cut; the next whole role sentence is the summary.
    expect(roleSummary(nido)).toBe(
      'You will launch and manage search, shopping, and Performance Max campaigns while testing to drive scalable growth.',
    )
  })

  it('never cuts heading words out of an ordinary sentence', () => {
    const cases = [
      'The job is based in Mexico City and involves weekly visits to the plant and to our two biggest retail customers.',
      'El puesto no requiere inglés avanzado, pero sí experiencia comprobable operando tiendas en Amazon y Mercado Norte.',
      'The positioning of our brands across Amazon and Walmart is the core of this role, from content to retail media.',
      'The roles and responsibilities include owning the paid media budget and reporting weekly to the commercial director.',
      'The role reports to the CMO and owns the paid media plan across Meta, Google and TikTok for every brand we run.',
    ]
    for (const line of cases) expect(roleSummary(line)).toBe(line)
  })

  it('strips a role heading only when it is the whole line, with or without a colon', () => {
    const text = `The Role:
As an Account Strategist, you'll own growth and conversion strategy for a portfolio of DTC e-commerce brands.`
    expect(roleSummary(text)).toMatch(/^As an Account Strategist/)
  })

  it('reads "About 40%…" and "Sobre todo…" as sentences, not company headings', () => {
    const about = `About 40% of your time will be spent with clients, reviewing results and planning the next quarter's tests.
Everything else is hands-on work in the ad accounts.`
    expect(roleSummary(about)).toMatch(/^About 40% of your time/)
    const sobre = `Sobre todo, buscamos a alguien que disfrute operar campañas de Amazon Ads de punta a punta.
Liderar la estrategia de publicidad en marketplaces para las marcas del grupo, con metas claras de ROAS.`
    expect(roleSummary(sobre)).toMatch(/^Sobre todo, buscamos/)
  })

  it('does not end a sentence on an abbreviation or initials', () => {
    const eg = `You will design the testing plan for each client (e.g. landing pages, PDPs and checkout flows) and report the results weekly. ${'You will also coordinate with design and development teams across every pod in the agency to ship it. '.repeat(2)}`
    expect(roleSummary(eg)).toMatch(/and report the results weekly\./)
    expect(roleSummary(eg)).not.toMatch(/e\.g\.$/)
    const sa =
      'Trabajarás para Grupo Industrial Norte, S.A. de C.V., liderando la estrategia de e-commerce en Amazon y Mercado Norte para todas sus marcas. Reportarás al director comercial y coordinarás a un equipo de cuatro personas en CDMX y Monterrey, con presupuesto propio.'
    expect(roleSummary(sa)).toMatch(/liderando la estrategia de e-commerce/)
    expect(roleSummary(sa)).not.toMatch(/C\.V\.$/)
    const inc =
      'Acme Inc. is hiring a Paid Media Lead to own Meta and Google for our DTC brands, with a budget of its own and a team of two.'
    expect(roleSummary(inc)).toBe(inc)
  })

  it('reads "About the job" as the role, not the company', () => {
    const text = `About the job
We are looking for an E-Commerce Growth Marketing Manager to turn our digital channels into scalable, profitable growth engines.`
    expect(roleSummary(text)).toMatch(/^We are looking for/)
  })

  it('skips boilerplate lines: benefits, EEO, how to apply, pay in any wording', () => {
    const text = `Benefits include health insurance, a home-office stipend, and generous paid time off for every employee.
We are an equal opportunity employer and value diversity at our company in every single one of our offices.
Salary: up to $200USD/month based on experience plus profit sharing bonuses based on performance.
Compensation: $120,000 - $150,000 per year plus equity, paid monthly, with a review after the first six months.
Base pay range for this role depends on the location and level of the person we hire for the team in Mexico.
Remuneración competitiva de acuerdo con la experiencia, más bonos trimestrales por resultados de la cuenta.
Ofrecemos 45,000 MXN mensuales brutos más prestaciones superiores a las de ley, desde el primer día de trabajo.
Para postularte envía tu CV actualizado y tu portafolio a nuestro equipo de reclutamiento por correo.
Liderar la implementación y evolución de la agenda de Marketing ROI, coordinando iniciativas de medición.`
    expect(roleSummary(text)).toBe(
      'Liderar la implementación y evolución de la agenda de Marketing ROI, coordinando iniciativas de medición.',
    )
  })

  it('never returns more than 280 characters, and never cuts mid-sentence', () => {
    const s =
      'This sentence describes the role in enough words to be meaningful for a reader on a phone. '
    const out = roleSummary(s.repeat(6))
    expect(out).not.toBeNull()
    expect(out?.length).toBeLessThanOrEqual(280)
    expect(out).toMatch(/\.$/)
  })

  it('skips a paragraph whose first sentence alone is over the limit', () => {
    const long = `${'word '.repeat(70)}end.`
    expect(roleSummary(long)).toBeNull()
  })

  it('returns null when nothing qualifies — short lines, bullets, no sentence end', () => {
    expect(roleSummary('')).toBeNull()
    expect(roleSummary('Remote\nFull time\nSenior')).toBeNull()
    expect(
      roleSummary(
        '- Own the paid media strategy across Meta, Google and TikTok for a portfolio of brands.\n• Report weekly to the founders on spend, ROAS and the experiments that ran that week.',
      ),
    ).toBeNull()
    expect(
      roleSummary(
        'Gerente de E-commerce y Marketplaces (Amazon · Mercado Norte · Shopify · TikTok Shop) en CDMX',
      ),
    ).toBeNull()
  })

  it('ends at a glued sentence end and never inserts the missing space', () => {
    const engines =
      'You will turn our client stores into compounding growth engines, with tests shipped every single week.We work in senior pods across LATAM.'
    expect(roleSummary(engines)).toBe(
      'You will turn our client stores into compounding growth engines, with tests shipped every single week.',
    )
  })

  it('never splits or rewrites Ph.D., Node.JS or Vue.JS', () => {
    const phd =
      'We want a Ph.D. in statistics or a related field, and three years running marketing-mix models for consumer brands.'
    expect(roleSummary(phd)).toBe(phd)
    const node =
      'You will build the automation layer of our agency in Node.JS and Vue.JS, from webhooks to the dashboards clients see.'
    expect(roleSummary(node)).toBe(node)
  })

  it('a period before a lowercase word, a Spanish title or a month is not a sentence end', () => {
    const first =
      'Buscamos a una persona que lidere la estrategia de marketplaces de nuestras marcas de consumo en Amazon, Mercado Norte y Walmart en todo México.'
    const lic = `${first} El perfil ideal es Lic. en Mercadotecnia o carrera afín, con experiencia comprobable optimizando campañas de Amazon Ads y Mercado Ads por ROAS y por margen en marcas de consumo.`
    // The second sentence would pass 280, so the summary is the first — never "…es Lic."
    expect(roleSummary(lic)).toBe(first)
    const ing =
      'Reportarás al Ing. Ramírez, director comercial, y coordinarás la operación de nuestras tiendas en Amazon y Mercado Norte.'
    expect(roleSummary(ing)).toBe(ing)
    const month =
      'The role starts in Jan. and you will own the paid search budget for our two largest DTC brands from the first week.'
    expect(roleSummary(month)).toBe(month)
  })

  it('reads "About our McDonald\'s account" as a sentence, not a glued company heading', () => {
    const text =
      "About our McDonald's account: you will own paid social for the brand across Meta and TikTok, with a team of two."
    expect(roleSummary(text)).toBe(text)
  })

  it('skips company copy that opens "At <Company>," (Lumen Metrics)', () => {
    const lumen = `About the job
At Lumen Metrics, we are passionate about our work to power a better media future for all people by providing powerful insights that drive client decisions and deliver extraordinary results.
As a Senior Analyst, Paid Media, you will own campaign measurement for our largest advertisers across search, social and retail media, turning results into recommendations.`
    expect(roleSummary(lumen, 'Lumen Metrics')).toBe(
      'As a Senior Analyst, Paid Media, you will own campaign measurement for our largest advertisers across search, social and retail media, turning results into recommendations.',
    )
    // Case and a legal suffix on the stored name make no difference.
    expect(roleSummary(lumen, 'LUMEN METRICS, Inc.')).toMatch(/^As a Senior Analyst/)
  })

  it('skips "When you join <Company>," too (Lumen Metrics\'s second paragraph)', () => {
    const text = `When you join Lumen Metrics, you will join a dynamic team committed to excellence, perseverance, and the ambition to make an impact together.
As a Senior Analyst, Paid Media, you will own campaign measurement for our largest advertisers across search, social and retail media.`
    expect(roleSummary(text, 'Lumen Metrics')).toMatch(/^As a Senior Analyst/)
    // Another company in that slot is not this employer's copy.
    expect(roleSummary(text, 'Acme')).toMatch(/^When you join Lumen Metrics/)
  })

  it('skips Spanish company copy: "En <Company>,", "<Company> es", "Somos", "Nuestra misión"', () => {
    const text = `En Grupo Andino, S.A. de C.V., creemos que la tecnología transforma la manera en que las marcas llegan a sus clientes en toda la región.
Grupo Andino es una empresa líder en distribución con más de 40 años de historia y presencia en doce países de América Latina.
Somos un equipo apasionado por la innovación, la diversidad y el crecimiento de nuestra gente en cada una de nuestras oficinas.
Nuestra misión es acercar los mejores productos a cada hogar, con un servicio excepcional y precios justos para todas las familias.
Como Especialista de Marketplaces serás responsable de la estrategia comercial en Amazon y Mercado Norte, del catálogo y de la publicidad.`
    expect(roleSummary(text, 'Grupo Andino S.A. de C.V.')).toBe(
      'Como Especialista de Marketplaces serás responsable de la estrategia comercial en Amazon y Mercado Norte, del catálogo y de la publicidad.',
    )
  })

  it('keeps a role paragraph that merely mentions the company, or says the company is hiring', () => {
    const mention =
      'You will join the Lumen Metrics Media Analytics team as its first paid-media analyst, reporting to the Director of Measurement in Mexico City.'
    expect(roleSummary(mention, 'Lumen Metrics')).toBe(mention)
    const hiring =
      'Lumen Metrics is hiring a Paid Media Analyst to own measurement for our largest advertisers across search, social and retail media.'
    expect(roleSummary(hiring, 'Lumen Metrics')).toBe(hiring)
    const looking =
      'We are looking for an E-Commerce Growth Marketing Manager to turn our digital channels into scalable, profitable growth engines.'
    expect(roleSummary(looking, 'Lumen Metrics')).toBe(looking)
    // Another company's name in the "is" slot is not this company's copy.
    const other =
      'Amazon Ads is the channel you will own: sponsored products, brands and display for a portfolio of consumer brands in Mexico.'
    expect(roleSummary(other, 'Lumen Metrics')).toBe(other)
  })

  it('every summary is a verbatim substring of one input line (property)', () => {
    const probes = [
      HALDEN,
      STEP_LABS,
      APSA,
      'We want a Ph.D. in statistics or a related field, and three years running marketing-mix models for consumer brands. More text follows here for the reader.',
      'You know Node.JS well.You will build the automation layer of our agency, from webhooks to the dashboards clients see every day.',
      'Vue.JS is our front end. You will build the automation layer of our agency, from webhooks to the dashboards clients see every day.',
      'Pinecrest Studio turns DTC stores into compounding growth engines.We work in tight, senior pods of strategists, designers and developers.',
      'El perfil ideal es Lic. en Mercadotecnia, con experiencia comprobable optimizando campañas en Amazon y Mercado Norte por ROAS.',
      'Text  with   doubled    spaces inside it, which must come back exactly as stored and never collapsed by the summary.',
      '\tLeading tab and trailing spaces around a line that describes the role in enough words to qualify for the block.   ',
      `${'Long sentence word '.repeat(10)}ends here. ${'Another long sentence word '.repeat(10)}ends too.`,
      'About Marea SocialMarea Social is an agency.\nThe RoleAs a buyer you own Google Ads.\nYou will launch and manage search, shopping, and Performance Max campaigns while testing to drive growth.',
      'At Lumen Metrics, we are passionate about our work to power a better media future for all people.\nYou will join the Lumen Metrics team that measures paid media for the largest advertisers in Mexico.',
    ]
    let seen = 0
    // With and without a company: skipping its copy must never touch the text.
    for (const input of probes) {
      for (const company of ['', 'Lumen Metrics', 'Pinecrest Studio']) {
        const out = roleSummary(input, company)
        if (out === null) continue
        seen++
        expect(out).toBe(out.trim())
        expect(input.split(/\r?\n/).some((line) => line.includes(out))).toBe(true)
      }
    }
    expect(seen).toBeGreaterThan(24)
  })
})
