/**
 * The app follows the system's light/dark setting unless the person picks
 * one in Ajustes. A cookie, like the language: read on the server, so the
 * first paint is already in the right theme — no flash of dark on a light
 * machine.
 */
export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]
export const THEME_COOKIE = 'cvforge_theme'

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}
