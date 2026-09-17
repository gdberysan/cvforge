import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google'

/**
 * The Korven typefaces, self-hosted at build time. The brand handoff loads
 * these from the Google Fonts CDN; next/font inlines them instead, so the app
 * makes no external requests (see spec §11).
 */
export const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display-loaded',
  display: 'swap',
})

export const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-text-loaded',
  display: 'swap',
})

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-mono-loaded',
  display: 'swap',
})
