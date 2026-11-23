/**
 * Where the app lives on its host: "/app" on rumbo.korven.dev (the landing
 * page has the root). Next prefixes its own links and router; this is for the
 * few addresses it does not see: the Worker, the service worker, reloads.
 */
export const BASE: string = process.env.NEXT_PUBLIC_BASE ?? ''
