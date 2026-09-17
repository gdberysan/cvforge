/**
 * Next loads .env.local for the app; scripts run outside Next. Imported first,
 * as a side effect, so it is evaluated before any module that reads the env.
 */
try {
  process.loadEnvFile?.('.env.local')
} catch {
  // No .env.local — the SDK may still resolve an OAuth profile, and the
  // bundle check still scans for the key shape and env access.
}
