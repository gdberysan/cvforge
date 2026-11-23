// node:fs / node:path inside the Worker exist only for desktop-only branches
// (the demo seed, files beside the database). Reaching one is a bug: say so.
const nope = (name: string) => () => {
  throw new Error(`${name} is not available in the browser edition`)
}
export const readFileSync = nope('readFileSync')
export const existsSync = nope('existsSync')
export const writeFileSync = nope('writeFileSync')
export const join = (...parts: string[]) => parts.join('/')
export const dirname = (p: string) => p.replace(/\/[^/]*$/, '')
export default { join, dirname }
