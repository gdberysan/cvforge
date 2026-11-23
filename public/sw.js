/* CVForge service worker — three jobs only (spec §3): an offline page when
 * the Mac is unreachable, push notifications, and caching the versioned
 * static files. Pages and /api/* are never cached: they always come fresh
 * from the Mac and nothing personal is left in the phone's cache. */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const CACHE = `cvforge-static-${VERSION}`
const OFFLINE = '/offline.html'

function shouldCache(url) {
  const u = new URL(url)
  if (u.origin !== self.location.origin) return false
  return (
    u.pathname.startsWith('/_next/static/') ||
    u.pathname.startsWith('/icons/') ||
    u.pathname === OFFLINE
  )
}
self.__shouldCache = shouldCache

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([OFFLINE, '/icons/icon-192.png']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('cvforge-static-') && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)))
    return
  }
  if (!shouldCache(request.url)) return
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy))
          }
          return res
        }),
    ),
  )
})

// The Mac always sends "ready" pushes — whether the phone is still watching
// cannot be told from the connection, because Android keeps a backgrounded
// tab connected. The phone knows: if the app is in front, stay silent —
// except for a test, which the person sent from Ajustes precisely to see it.
self.addEventListener('push', (event) => {
  const msg = event.data ? event.data.json() : null
  if (!msg) return
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const inFront = windows.some((w) => w.focused && w.visibilityState === 'visible')
      if (inFront && msg.tag !== 'test') return
      return self.registration.showNotification(msg.title, {
        body: msg.body,
        tag: msg.tag,
        data: { url: msg.url },
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
      })
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => 'focus' in w)
      // navigate() rejects for a window this worker does not control yet;
      // then a fresh window still takes the tap where it should go.
      if (open)
        return open
          .navigate(url)
          .then((w) => (w || open).focus())
          .catch(() => self.clients.openWindow(url))
      return self.clients.openWindow(url)
    }),
  )
})
