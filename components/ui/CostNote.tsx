'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import type { SpendAction } from '@/lib/ai/spend-context'

/**
 * What a paid button usually costs, said before it is pressed: the median of
 * this action's own runs here (app/api/spend), else a measured estimate for
 * the three actions that have one, else nothing (never a guess).
 */
type Spend = {
  typical: Partial<Record<SpendAction, number | null>>
  application: { usd: number; unknown: number } | null
}

/** Measured on real runs (2026-11): a posting's analysis, a CV, a CV import. */
const ESTIMATE: Partial<Record<SpendAction, number>> = { analysis: 0.04, cv: 0.35, import: 0.18 }

/** An estimate in cents: "about $0.04", never "$0.0400". */
const approx = (usd: number) => `$${Math.max(0.01, usd).toFixed(2)}`

let loaded: Promise<Spend | null> | null = null
function load(applicationId?: string): Promise<Spend | null> {
  const fetchIt = () =>
    fetch(`/api/spend${applicationId ? `?applicationId=${encodeURIComponent(applicationId)}` : ''}`)
      .then((r) => (r.ok ? (r.json() as Promise<Spend>) : null))
      .catch(() => null)
  if (applicationId) return fetchIt()
  loaded ??= fetchIt()
  return loaded
}

export function CostNote({ action }: { action: SpendAction }) {
  const t = useT()
  const [usd, setUsd] = useState<{ value: number; measuredHere: boolean } | null>(null)
  useEffect(() => {
    let live = true
    void load().then((s) => {
      if (!live) return
      const here = s?.typical?.[action]
      if (typeof here === 'number' && here > 0) setUsd({ value: here, measuredHere: true })
      else if (ESTIMATE[action] !== undefined)
        setUsd({ value: ESTIMATE[action] as number, measuredHere: false })
    })
    return () => {
      live = false
    }
  }, [action])
  if (!usd) return null
  return (
    <span className="cost-note">
      {t(usd.measuredHere ? 'cost.usual' : 'cost.estimate', { usd: approx(usd.value) })}
    </span>
  )
}

/** What this application's own model calls have cost so far. */
export function ApplicationSpend({ applicationId }: { applicationId: string }) {
  const t = useT()
  const [spend, setSpend] = useState<{ usd: number; unknown: number } | null>(null)
  useEffect(() => {
    let live = true
    void load(applicationId).then((s) => live && setSpend(s?.application ?? null))
    return () => {
      live = false
    }
  }, [applicationId])
  if (!spend || (spend.usd === 0 && spend.unknown === 0)) return null
  return (
    <p className="cost-note">
      {t(spend.unknown > 0 ? 'cost.applicationUnknown' : 'cost.application', {
        usd: approx(spend.usd),
        n: spend.unknown,
      })}
    </p>
  )
}
