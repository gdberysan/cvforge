import { SAMPLE_POSTING, SAMPLE_POSTING_MARKET } from '@/lib/onboarding/sample-posting'
import type { EvidenceItem, MasterProfile, OutcomeEvent } from '@/lib/schemas'

/**
 * Lucas Lara — a fictional digital-marketing coordinator in Mexico City.
 * Every employer, figure and date below is invented. The career is shaped so
 * the three demo postings tell three stories: a clear strong, a worth-it
 * with an honest gap, and a skip on a hard blocker.
 */
export const PERSONA_PROFILE: MasterProfile = {
  basics: {
    fullName: 'Lucas Lara',
    headline: 'Coordinador de Marketing Digital · performance, CRM y analítica',
    email: 'lucas.lara@example.com',
    location: 'Ciudad de México',
    timezone: 'America/Mexico_City',
    links: [{ label: 'LinkedIn', url: 'linkedin.com/in/lucaslara-demo' }],
  },
  summary:
    'Siete años operando marketing digital para retail, fintech y agencia: campañas de performance en Meta y Google, CRM con HubSpot, analítica en GA4 y Looker Studio. Me gusta el trabajo donde el número de la semana siguiente depende de lo que cambié esta semana.',
  experience: [
    {
      id: 'role_demo_1',
      title: 'Coordinador de Marketing Digital',
      company: 'Farmacias del Valle',
      location: 'Ciudad de México',
      period: { start: '2021-03', end: '2025-06' },
      summary:
        'Cadena de 140 farmacias en el centro del país. Coordiné performance, CRM y analítica para la tienda en línea y el programa de lealtad.',
    },
    {
      id: 'role_demo_2',
      title: 'Especialista de Growth',
      company: 'Pagolibre',
      location: 'Ciudad de México',
      period: { start: '2018-08', end: '2021-02' },
      summary:
        'Fintech de pagos para pequeños comercios. Adquisición digital y activación de comercios nuevos.',
    },
    {
      id: 'role_demo_3',
      title: 'Ejecutivo de Cuentas Digitales',
      company: 'Agencia Brisa',
      location: 'Ciudad de México',
      period: { start: '2016-06', end: '2018-07' },
      summary:
        'Agencia digital boutique. Operación de campañas y reportes para cinco cuentas de consumo.',
    },
  ],
  education: [
    {
      id: 'edu_demo_1',
      institution: 'Universidad Autónoma Metropolitana',
      degree: 'Licenciatura en Administración, concentración en Mercadotecnia',
      period: { start: '2011-08', end: '2016-01' },
    },
  ],
  skills: [
    { category: 'Performance', items: ['Meta Ads', 'Google Ads', 'TikTok Ads'] },
    {
      category: 'CRM y automatización',
      items: ['HubSpot', 'Salesforce Marketing Cloud (básico)', 'Klaviyo'],
    },
    { category: 'Analítica', items: ['GA4', 'Looker Studio', 'Excel avanzado', 'SQL básico'] },
    { category: 'Producto', items: ['Pruebas A/B', 'Figma (lectura de diseños)'] },
  ],
  languages: [
    { language: 'Español', level: 'native' },
    { language: 'Inglés', level: 'C1' },
  ],
  certifications: [
    {
      id: 'cert_demo_1',
      name: 'Google Ads Search Certification',
      issuer: 'Google',
      date: '2024-02',
    },
    {
      id: 'cert_demo_2',
      name: 'HubSpot Marketing Software',
      issuer: 'HubSpot Academy',
      date: '2022-09',
    },
  ],
  projects: [],
  workAuthorization: [{ country: 'MX', status: 'ciudadano' }],
  preferences: {
    targetTitles: [
      'Coordinador de Marketing Digital',
      'Growth Lead',
      'Performance Marketing Manager',
    ],
    markets: ['mx'],
  },
  updatedAt: '2026-08-21T00:00:00.000Z',
}

const r1 = { type: 'experience' as const, id: 'role_demo_1' }
const r2 = { type: 'experience' as const, id: 'role_demo_2' }
const r3 = { type: 'experience' as const, id: 'role_demo_3' }
const p1 = { start: '2021-03', end: '2025-06' }
const p2 = { start: '2018-08', end: '2021-02' }
const p3 = { start: '2016-06', end: '2018-07' }

