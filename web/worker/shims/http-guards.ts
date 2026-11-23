// The desktop's request guards, inside the Worker. There is no network door:
// only this person's own page can post to the Worker, so every call is local.
export async function macOnlyRefusal(): Promise<null> {
  return null
}
export function isSameOriginRequest(): boolean {
  return true
}
export function tailnetConfig(): null {
  return null
}
export function doorOf(): 'local' {
  return 'local'
}
