// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Meta } from '@/components/ui/Meta'

afterEach(cleanup)

describe('Meta', () => {
  it('renders each present item as its own segment, skipping empty ones', () => {
    const { container } = render(
      <Meta>
        {'Mexico'}
        {''}
        {null}
        {false}
        <a href="/x">open</a>
      </Meta>,
    )
    const items = [...container.querySelectorAll('.meta-item')]
    expect(items.map((i) => i.textContent)).toEqual(['Mexico', 'open'])
  })
})