export const PERSONA_EVIDENCE: EvidenceItem[] = [
  {
    id: 'ev_demo_01',
    kind: 'achievement',
    sourceRef: r1,
    period: p1,
    strength: 'core',
    origin: 'manual',
    tags: ['meta ads', 'google ads', 'roas'],
    text: 'Operé campañas de Meta Ads y Google Ads con un presupuesto mensual de $450 mil MXN para la tienda en línea de Farmacias del Valle; el ROAS combinado pasó de 2.1 a 3.4 en seis meses al reestructurar por categoría y pasar de pujas manuales a tCPA con conversiones de compra importadas desde GA4.',
    metrics: [
      {
        raw: 'presupuesto mensual de $450 mil MXN',
        value: 450_000,
        unit: 'MXN',
        currency: 'MXN',
      },
      { raw: 'ROAS de 2.1 a 3.4', value: 3.4, unit: 'x', direction: 'up' },
    ],
  },
  {
    id: 'ev_demo_02',
    kind: 'achievement',
    sourceRef: r1,
    period: p1,
    strength: 'core',
    origin: 'manual',
    tags: ['hubspot', 'crm', 'recompra'],
    text: 'Diseñé en HubSpot los flujos de recompra del programa de lealtad (recordatorio de tratamiento crónico, carrito abandonado, reactivación a 90 días); la tasa de recompra a 60 días subió de 18% a 27% en el segmento de enfermedades crónicas.',
    metrics: [{ raw: 'recompra a 60 días de 18% a 27%', value: 27, unit: '%', direction: 'up' }],
  },
  {
    id: 'ev_demo_03',
    kind: 'achievement',
    sourceRef: r1,
    period: p1,
    strength: 'core',
    origin: 'manual',
    tags: ['ga4', 'looker studio', 'kpis'],
    text: 'Construí el tablero semanal de marketing en Looker Studio sobre GA4 y datos de ventas (CAC, ROAS por canal, conversión por categoría); se volvió el reporte que dirección revisaba los lunes y con el que se decidía el presupuesto del mes.',
    metrics: [],
  },
  {
    id: 'ev_demo_04',
    kind: 'achievement',
    sourceRef: r1,
    period: p1,
    strength: 'supporting',
    origin: 'manual',
    tags: ['agencias', 'presupuesto'],
    text: 'Coordiné a la agencia creativa y a la agencia de medios: calendario mensual de piezas, revisión de copys con el área regulatoria (publicidad de medicamentos) y control del presupuesto contra el plan; cerramos 2024 a 2% por debajo del presupuesto anual aprobado.',
    metrics: [
      { raw: '2% por debajo del presupuesto anual', value: 2, unit: '%', direction: 'down' },
    ],
  },
  {
    id: 'ev_demo_05',
    kind: 'achievement',
    sourceRef: r1,
    period: p1,
    strength: 'supporting',
    origin: 'manual',
    tags: ['a/b', 'ux', 'landing'],
    text: 'Propuse y corrí con el equipo de UX una serie de pruebas A/B en la landing de recetas electrónicas; la variante ganadora (formulario en dos pasos) subió la conversión del 3.1% al 4.2%.',
    metrics: [{ raw: 'conversión del 3.1% al 4.2%', value: 4.2, unit: '%', direction: 'up' }],
  },
  {
    id: 'ev_demo_06',
    kind: 'achievement',
    sourceRef: r2,
    period: p2,
    strength: 'core',
    origin: 'manual',
    tags: ['fintech', 'adquisición', 'cac'],
    text: 'En Pagolibre lideré la adquisición digital de comercios nuevos (Meta, Google, afiliados) como único responsable del canal; el CAC bajó de $1,450 a $890 MXN por comercio activado en un año, principalmente al cortar audiencias amplias y concentrar la inversión en búsqueda de marca y remarketing a registros incompletos.',
    metrics: [
      {
        raw: 'CAC de $1,450 a $890 MXN',
        value: 890,
        unit: 'MXN',
        currency: 'MXN',
        direction: 'down',
      },
    ],
  },
  {
    id: 'ev_demo_07',
    kind: 'achievement',
    sourceRef: r2,
    period: p2,
    strength: 'core',
    origin: 'manual',
    tags: ['activación', 'email', 'onboarding'],
    text: 'Monté la secuencia de onboarding por email y WhatsApp para comercios recién registrados; la activación (primer cobro en 14 días) pasó de 41% a 56%.',
    metrics: [{ raw: 'activación de 41% a 56%', value: 56, unit: '%', direction: 'up' }],
  },
  {
    id: 'ev_demo_08',
    kind: 'achievement',
    sourceRef: r2,
    period: p2,
    strength: 'supporting',
    origin: 'manual',
    tags: ['sql', 'analítica'],
    text: 'Mi SQL es básico: escribía consultas sencillas (joins y agregados sobre las tablas de registros y transacciones) para armar cohortes de activación; los modelos más complejos los construía el equipo de datos, no yo.',
    metrics: [],
  },
  {
    id: 'ev_demo_11',
    kind: 'achievement',
    sourceRef: r1,
    period: p1,
    strength: 'supporting',
    origin: 'manual',
    tags: ['excel', 'presupuesto', 'modelo'],
    text: 'Construí en Excel el modelo de presupuesto anual de marketing de Farmacias del Valle: tablas dinámicas sobre el histórico de inversión por canal, escenarios con Buscar objetivo, fórmulas de búsqueda y validación, y una macro que consolidaba cada mes los reportes de las dos agencias en una sola hoja de control; fue la herramienta con la que se negoció el presupuesto 2024.',
    metrics: [],
  },
  {
    id: 'ev_demo_09',
    kind: 'achievement',
    sourceRef: r3,
    period: p3,
    strength: 'supporting',
    origin: 'manual',
    tags: ['agencia', 'reportes', 'cuentas'],
    text: 'En Agencia Brisa operé campañas y reportes mensuales para cinco cuentas de consumo (bebidas, cuidado personal); gestioné un presupuesto agregado de unos $1.2M MXN al mes y presenté resultados al cliente cada mes.',
    metrics: [
      {
        raw: 'presupuesto agregado de $1.2M MXN al mes',
        value: 1_200_000,
        unit: 'MXN',
        currency: 'MXN',
      },
    ],
  },
  {
    id: 'ev_demo_10',
    kind: 'achievement',
    sourceRef: r3,
    period: p3,
    strength: 'supporting',
    origin: 'manual',
    tags: ['inglés', 'clientes'],
    text: 'Atendí en inglés, como único punto de contacto, a un cliente regional con sede en Miami durante dos años: llamadas semanales de estatus, presentaciones trimestrales de resultados al director regional y todos los reportes escritos en inglés.',
    metrics: [],
  },
]

