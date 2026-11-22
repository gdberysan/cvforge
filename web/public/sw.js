/* CVForge (web edition) service worker. One job for now: receive a share
 * from Android's share menu — screenshots of a posting, or a link and text —
 * keep it in IndexedDB (web/lib/shared-shots.ts reads it) and open Analizar.
 * The manifest's share_target posts multipart form data here. */
const DB = 'cvforge-share'
const STORE = 'shares'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

function save(entry) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(entry)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    }
  })
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname.replace(/\/$/, '') !== '/share-target') return
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData()
        const files = form.getAll('shots').filter((f) => f instanceof Blob && f.size > 0)
        const id = `share_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
        await save({
          id,
          at: Date.now(),
          files,
          title: String(form.get('title') || ''),
          text: String(form.get('text') || ''),
          url: String(form.get('url') || ''),
        })
        return Response.redirect(`/share/?shared=${encodeURIComponent(id)}`, 303)
      } catch {
        return Response.redirect('/share/?shared=failed', 303)
      }
    })(),
  )
})
