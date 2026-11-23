// Drives Chrome on the connected Android phone (adb forward tcp:9333 …).
import { chromium } from 'playwright'
export async function phone() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('localhost:4100')) ?? (await ctx.newPage())
  return { browser, ctx, page }
}
