import { describe, expect, it } from 'vitest'
import { inAppBrowser } from '@/web/lib/in-app-browser'

describe('inAppBrowser', () => {
  it('names the app whose own browser the page is in, and nothing in a real browser', () => {
    expect(
      inAppBrowser(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30',
      ),
    ).toBe('LinkedIn')
    expect(
      inAppBrowser('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Instagram 350.0.0 Android'),
    ).toBe('Instagram')
    expect(inAppBrowser('Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/480.0]')).toBe('Facebook')
    expect(
      inAppBrowser(
        'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
      ),
    ).toBeNull()
  })
})
