// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from '@/lib/ui/copy'
import { printHtml, saveResponse } from '@/lib/ui/download'
import { IN_APP_BLOCKED, outsideUrl, platformOf } from '@/lib/ui/in-app'

const ANDROID_LINKEDIN =
  'Mozilla/5.0 (Linux; Android 15; SM-S931B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36 [LinkedInApp]/4.1'
const IOS_LINKEDIN =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30'
const CHROME =
  'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the way out of an in-app browser', () => {
  it('asks Android for its default browser, falling back to the page itself', () => {
    const href = 'https://rumbo.korven.dev/app/?x=1'
    expect(platformOf(ANDROID_LINKEDIN)).toBe('android')
    expect(outsideUrl(href, ANDROID_LINKEDIN)).toBe(
      `intent://rumbo.korven.dev/app/?x=1#Intent;scheme=https;action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(href)};end`,
    )
  })

  it("uses Safari's own scheme on iPhone, and nothing elsewhere", () => {
    expect(outsideUrl('https://rumbo.korven.dev/app/', IOS_LINKEDIN)).toBe(
      'x-safari-https://rumbo.korven.dev/app/',
    )
    expect(outsideUrl('https://rumbo.korven.dev/app/', 'Mozilla/5.0 (Macintosh)')).toBeNull()
    expect(outsideUrl('http://127.0.0.1:3000/app/', ANDROID_LINKEDIN)).toBeNull()
  })
})

describe('downloads inside an in-app browser', () => {
  it('say why instead of a download that silently does nothing', async () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: ANDROID_LINKEDIN })
    const blocked = vi.fn()
    window.addEventListener(IN_APP_BLOCKED, blocked)
    const createUrl = vi.fn(() => 'blob:x')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: createUrl }))
    await saveResponse(new Response('pdf'), 'CV.pdf')
    printHtml('<p>CV</p>')
    window.removeEventListener(IN_APP_BLOCKED, blocked)
    expect(blocked).toHaveBeenCalledTimes(2)
    expect(createUrl).not.toHaveBeenCalled()
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('still download in a real browser', async () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: CHROME })
    const blocked = vi.fn()
    window.addEventListener(IN_APP_BLOCKED, blocked)
    const createUrl = vi.fn(() => 'blob:x')
    URL.createObjectURL = createUrl
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await saveResponse(new Response('pdf'), 'CV.pdf')
    window.removeEventListener(IN_APP_BLOCKED, blocked)
    expect(blocked).not.toHaveBeenCalled()
    expect(click).toHaveBeenCalledOnce()
  })
})

describe('copyText', () => {
  it('falls back to the selection copy when the Clipboard API is refused', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: () => Promise.reject(new Error('NotAllowedError')) },
    })
    const exec = vi.fn(() => true)
    document.execCommand = exec
    expect(await copyText('hola')).toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('says false when neither way can copy', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: () => Promise.reject(new Error('NotAllowedError')) },
    })
    document.execCommand = vi.fn(() => false)
    expect(await copyText('hola')).toBe(false)
  })
})
