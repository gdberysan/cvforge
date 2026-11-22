import { afterEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.fn(() => ({ unref: () => {} }))
vi.mock('node:child_process', () => ({ spawn: spawnMock }))

const { POST } = await import('@/app/api/shutdown/route')

const ownPage = () =>
  new Request('http://localhost:3000/api/shutdown', {
    method: 'POST',
    headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
  })

describe('POST /api/shutdown', () => {
  afterEach(() => {
    vi.useRealTimers()
    delete process.env.CVFORGE_LAUNCHD
    spawnMock.mockClear()
  })

  it('under launchd, boots the job out instead of exiting into a restart', async () => {
    vi.useFakeTimers()
    process.env.CVFORGE_LAUNCHD = '1'
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    expect((await POST(ownPage())).status).toBe(200)
    vi.runAllTimers()
    await vi.dynamicImportSettled()
    expect(spawnMock).toHaveBeenCalledWith(
      'launchctl',
      ['bootout', `gui/${process.getuid?.()}/com.cvforge.server`],
      expect.objectContaining({ detached: true }),
    )
    expect(exit).not.toHaveBeenCalled()
    exit.mockRestore()
  })

  it('without launchd, exits as before', async () => {
    vi.useFakeTimers()
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    await POST(ownPage())
    vi.runAllTimers()
    expect(exit).toHaveBeenCalledWith(0)
    expect(spawnMock).not.toHaveBeenCalled()
    exit.mockRestore()
  })
})
