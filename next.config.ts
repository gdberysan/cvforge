import type { NextConfig } from 'next'

const config: NextConfig = {
  // The release ships this build: a self-contained server plus the traced
  // node_modules, so a user machine never runs npm or a compiler.
  //
  // Never on Vercel, which builds its own serverless bundles and injects an
  // onBuildComplete hook that reads `.next/next-server.js.nft.json`. Standalone
  // output relocates that trace, so every demo deployment died with an ENOENT
  // for it — after a green `next build`, which is why it read as a platform
  // outage rather than a config problem. `vercel build` locally does not
  // reproduce it: the hooks are remote-only.
  //
  // The release never runs on Vercel, so it always takes the standalone path,
  // and scripts/release.ts aborts if `.next/standalone/server.js` is missing.
  output: process.env.VERCEL ? undefined : 'standalone',
  // better-sqlite3 is a native module and must not be bundled.
  serverExternalPackages: ['better-sqlite3'],
  // Migrations and the demo seed are read from disk at runtime — make sure
  // every server function's trace carries them (demo deploys to Vercel).
  // Only the demo's data: persona.ts is the seed BUILDER's input and shipped
  // TypeScript source to every user when the whole directory was traced.
  outputFileTracingIncludes: {
    '/*': ['./drizzle/**/*', './demo/seed.json', './demo/pdf/**/*'],
  },
  // The tracer's own analysis of `path.join(process.cwd(), 'demo', …)` still
  // stages the whole directory, so the one file that must not ship is named
  // exactly. Only ever an exact path here: a './dist/**' glob once pruned
  // node_modules/next/dist too and broke every API route in the standalone
  // build. The release keeps its runtime cache outside the project instead,
  // so the tracer never meets it.
  outputFileTracingExcludes: {
    '/*': ['./demo/persona.ts'],
  },
  typescript: { ignoreBuildErrors: false },
}

export default config
