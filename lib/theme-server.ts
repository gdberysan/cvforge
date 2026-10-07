import { cookies } from 'next/headers'
import { isTheme, THEME_COOKIE, type Theme } from './theme'

export async function getTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value
  return isTheme(value) ? value : 'system'
}
