import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hashEvidenceProjection, hashPosting } from '@/lib/hash'

const node = (s: string) => createHash('sha256').update(s).digest('hex')

describe('lib/hash matches node:crypto, so stored hashes stay valid', () => {
  it('for postings (trimmed) and projections, accents and emoji included', () => {
    for (const text of [
      '',
      'Growth Lead',
      '  Coordinador(a) de Marketing — México ✓ 🚀\n',
      'a'.repeat(100_000),
    ]) {
      expect(hashPosting(text)).toBe(node(text.trim()))
    }
    const projection = { roles: [{ title: 'Gerente de Marca', metrics: ['$1.2M MXN', '45%'] }] }
    expect(hashEvidenceProjection(projection)).toBe(node(JSON.stringify(projection)))
  })
})
