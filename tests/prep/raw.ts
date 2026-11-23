import type { ModelPrep } from '@/lib/schemas/prep'

const beat = (text: string, cites: string[] = [], ask = '', ideas: string[] = []) => ({
  text,
  citedEvidenceIds: cites,
  ask,
  ideas,
})

/** A model answer shaped like the real thing; tests override parts. */
export function rawPrep(over: Partial<ModelPrep> = {}): ModelPrep {
  return {
    questions: [
      {
        id: 'q1',
        text: 'How do you use data to grow a marketplace?',
        requirementIds: ['req_1'],
        why: 'mandatory',
        answeredBy: 's1',
        know: '',
      },
      {
        id: 'q2',
        text: 'How comfortable are you with SQL?',
        requirementIds: ['req_2'],
        why: 'no evidence',
        answeredBy: 'g1',
        know: '',
      },
      {
        id: 'q3',
        text: 'Tell me about a time you worked across teams',
        requirementIds: ['req_3'],
        why: 'desirable',
        answeredBy: '',
        know: '',
      },
    ],
    stories: [
      {
        id: 's1',
        title: 'The funnel at Shopco',
        situation: beat('Sellers stalled between sign-up and first sale.', ['ev_funnel']),
        task: beat('', [], 'Tu registro no dice cuál era la meta.', [
          '¿Qué pedía tu jefe cuando empezaste?',
          'Más vendedores activos o que vendieran más rápido',
          '¿Bajó de 30 días a 10 el tiempo a la primera venta?',
        ]),
        action: beat('I automated the conversion funnel.', ['ev_funnel']),
        result: beat('The conversion rate held at 60%.', ['ev_funnel']),
        short: ['Shopco, sellers stalled', 'Automated the funnel', '60% CR, steady'],
      },
    ],
    cvDefense: [
      {
        bulletId: 'b1',
        likelyQuestion: 'How did you measure the 60%?',
        facts: { text: 'The CR was 60%.', citedEvidenceIds: ['ev_funnel'] },
      },
    ],
    gapAnswers: [
      {
        id: 'g1',
        requirementId: 'req_2',
        admit: "I haven't used SQL in a job.",
        bridge: {
          text: 'I automated the funnel reporting myself.',
          citedEvidenceIds: ['ev_funnel'],
        },
        plan: "I'd take a SQL course in the first month.",
      },
    ],
    interviewerNote: '',
    ...over,
  }
}
