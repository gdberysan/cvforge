import { describe, expect, it } from 'vitest'
import { clearDraft, loadDraft, saveDraft } from '@/lib/interview/draft'
import type { InterviewQuestion } from '@/lib/schemas'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size
    },
  }
}

const questions: InterviewQuestion[] = [
  {
    id: 'q1',
    targetStubId: 'ev_1',
    question: 'What was broken?',
    why: 'scope',
    probesFor: 'context',
  },
]

const fp = { locale: 'en' as const, company: 'Northwind Gaming', title: 'Marketing Coordinator' }

describe('interview drafts', () => {
  it('round-trips questions and answers per role', () => {
    const storage = memoryStorage()
    saveDraft(storage, 'exp_1', fp, { questions, answers: { q1: 'The address step.' } })

    const draft = loadDraft(storage, 'exp_1', fp)
    expect(draft?.questions[0].question).toBe('What was broken?')
    expect(draft?.answers.q1).toBe('The address step.')
    expect(loadDraft(storage, 'exp_2', fp)).toBeNull()
  })

  it('returns null for corrupt or wrong-shaped stored data instead of throwing', () => {
    const storage = memoryStorage()
    storage.setItem('cvforge.interview.exp_1', 'not json {{{')
    expect(loadDraft(storage, 'exp_1', fp)).toBeNull()

    storage.setItem('cvforge.interview.exp_1', JSON.stringify({ answers: 'wrong' }))
    expect(loadDraft(storage, 'exp_1', fp)).toBeNull()
  })

  it('clears a draft once the interview is accepted', () => {
    const storage = memoryStorage()
    saveDraft(storage, 'exp_1', fp, { questions, answers: {} })
    clearDraft(storage, 'exp_1')
    expect(loadDraft(storage, 'exp_1', fp)).toBeNull()
  })

  it('survives a storage that throws, because a full disk must not break typing', () => {
    const throwing = {
      ...memoryStorage(),
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(() => saveDraft(throwing, 'exp_1', fp, { questions, answers: {} })).not.toThrow()
  })

  it('does not resume a draft written for a different role now sitting at the same id', () => {
    const storage = memoryStorage()
    saveDraft(
      storage,
      'exp_1',
      { locale: 'en', company: 'Globex.com', title: 'Support Coordinator' },
      { questions, answers: { q1: 'About Globex.' } },
    )
    // Same id, now a different role — e.g. after a re-import reassigned it.
    const draft = loadDraft(storage, 'exp_1', {
      locale: 'en',
      company: 'Northwind Gaming',
      title: 'Marketing Coordinator',
    })
    expect(draft).toBeNull()
  })

  it('does not resume a draft written in a different locale', () => {
    const storage = memoryStorage()
    saveDraft(storage, 'exp_1', fp, { questions, answers: { q1: 'In English.' } })
    expect(loadDraft(storage, 'exp_1', { ...fp, locale: 'es' })).toBeNull()
  })

  it('resumes a matching draft for the same role and locale', () => {
    const storage = memoryStorage()
    const esFp = {
      locale: 'es' as const,
      company: 'Northwind Gaming',
      title: 'Marketing Coordinator',
    }
    saveDraft(storage, 'exp_1', esFp, { questions, answers: { q1: 'En español.' } })
    expect(loadDraft(storage, 'exp_1', esFp)?.answers.q1).toBe('En español.')
  })
})
