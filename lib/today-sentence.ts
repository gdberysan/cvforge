import { type Locale, plural, type Translate } from '@/lib/i18n'
import { localeTag } from '@/lib/locale-tag'

export function greetingKey(hour: number): 'greet.morning' | 'greet.afternoon' | 'greet.evening' {
  return hour < 12 ? 'greet.morning' : hour < 19 ? 'greet.afternoon' : 'greet.evening'
}

/** Today in one sentence, from the counts the page already has. Never a model call. */
export function todaySentence(
  t: Translate,
  locale: Locale,
  c: { needs: number; waiting: number },
): string {
  const parts = [
    c.needs > 0 && plural(t, c.needs, 'todaySay.needs'),
    c.waiting > 0 && plural(t, c.waiting, 'todaySay.waiting'),
  ].filter((p): p is string => typeof p === 'string')
  if (parts.length === 0) return t('todaySay.calm')
  const body = new Intl.ListFormat(localeTag(locale), { type: 'conjunction' }).format(parts)
  const sentence = c.needs === 0 ? t('todaySay.nothingUrgent', { rest: body }) : body
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`
}
