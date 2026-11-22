import type { MetadataRoute } from 'next'

/** The dark --surface-base (styles/korven/colors.css). */
const BACKGROUND = '#0E131B'

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
    id: '/',
    name: 'CVForge',
    short_name: 'CVForge',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: BACKGROUND,
    theme_color: BACKGROUND,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    share_target: {
      action: '/share-target',
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
