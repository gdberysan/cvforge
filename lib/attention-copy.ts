import type { Step } from '@/lib/application-steps'
import type { Translate } from '@/lib/i18n'
import type { AttentionItem } from '@/lib/stats'

/** The one line saying why an application is asking for you — shared by Hoy and Postulaciones. */
export function attentionWhy(t: Translate, item: AttentionItem): string {
  switch (item.reason) {
    case 'stale':
      return t('today.staleDays', { n: item.daysSinceApplied ?? 0 })
    case 'unsent':
      return t('today.unsent')
    case 'decide':
      return t('today.decide')
    case 'interviewing':
      return t('today.interviewing')
  }
}

/** Where each reason's next move lives on the application page. */
export const ATTENTION_STEP: Record<AttentionItem['reason'], Step> = {
  interviewing: 'track',
  stale: 'track',
  decide: 'decide',
  unsent: 'send',
}
