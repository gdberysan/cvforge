import { MessageChannel } from 'node:worker_threads'
import { afterEach, describe, expect, it } from 'vitest'
import { connect, expose, type Port, RpcError } from '@/web/lib/rpc'

class CodedError extends Error {
  readonly code = 'no-profile'
}

const api = {
  add: (a: number, b: number) => a + b,
  later: async (s: string) => `${s}!`,
  fails: () => {
    throw new CodedError('Build your evidence base first.')
  },
  stages: async (n: number, onStage: (s: string) => void) => {
    for (let i = 1; i <= n; i++) onStage(`stage ${i}`)
    return 'done'
  },
}

let channel: MessageChannel
afterEach(() => {
  channel.port1.close()
  channel.port2.close()
})
const pair = () => {
  channel = new MessageChannel()
  expose(api, channel.port1 as unknown as Port)
  return connect<typeof api>(channel.port2 as unknown as Port)
}

describe('rpc', () => {
  it('returns results, sync or async, by method name', async () => {
    const c = pair()
    expect(await c.add(2, 3)).toBe(5)
    expect(await c.later('hola')).toBe('hola!')
  })

  it('carries an error’s code across, for errorText', async () => {
    const c = pair()
    const err = await c.fails().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RpcError)
    expect(err).toMatchObject({ message: 'Build your evidence base first.', code: 'no-profile' })
  })

  it('streams progress to the callback, then resolves', async () => {
    const c = pair()
    const seen: string[] = []
    expect(await c.stages(3, (s) => seen.push(s))).toBe('done')
    expect(seen).toEqual(['stage 1', 'stage 2', 'stage 3'])
  })

  it('can be handed through a Promise (it is not a thenable)', async () => {
    const c = pair()
    const viaPromise = await Promise.resolve(c)
    expect(await viaPromise.add(1, 1)).toBe(2)
  })

  it('an unknown method is an error, not a hang', async () => {
    const c = pair() as unknown as { nope: () => Promise<unknown> }
    await expect(c.nope()).rejects.toMatchObject({ code: 'unknown-method' })
  })
})
