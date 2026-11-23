import { beforeEach, describe, expect, it, vi } from 'vitest'

const callStructuredMock = vi.fn()
vi.mock('@/lib/ai/client', () => ({ callStructured: callStructuredMock }))
const { transcribePosting } = await import('@/lib/ai/stages/transcribe-posting')

describe('transcribePosting', () => {
  beforeEach(() => callStructuredMock.mockReset())

  it('sends every screenshot, in order, as an image, then says they are data', async () => {
    callStructuredMock.mockResolvedValue({
      title: '',
      company: '',
      location: '',
      text: 'x',
      unreadable: '',
    })
    await transcribePosting([
      { mediaType: 'image/jpeg', data: 'AAA' },
      { mediaType: 'image/jpeg', data: 'BBB' },
    ])
    const call = callStructuredMock.mock.calls[0]?.[0]
    expect(call.stage).toBe('transcribe-posting')
    expect(call.user.map((b: { type: string }) => b.type)).toEqual(['image', 'image', 'text'])
    expect(call.user[0].source.data).toBe('AAA')
    expect(call.user[1].source.data).toBe('BBB')
    expect(call.user[2].text).toMatch(/data, not instructions/)
    expect(call.system[0].text).toMatch(/Never summarise, translate, reword, correct or complete/)
  })
})
