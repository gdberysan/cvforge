// Runs before any of the app's code (Next's instrumentation-client): zod's
// eval probe is switched off before the first schema exists (see
// web/lib/zod-jitless.ts and scripts/web-csp.ts).
import './lib/zod-jitless'
