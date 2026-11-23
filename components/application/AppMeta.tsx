import type { ReactNode } from 'react'

/**
 * The fact line under an application's title (mockup Seguimiento2), on the
 * overview and every step: company · market · CV language · Ver vacante.
 * The separator leads each fact and the one that would open a wrapped line
 * is clipped off the left edge (.app-meta), so no line ever starts or ends
 * with a stray "·". A div, not a <p>: the posting sheet passed as `last` is
 * a <dialog>, which a paragraph cannot hold.
 */
export function AppMeta({ facts, last }: { facts: string[]; last: ReactNode }) {
  return (
    <div className="app-meta">
      <div className="app-meta-list">
        {facts.filter(Boolean).map((fact, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a static list; two facts may read alike
          <span key={i} className="app-meta-item">
            {fact}
          </span>
        ))}
        <span className="app-meta-item">{last}</span>
      </div>
    </div>
  )
}
