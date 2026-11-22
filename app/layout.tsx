import type { Metadata, Viewport } from 'next'
import { ServiceWorker } from '@/components/pwa/ServiceWorker'
import { geist, marker, stamp } from '@/lib/fonts'
import { getLocale, getTranslate } from '@/lib/i18n/server'
import './globals.css'

/** Edge to edge on the S25 (content respects safe-area insets in CSS); status bar matches the warm canvas. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F6F4EF',
}

/** The tab follows the UI language; only the name itself is invariant. */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslate()
  return { title: 'CVForge', description: t('meta.description') }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // lang drives hyphenation, spellcheck and screen-reader pronunciation, so it
  // has to follow the chosen locale rather than being hard-coded to English.
  const locale = await getLocale()

  return (
    <html lang={locale} className={`${geist.variable} ${stamp.variable} ${marker.variable}`}>
      <body>
        <ServiceWorker buildId={process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'} />
        {children}
      </body>
    </html>
  )
}
