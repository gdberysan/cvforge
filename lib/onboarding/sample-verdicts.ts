/**
 * Three answers, before anything is asked of you: what CVForge said, once,
 * about three postings for Lucas Lara — the fictional person of the demo
 * (demo/persona.ts). Copied from demo/seed.json, where the live analysis
 * built them; tests/onboarding/sample-verdicts.test.ts keeps the two equal.
 * The worth-it one leads: an honest gap is what the tool is for.
 */
import type { Coverage, EvidenceMapping, Requirement } from '@/lib/schemas'

export type SampleVerdict = {
  id: string
  company: string
  jobTitle: string
  requirements: Requirement[]
  mappings: EvidenceMapping[]
  coverage: Coverage
}

export const SAMPLE_VERDICTS: SampleVerdict[] = [
  {
    id: 'app_demo_2',
    company: 'Nuvei Pagos',
    jobTitle: 'Growth Lead',
    requirements: [
      {
        id: 'req_1',
        text: '5+ años en marketing digital o growth',
        keyword: '5+ años en growth/marketing digital',
        variants: ['marketing digital', 'growth marketing'],
        kind: 'hard',
        mandatory: true,
        weight: 2,
      },
      {
        id: 'req_2',
        text: 'Al menos 2 años en fintech o productos financieros',
        keyword: '2 años en fintech',
        variants: ['productos financieros', 'servicios financieros'],
        kind: 'hard',
        mandatory: true,
        weight: 2,
      },
      {
        id: 'req_3',
        text: 'Experiencia operando presupuestos de performance superiores a $500 mil MXN mensuales',
        keyword: 'gestión de presupuestos de performance',
        variants: ['paid media budget', 'presupuesto publicitario'],
        kind: 'hard',
        mandatory: true,
        weight: 2,
      },
      {
        id: 'req_4',
        text: 'SQL avanzado (CTEs, window functions) — indispensable',
        keyword: 'SQL avanzado',
        variants: ['CTEs', 'window functions'],
        kind: 'hard',
        mandatory: true,
        weight: 3,
      },
      {
        id: 'req_5',
        text: 'Python deseable',
        keyword: 'Python',
        variants: [],
        kind: 'hard',
        mandatory: false,
        weight: 1,
      },
      {
        id: 'req_6',
        text: 'Experiencia con herramientas de analítica de producto (Amplitude o Mixpanel)',
        keyword: 'Amplitude',
        variants: ['Mixpanel', 'analítica de producto', 'product analytics'],
        kind: 'hard',
        mandatory: true,
        weight: 3,
      },
      {
        id: 'req_7',
        text: 'Inglés avanzado (equipo regional)',
        keyword: 'Inglés avanzado',
        variants: ['advanced English', 'English'],
        kind: 'hard',
        mandatory: true,
        weight: 2,
      },
      {
        id: 'req_8',
        text: 'Residencia en México',
        keyword: 'México',
        variants: ['residencia en México', 'Mexico-based'],
        kind: 'location',
        mandatory: true,
        weight: 2,
      },
      {
        id: 'req_9',
        text: 'Trabajo remoto con reuniones en horario de CDMX',
        keyword: 'horario CDMX',
        variants: ['Ciudad de México timezone', 'CST México', 'hora del centro'],
        kind: 'timezone',
        mandatory: true,
        weight: 2,
      },
      {
        id: 'req_10',
        text: 'Definir y ejecutar estrategia de adquisición con paid media (Meta, Google, LinkedIn)',
        keyword: 'paid media',
        variants: ['Meta Ads', 'Google Ads', 'LinkedIn Ads', 'publicidad pagada'],
        kind: 'hard',
        mandatory: false,
        weight: 2,
      },
      {
        id: 'req_11',
        text: 'Construir modelos de cohortes y LTV/CAC',
        keyword: 'LTV/CAC',
        variants: ['análisis de cohortes', 'cohortes', 'unit economics'],
        kind: 'hard',
        mandatory: false,
        weight: 2,
      },
      {
        id: 'req_12',
        text: 'Coordinar a un analista y a una agencia de performance',
        keyword: 'liderazgo de equipo',
        variants: ['gestión de agencias', 'coordinación de equipo'],
        kind: 'soft',
        mandatory: false,
        weight: 2,
      },
      {
        id: 'req_13',
        text: 'Diseñar experimentos de activación y retención con el equipo de producto',
        keyword: 'experimentación',
        variants: ['A/B testing', 'experimentos de growth'],
        kind: 'hard',
        mandatory: false,
        weight: 2,
      },
    ],
    mappings: [
      {
        requirementId: 'req_1',
        evidenceIds: ['ev_demo_01', 'ev_demo_06', 'ev_demo_09', 'ev_demo_02'],
        strength: 'strong',
        rationale:
          'Acumulas ~9 años continuos en marketing digital y growth (agencia 2016-2018, Pagolibre 2018-2021, Farmacias del Valle 2021-2025), muy por encima de los 5 años pedidos.',
      },
      {
        requirementId: 'req_2',
        evidenceIds: ['ev_demo_06', 'ev_demo_07', 'ev_demo_08'],
        strength: 'strong',
        rationale:
          'Tus 2.5 años en Pagolibre fueron de adquisición y activación de comercios en un producto de pagos, lo que cubre la experiencia fintech requerida.',
      },
      {
        requirementId: 'req_3',
        evidenceIds: ['ev_demo_01', 'ev_demo_09', 'ev_demo_04', 'ev_demo_11'],
        strength: 'strong',
        rationale:
          'Operaste $450 mil MXN mensuales en Farmacias del Valle y un presupuesto agregado de $1.2M MXN al mes en Agencia Brisa, además del control presupuestal anual, lo que supera el umbral de $500 mil mensuales.',
      },
      {
        requirementId: 'req_4',
        evidenceIds: ['ev_demo_08'],
        strength: 'partial',
        rationale:
          'Tu propia evidencia indica SQL básico (joins y agregados para cohortes) y que los modelos complejos los hacía el equipo de datos, así que no alcanzas el nivel avanzado con CTEs y window functions.',
      },
      {
        requirementId: 'req_5',
        evidenceIds: [],
        strength: 'none',
        rationale: 'No hay ninguna evidencia de uso de Python en tu historial.',
      },
      {
        requirementId: 'req_6',
        evidenceIds: ['ev_demo_03'],
        strength: 'partial',
        rationale:
          'Dominas GA4 y Looker Studio para tableros de KPIs, pero no hay experiencia con Amplitude ni Mixpanel específicamente.',
      },
      {
        requirementId: 'req_7',
        evidenceIds: ['lang_ingles', 'ev_demo_10'],
        strength: 'strong',
        rationale:
          'Tienes inglés C1 y llevaste durante dos años, como único contacto, a un cliente regional en Miami con llamadas y reportes en inglés.',
      },
      {
        requirementId: 'req_8',
        evidenceIds: [],
        strength: 'strong',
        rationale:
          'Resides en Ciudad de México con ciudadanía mexicana, cumpliendo el requisito de residencia.',
      },
      {
        requirementId: 'req_9',
        evidenceIds: [],
        strength: 'strong',
        rationale:
          'Tu zona horaria es America/Mexico_City, exactamente el horario de reuniones solicitado.',
      },
      {
        requirementId: 'req_10',
        evidenceIds: ['ev_demo_01', 'ev_demo_06', 'ev_demo_09'],
        strength: 'strong',
        rationale:
          'Definiste y ejecutaste adquisición pagada en Meta y Google con resultados medibles (ROAS 2.1→3.4, CAC $1,450→$890), aunque no aparece LinkedIn Ads.',
      },
      {
        requirementId: 'req_11',
        evidenceIds: ['ev_demo_08', 'ev_demo_06', 'ev_demo_03'],
        strength: 'partial',
        rationale:
          'Armaste cohortes de activación con SQL básico y monitoreaste CAC y ROAS por canal, pero no hay evidencia de modelos formales de LTV/CAC.',
      },
      {
        requirementId: 'req_12',
        evidenceIds: ['ev_demo_04'],
        strength: 'partial',
        rationale:
          'Coordinaste agencia creativa y de medios con calendario, revisión y control de presupuesto, pero no hay evidencia de haber liderado a un analista o personas a cargo.',
      },
      {
        requirementId: 'req_13',
        evidenceIds: ['ev_demo_05', 'ev_demo_07', 'ev_demo_02'],
        strength: 'strong',
        rationale:
          'Corriste pruebas A/B con el equipo de UX (conversión 3.1%→4.2%) y diseñaste flujos de activación y recompra con impacto medido, justo el tipo de experimentación pedida.',
      },
    ],
    coverage: {
      mandatoryTotal: 8,
      mandatoryStrong: 6,
      mandatoryPartial: 2,
      mandatoryMissing: 0,
      desirableTotal: 5,
      desirableStrong: 2,
      desirablePartial: 2,
      desirableMissing: 1,
      hardBlockers: [],
      verdict: 'worth-it',
    },
  },
  {
    id: 'app_demo_1',
    company: 'Grupo Andino Retail',
    jobTitle: 'Coordinador(a) de Marketing Digital',
    requirements: [
      {
        id: 'req_1',
        text: '3+ años de experiencia en marketing digital, de preferencia en retail o ecommerce',
        keyword: '3+ años en marketing digital',
        variants: ['experiencia en marketing digital', '3 años marketing digital'],
        kind: 'hard',
        mandatory: true,
        weight: 3,
      },
      {
        id: 'req_2',
        text: 'Experiencia comprobable operando campañas en Meta Ads',
        keyword: 'Meta Ads',
        variants: ['Facebook Ads', 'Instagram Ads'],
        kind: 'hard',
        mandatory: true,
        weight: 3,
      },
      {
        id: 'req_3',
        text: 'Experiencia comprobable operando campañas en Google Ads',
        keyword: 'Google Ads',
        variants: ['Google Adwords', 'SEM'],
        kind: 'hard',
        mandatory: true,
        weight: 3,
      },
      {
        id: 'req_4',
        text: 'Manejo de un CRM empresarial (HubSpot o Salesforce Marketing Cloud): segmentación, automatizaciones y reportes',
        keyword: 'CRM empresarial',
        variants: ['HubSpot', 'Salesforce Marketing Cloud'],
        kind: 'hard',
        mandatory: true,
        weight: 3,
      },
      {
        id: 'req_5',
        text: 'Manejo de herramientas de analítica, con GA4 indispensable',
        keyword: 'GA4',
        variants: ['Google Analytics 4', 'Google Analytics'],
        kind: 'hard',
        mandatory: true,
        weight: 2,
      },
      {
        id: 'req_6',
        text: 'Definir y dar seguimiento a KPIs en dashboards de Looker Studio o Power BI',
        keyword: 'Looker Studio',
        variants: ['Data Studio', 'Power BI'],
        kind: 'hard',
        mandatory: false,
        weight: 2,
      },
      {
        id: 'req_7',
        text: 'Excel avanzado',
        keyword: 'Excel avanzado',
        variants: ['Microsoft Excel', 'hojas de cálculo'],
        kind: 'hard',
        mandatory: true,
        weight: 2,
      },
      {
        id: 'req_8',
        text: 'SQL básico deseable',
        keyword: 'SQL',
        variants: ['SQL básico', 'consultas SQL'],
        kind: 'hard',
        mandatory: false,
        weight: 1,
      },
      {
        id: 'req_9',
        text: 'Inglés intermedio-avanzado',
        keyword: 'Inglés',
        variants: ['English', 'inglés intermedio-avanzado'],
        kind: 'hard',
        mandatory: true,
        weight: 2,
      },
      {
        id: 'req_10',
        text: 'Residir en CDMX o zona metropolitana (3 días por semana en oficina, híbrido)',
        keyword: 'CDMX',
        variants: ['Ciudad de México', 'zona metropolitana', 'híbrido'],
        kind: 'location',
        mandatory: true,
        weight: 3,
      },
      {
        id: 'req_11',
        text: 'Coordinar agencias creativas y de medios, asegurando entregas a tiempo y en presupuesto',
        keyword: 'coordinación de agencias',
        variants: ['gestión de agencias', 'manejo de proveedores'],
        kind: 'soft',
        mandatory: false,
        weight: 2,
      },
      {
        id: 'req_12',
        text: 'Gestión de presupuestos mensuales de campañas de $300–600 mil MXN',
        keyword: 'gestión de presupuesto de medios',
        variants: ['manejo de presupuesto', 'budget management'],
        kind: 'hard',
        mandatory: false,
        weight: 2,
      },
      {
        id: 'req_13',
        text: 'Proponer pruebas A/B en landing pages junto con el equipo de UX',
        keyword: 'pruebas A/B',
        variants: ['A/B testing', 'test A/B'],
        kind: 'hard',
        mandatory: false,
        weight: 1,
      },
    ],
    mappings: [
      {
        requirementId: 'req_1',
        evidenceIds: ['ev_demo_01', 'ev_demo_06', 'ev_demo_09', 'ev_demo_02'],
        strength: 'strong',
        rationale:
          'Acumulas cerca de nueve años en marketing digital (agencia, fintech y retail farmacéutico), con más de cuatro de ellos en el ecommerce de Farmacias del Valle.',
      },
      {
        requirementId: 'req_2',
        evidenceIds: ['ev_demo_01', 'ev_demo_06'],
        strength: 'strong',
        rationale:
          'Operaste Meta Ads con presupuesto propio tanto en el ecommerce de Farmacias del Valle como en la adquisición de comercios de Pagolibre.',
      },
      {
        requirementId: 'req_3',
        evidenceIds: ['ev_demo_01', 'ev_demo_06', 'cert_demo_1'],
        strength: 'strong',
        rationale:
          'Manejaste Google Ads con resultados medibles (ROAS y CAC) y cuentas con la certificación de Google Ads Search.',
      },
      {
        requirementId: 'req_4',
        evidenceIds: ['ev_demo_02', 'cert_demo_2'],
        strength: 'strong',
        rationale:
          'Diseñaste flujos de automatización y segmentación en HubSpot con impacto en recompra, respaldado por la certificación de HubSpot Marketing Software.',
      },
      {
        requirementId: 'req_5',
        evidenceIds: ['ev_demo_03', 'ev_demo_01'],
        strength: 'strong',
        rationale:
          'Usaste GA4 tanto para el tablero semanal de KPIs como para importar conversiones de compra hacia las campañas.',
      },
      {
        requirementId: 'req_6',
        evidenceIds: ['ev_demo_03'],
        strength: 'strong',
        rationale:
          'Construiste en Looker Studio el tablero de CAC, ROAS y conversión que dirección usaba para decidir presupuesto.',
      },
      {
        requirementId: 'req_7',
        evidenceIds: ['ev_demo_11'],
        strength: 'strong',
        rationale:
          'Tu modelo de presupuesto anual con tablas dinámicas, Buscar objetivo, fórmulas de búsqueda y una macro de consolidación demuestra Excel a nivel avanzado.',
      },
      {
        requirementId: 'req_8',
        evidenceIds: ['ev_demo_08'],
        strength: 'strong',
        rationale:
          'Escribías consultas con joins y agregados para armar cohortes, que es exactamente el nivel básico que pide la vacante.',
      },
      {
        requirementId: 'req_9',
        evidenceIds: ['lang_ingles', 'ev_demo_10'],
        strength: 'strong',
        rationale:
          'Tu inglés C1 está respaldado por dos años como único contacto de un cliente regional en Miami, con llamadas, presentaciones y reportes en inglés.',
      },
      {
        requirementId: 'req_10',
        evidenceIds: [],
        strength: 'strong',
        rationale:
          'Resides en Ciudad de México, lo que cumple el esquema híbrido de tres días en oficina.',
      },
      {
        requirementId: 'req_11',
        evidenceIds: ['ev_demo_04'],
        strength: 'strong',
        rationale:
          'Coordinaste agencia creativa y de medios con calendario, revisión regulatoria y control de presupuesto, cerrando 2024 por debajo del plan.',
      },
      {
        requirementId: 'req_12',
        evidenceIds: ['ev_demo_01', 'ev_demo_09', 'ev_demo_11'],
        strength: 'strong',
        rationale:
          'Administraste $450 mil MXN mensuales en Farmacias del Valle —justo dentro del rango pedido— además de $1.2M MXN agregados en agencia.',
      },
      {
        requirementId: 'req_13',
        evidenceIds: ['ev_demo_05'],
        strength: 'strong',
        rationale:
          'Propusiste y corriste con el equipo de UX pruebas A/B en la landing de recetas que subieron la conversión de 3.1% a 4.2%.',
      },
    ],
    coverage: {
      mandatoryTotal: 8,
      mandatoryStrong: 8,
      mandatoryPartial: 0,
      mandatoryMissing: 0,
      desirableTotal: 5,
      desirableStrong: 5,
      desirablePartial: 0,
      desirableMissing: 0,
      hardBlockers: [],
      verdict: 'strong',
    },
  },
  {
    id: 'app_demo_3',
    company: 'Agencia Ruta Norte',
    jobTitle: 'Performance Marketing Specialist',
    requirements: [
      {
        id: 'req_1',
        text: 'Operar campañas de Meta Ads',
        keyword: 'Meta Ads',
        variants: ['Facebook Ads', 'Instagram Ads'],
        kind: 'hard',
        mandatory: true,
        weight: 2,
      },
      {
        id: 'req_2',
        text: 'Operar campañas de Google Ads',
        keyword: 'Google Ads',
        variants: ['Google Adwords', 'SEM'],
        kind: 'hard',
        mandatory: true,
        weight: 3,
      },
      {
        id: 'req_3',
        text: 'Operar campañas de TikTok Ads',
        keyword: 'TikTok Ads',
        variants: ['TikTok for Business'],
        kind: 'hard',
        mandatory: true,
        weight: 2,
      },
      {
        id: 'req_4',
        text: 'Montar reportes semanales en Looker Studio y presentarlos al cliente',
        keyword: 'Looker Studio',
        variants: ['Google Data Studio', 'Data Studio'],
        kind: 'hard',
        mandatory: true,
        weight: 2,
      },
      {
        id: 'req_5',
        text: 'Proponer pruebas creativas y de audiencias; documentar aprendizajes',
        keyword: 'Testing creativo',
        variants: ['A/B testing', 'pruebas de audiencias'],
        kind: 'hard',
        mandatory: false,
        weight: 1,
      },
      {
        id: 'req_6',
        text: '3+ años operando campañas de performance, de preferencia en agencia',
        keyword: '3+ años en performance marketing',
        variants: ['3 años de experiencia', 'experiencia en agencia'],
        kind: 'hard',
        mandatory: true,
        weight: 2,
      },
      {
        id: 'req_7',
        text: 'Certificación vigente de Google Ads',
        keyword: 'Certificación Google Ads',
        variants: ['Google Ads certification', 'Skillshop'],
        kind: 'hard',
        mandatory: true,
        weight: 2,
      },
      {
        id: 'req_8',
        text: 'Residir en Monterrey o área metropolitana; puesto 100% presencial en San Pedro Garza García',
        keyword: 'Monterrey',
        variants: ['San Pedro Garza García', 'área metropolitana de Monterrey', 'N.L.'],
        kind: 'location',
        mandatory: true,
        weight: 3,
      },
      {
        id: 'req_9',
        text: 'Disponibilidad para visitar clientes en la zona',
        keyword: 'Visitas a clientes',
        variants: ['disponibilidad para viajar localmente'],
        kind: 'soft',
        mandatory: true,
        weight: 1,
      },
      {
        id: 'req_10',
        text: 'Inglés intermedio',
        keyword: 'Inglés intermedio',
        variants: ['intermediate English'],
        kind: 'hard',
        mandatory: true,
        weight: 1,
      },
    ],
    mappings: [
      {
        requirementId: 'req_1',
        evidenceIds: ['ev_demo_01', 'ev_demo_06'],
        strength: 'strong',
        rationale:
          'Operaste Meta Ads con $450 mil MXN mensuales en Farmacias del Valle y lideraste la adquisición en Meta para Pagolibre.',
      },
      {
        requirementId: 'req_2',
        evidenceIds: ['ev_demo_01', 'ev_demo_06', 'cert_demo_1'],
        strength: 'strong',
        rationale:
          'Manejaste Google Ads con presupuestos significativos y tienes la certificación de búsqueda que lo respalda.',
      },
      {
        requirementId: 'req_3',
        evidenceIds: [],
        strength: 'none',
        rationale:
          'TikTok Ads aparece en tu lista de habilidades pero ningún logro documenta campañas operadas ahí.',
      },
      {
        requirementId: 'req_4',
        evidenceIds: ['ev_demo_03', 'ev_demo_09'],
        strength: 'strong',
        rationale:
          'Construiste el tablero semanal en Looker Studio sobre GA4 que dirección revisaba, y en agencia ya presentabas resultados mensuales a clientes.',
      },
      {
        requirementId: 'req_5',
        evidenceIds: ['ev_demo_05', 'ev_demo_01', 'ev_demo_06'],
        strength: 'strong',
        rationale:
          'Corriste pruebas A/B en landing con resultado medible y ajustaste audiencias (cortar audiencias amplias, remarketing) con impacto en CAC y ROAS.',
      },
      {
        requirementId: 'req_6',
        evidenceIds: ['ev_demo_09', 'ev_demo_06', 'ev_demo_01'],
        strength: 'strong',
        rationale:
          'Sumas casi nueve años operando performance, incluidos dos en agencia manejando $1.2M MXN mensuales en cinco cuentas.',
      },
      {
        requirementId: 'req_7',
        evidenceIds: ['cert_demo_1'],
        strength: 'strong',
        rationale: 'Cuentas con la Google Ads Search Certification obtenida en 2024.',
      },
      {
        requirementId: 'req_8',
        evidenceIds: [],
        strength: 'none',
        rationale:
          'Radicas en Ciudad de México y el puesto exige residencia en Monterrey con presencia 100% en oficina.',
      },
      {
        requirementId: 'req_9',
        evidenceIds: ['ev_demo_10', 'ev_demo_04'],
        strength: 'partial',
        rationale:
          'Tienes trato directo con clientes y agencias, pero las visitas serían en la zona de Monterrey donde no resides.',
      },
      {
        requirementId: 'req_10',
        evidenceIds: ['lang_ingles', 'ev_demo_10'],
        strength: 'strong',
        rationale:
          'Tu inglés C1 supera el nivel intermedio y ya atendiste dos años a un cliente en Miami íntegramente en inglés.',
      },
    ],
    coverage: {
      mandatoryTotal: 9,
      mandatoryStrong: 6,
      mandatoryPartial: 1,
      mandatoryMissing: 2,
      desirableTotal: 1,
      desirableStrong: 1,
      desirablePartial: 0,
      desirableMissing: 0,
      hardBlockers: [
        {
          id: 'req_8',
          text: 'Residir en Monterrey o área metropolitana; puesto 100% presencial en San Pedro Garza García',
          keyword: 'Monterrey',
          variants: ['San Pedro Garza García', 'área metropolitana de Monterrey', 'N.L.'],
          kind: 'location',
          mandatory: true,
          weight: 3,
        },
      ],
      verdict: 'skip',
    },
  },
]
