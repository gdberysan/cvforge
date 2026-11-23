import { notFound } from 'next/navigation'
import { Gallery } from '@/components/ui/Gallery'

/**
 * Every primitive in every state — the place to judge a change before it
 * ships. Development only: production builds answer 404, and the release
 * boot gate checks that. One theme per visit (the tokens key off <html>);
 * switch it in Ajustes, the ui:sweep covers both.
 */
export default async function MuestrarioPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <main id="main" tabIndex={-1} className="page">
      <Gallery />
    </main>
  )
}
