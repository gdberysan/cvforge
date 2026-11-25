import type { MetadataRoute } from 'next'

/** The dark --surface-base (styles/korven/colors.css). */
const BACKGROUND = '#0E131B'

/**
 * Installs CVForge on the phone (Chrome makes it a WebAPK, which is what puts
 * it in Android's share menu). The share target lands on /share
 * (app/(app)/share/page.tsx).
 */
export default function manifest(): MetadataRoute.Manifest & {
  share_target: {
    action: string
    method: 'GET'
    params: { title: string; text: string; url: string }
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
      action: '/share',
      method: 'GET',
      params: { title: 'title', text: 'text', url: 'url' },
    },
  }
}
