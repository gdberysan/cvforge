import type { Metadata, Viewport } from 'next'
import { BRAND } from '@/lib/brand'
import { geist, headline, kicker, marker, stamp, voice } from '@/lib/fonts'
import { DatabaseProvider } from '@/web/lib/database'
import { WebLocale } from '@/web/lib/locale'
import { RegisterServiceWorker } from '@/web/lib/service-worker'
import { Shell } from './shell'
import './web.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F6F4EF',
}

export const metadata: Metadata = {
  title: BRAND,
  description:
    'Job applications grounded in what you actually did. Your data stays in your browser.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${geist.variable} ${headline.variable} ${voice.variable} ${kicker.variable} ${stamp.variable} ${marker.variable}`}
    >
      <body>
        <RegisterServiceWorker />
        <WebLocale>
          <DatabaseProvider>
            <Shell>{children}</Shell>
          </DatabaseProvider>
        </WebLocale>
      </body>
    </html>
  )
}