const POSTING_2 = `Growth Lead — Nuvei Pagos (fintech) · Remoto, México

Quiénes somos
Plataforma de cobros para comercios medianos en México. Equipo de growth de cuatro personas; reportas a la Directora de Marketing.

Qué harás
- Definir y ejecutar la estrategia de adquisición de comercios: paid (Meta, Google, LinkedIn), afiliados y alianzas.
- Diseñar experimentos de activación y retención con el equipo de producto; medir en Amplitude.
- Construir modelos de cohortes y LTV/CAC en SQL; presentar a dirección cada mes.
- Coordinar a un analista y a una agencia de performance.

Requisitos
- 5+ años en marketing digital o growth, al menos 2 en fintech o productos financieros.
- Experiencia operando presupuestos de performance superiores a $500 mil MXN mensuales.
- SQL avanzado (CTEs, window functions) — indispensable; Python deseable.
- Experiencia con herramientas de analítica de producto (Amplitude o Mixpanel).
- Inglés avanzado (equipo regional).
- Residencia en México; trabajo remoto con reuniones en horario de CDMX.

Ofrecemos
- Esquema 100% remoto, prestaciones superiores, bono anual por objetivos.
`

const POSTING_3 = `Performance Marketing Specialist — Agencia Ruta Norte · Monterrey, N.L. (presencial)

Sobre la agencia
Agencia de performance con 30 personas en San Pedro Garza García. Atendemos marcas de retail, automotriz y educación del norte del país.

Responsabilidades
- Operar campañas de Meta Ads, Google Ads y TikTok Ads para 6–8 cuentas.
- Montar reportes semanales en Looker Studio y presentarlos al cliente.
- Proponer pruebas creativas y de audiencias; documentar aprendizajes.

Requisitos
- 3+ años operando campañas de performance, de preferencia en agencia.
- Certificación vigente de Google Ads.
- Residir en Monterrey o área metropolitana. El puesto es 100% presencial en nuestras oficinas de San Pedro; no se considera trabajo remoto ni reubicación pagada.
- Disponibilidad para visitar clientes en la zona.
- Inglés intermedio.

Ofrecemos
- Sueldo base más bono trimestral por resultados, prestaciones de ley.
`

export const PERSONA_POSTINGS = [
  {
    id: 'app_demo_1' as const,
    source: 'linkedin' as const,
    market: SAMPLE_POSTING_MARKET,
    text: SAMPLE_POSTING,
    expectedVerdict: 'strong' as const,
  },
  {
    id: 'app_demo_2' as const,
    source: 'linkedin' as const,
    market: 'mx' as const,
    text: POSTING_2,
    expectedVerdict: 'worth-it' as const,
  },
  {
    id: 'app_demo_3' as const,
    source: 'other' as const,
    market: 'mx' as const,
    text: POSTING_3,
    expectedVerdict: 'skip' as const,
  },
]

/** app_demo_1 was sent and got a screen; app_demo_2 has its kit but is unsent (Today panel); app_demo_3 is skipped. */
export const PERSONA_OUTCOMES: Record<string, OutcomeEvent[]> = {
  app_demo_1: [
    { at: '2026-08-11T15:00:00.000Z', type: 'applied' },
    { at: '2026-08-18T16:30:00.000Z', type: 'screen' },
  ],
  app_demo_2: [],
  app_demo_3: [],
}
