// Serves web/out like the host would (headers, rewrites) until stopped.
import { serve } from './serve.mjs'

const port = Number(process.argv[2] ?? 4100)
serve(port)
console.log(`serving web/out on http://127.0.0.1:${port}`)
