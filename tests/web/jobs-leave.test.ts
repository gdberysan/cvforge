// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { guardLeave, jobEnded, jobStarted } from '@/web/lib/jobs'

describe('leaving the page while a paid job runs', () => {
  const leave = () => {
    const e = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    guardLeave(e)
    return e.defaultPrevented
  }
  it('asks only while a job is running', () => {
    expect(leave()).toBe(false)
    jobStarted()
    expect(leave()).toBe(true)
    jobEnded()
    expect(leave()).toBe(false)
  })
})
