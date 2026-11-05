import { describe, expect, it } from 'vitest'
import type { FrontmatterResult } from './frontmatter'
import { ABOUT_FALLBACK_TITLE, parseAbout } from './aboutDoc'

const FILES = import.meta.glob<FrontmatterResult>('../docs/about.md', { query: '?fm', import: 'default', eager: true })
const about = Object.values(FILES)[0]

describe('docs/about.md', () => {
  it('is found and its front matter reads without error', () => {
    expect(about).toBeDefined()
    expect(about.error).toBeNull()
  })

  it('keeps the page title the static shell and sitemap expect', () => {
    expect(parseAbout(about).title).toBe('About Pharmacy Commons')
  })

  it('has a lede and the expected sections', () => {
    const doc = parseAbout(about)
    expect(doc.lede?.length).toBeGreaterThan(100)
    const headings = [...doc.body.matchAll(/^## (.+)$/gm)].map(m => m[1])
    expect(headings).toEqual([
      'Our Mission',
      'Our Vision Statement',
      'Our Values',
      'Our Status',
      'Our Land, Knowledge, and Environment Acknowledgment',
      'Our Licensing and Intentions',
      'Our Founder',
      'Contact',
    ])
  })

  it('does not name the old operator', () => {
    expect(about.body).not.toMatch(/LLC|Pharmacy of the Commons/)
  })

  it('links the contact address', () => {
    expect(about.body).toContain('(mailto:contact@pharmacycommons.org)')
  })
})

describe('parseAbout', () => {
  it('falls back to the usual title when the front matter has none', () => {
    expect(parseAbout({ meta: {}, body: 'Text.', error: null })).toEqual({
      title: ABOUT_FALLBACK_TITLE,
      lede: undefined,
      body: 'Text.',
    })
  })
})
