// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import NetworkLink from './NetworkLink'

afterEach(cleanup)
const show = (pcid: string | number) =>
  render(
    <MemoryRouter>
      <NetworkLink pcid={pcid} />
    </MemoryRouter>,
  )

describe('NetworkLink', () => {
  it('opens the Network on this record, from a PCID code or digits', () => {
    show('PCID-1001923')
    expect(screen.getByRole('link', { name: /see how it connects/i }).getAttribute('href')).toBe('/network?c=1001923')
    cleanup()
    show(10000034)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/network?c=10000034')
  })

  it('renders nothing for something that is not a PCID', () => {
    show('metformin')
    expect(screen.queryByRole('link')).toBeNull()
    cleanup()
    show('PCID-12')
    expect(screen.queryByRole('link')).toBeNull()
  })
})
