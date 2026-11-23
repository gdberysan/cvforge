'use client'

/**
 * The hand-off from the service worker (web/public/sw.js), which receives a
 * share from Android, to the page that reads it. One IndexedDB store; the
 * page takes an entry and deletes it, so a share is read once.
 */
export type SharedEntry = {
  id: string
  at: number
  files: Blob[]
  title: string
  text: string
  url: string
}

const DB = 'cvforge-share'
const STORE = 'shares'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function takeShared(id: string): Promise<SharedEntry | null> {
  const db = await open()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const get = store.get(id)
      get.onsuccess = () => {
        const entry = (get.result as SharedEntry | undefined) ?? null
        if (entry) store.delete(id)
        tx.oncomplete = () => resolve(entry)
      }
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}
