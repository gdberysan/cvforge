// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { cleanup, render } from '@testing-library/react'
import type { JSX } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import * as icons from '@/components/ui/icons'

afterEach(cleanup)

const NEW = [
  'IconEdit',
  'IconCheck',
  'IconAddNumber',
  'IconPlus',
  'IconImport',
  'IconDownload',
  'IconCopy',
  'IconRegenerate',
  'IconStack',
  'IconFind',
  'IconVerified',
] as const

describe('icons', () => {
  it.each(NEW)('%s is decorative and takes the colour of its word', (name) => {
    const Icon = (icons as unknown as Record<string, () => JSX.Element>)[name]
    expect(Icon).toBeTypeOf('function')
    const { container } = render(<Icon />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.getAttribute('stroke')).toBe('currentColor')
  })
  it('the chevron turns to point back', () => {
    const { container } = render(<icons.IconChevron flip />)
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('icon-flip')
  })
  it('the gallery shows every icon', () => {
    const gallery = readFileSync('components/ui/Gallery.tsx', 'utf8')
    for (const name of NEW) expect(gallery).toContain(`<${name} />`)
  })
})
