import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'
import { BASE } from '@/web/lib/base'

/** --surface-base of the one light theme (app/globals.css): the splash and bar match the app. */
const BACKGROUND = '#F6F4EF'

/**
 * Installs the web edition (Chrome makes it a WebAPK, which is what puts it
 * in Android's share menu). A share — screenshots of a posting, or a link
 * and text — is posted to /share-target, received by web/public/sw.js, and
 * opened on Analizar.
 */
export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest & {
  share_target: {
    action: string
    method: 'POST'
    enctype: 'multipart/form-data'
    params: {
      title: string
      text: string
      url: string
      files: { name: string; accept: string[] }[]
    }
  }
} {
  return {
    id: `${BASE}/`,
    name: BRAND,
    short_name: BRAND,
    start_url: `${BASE}/`,
    scope: `${BASE}/`,
    display: 'standalone',
    background_color: BACKGROUND,
    theme_color: BACKGROUND,
    icons: [
      { src: `${BASE}/icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${BASE}/icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
      {
        src: `${BASE}/icons/maskable-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    share_target: {
      action: `${BASE}/share-target`,
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        files: [{ name: 'shots', accept: ['image/png', 'image/jpeg', 'image/webp', 'image/*'] }],
      },
    },
  }
}
