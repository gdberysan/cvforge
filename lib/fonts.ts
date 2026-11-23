// lib/fonts.ts
import { Archivo_Black, Geist, Permanent_Marker } from 'next/font/google'

/**
 * CVForge's one typeface, self-hosted at build time by next/font, so the app
 * makes no external requests (spec §11). One modern sans for everything a
 * person reads or operates (friendly redesign 2026-11-21): the serif headings
 * and monospace facts made the app read as an instrument, not a helper.
 */
export const geist = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-text-loaded',
  display: 'swap',
})

/**
 * The print-shop layer (Imprenta rebelde): a heavy grotesque for rubber
 * stamps and a felt marker for the hand-drawn notes. Both self-hosted by
 * next/font like Geist; used only for those marks, never for reading.
 */
export const stamp = Archivo_Black({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-stamp-loaded',
  display: 'swap',
})

export const marker = Permanent_Marker({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-marker-loaded',
  display: 'swap',
})
