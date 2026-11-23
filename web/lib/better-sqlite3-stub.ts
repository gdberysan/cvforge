// The web edition always hands drizzle an open wasm handle; the native
// library drizzle's driver imports to open a file path is never reached.
export default class Database {
  constructor() {
    throw new Error('better-sqlite3 is not available in the browser')
  }
}
