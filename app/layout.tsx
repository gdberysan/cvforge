import type { Metadata } from 'next'
import { inter, jetbrainsMono, spaceGrotesk } from '@/lib/fonts'
import { getLocale, getTranslate } from '@/lib/i18n/server'
import './globals.css'

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
    <html
      lang={locale}
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}
