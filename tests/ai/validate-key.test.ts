import { beforeEach, describe, expect, it, vi } from 'vitest'

const listMock = vi.fn()
const ctorArgs: unknown[] = []
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    models = { list: listMock }
    constructor(opts?: unknown) {
      ctorArgs.push(opts)
    }
  },
}))

const { validateApiKey } = await import('@/lib/ai/validate-key')

describe('validateApiKey', () => {
  beforeEach(() => {
    listMock.mockReset()
    ctorArgs.length = 0
  })

  it('builds a throw-away client from the given key and asks for one model', async () => {
    listMock.mockResolvedValue({ data: [] })
    expect(await validateApiKey('sk-ant-abc')).toEqual({ ok: true })
    expect(ctorArgs[0]).toMatchObject({ apiKey: 'sk-ant-abc', maxRetries: 0 })
    expect(listMock).toHaveBeenCalledWith({ limit: 1 })
  })

  it('reports a rejected key as auth', async () => {
    listMock.mockRejectedValue(Object.assign(new Error('invalid x-api-key'), { status: 401 }))
    expect(await validateApiKey('sk-ant-bad')).toEqual({ ok: false, kind: 'auth' })
  })

  it('reports a timeout as timeout, not as a bad key', async () => {
    listMock.mockRejectedValue(
      Object.assign(new Error('Request timed out.'), { status: undefined }),
    )
    expect(await validateApiKey('sk-ant-abc')).toEqual({ ok: false, kind: 'timeout' })
  })
})
