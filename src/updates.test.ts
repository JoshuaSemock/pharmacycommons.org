import { describe, expect, it } from 'vitest'
import { UPDATES, ctaFor, whatsNew } from './updates'

describe("what's new", () => {
  it('merges features and blog posts, newest first', () => {
    const all = whatsNew()
    const dates = all.map(u => u.date)
    expect(dates).toEqual([...dates].sort().reverse())
    expect(all.some(u => u.kind === 'Blog post')).toBe(true)
    expect(all[0].id).toBe('medication-reconciliation')
  })

  it('limits the feed and gives every entry a link and call to action', () => {
    expect(whatsNew(2)).toHaveLength(2)
    for (const u of whatsNew()) {
      expect(u.to).toMatch(/^\//)
      expect(ctaFor(u)).not.toBe('')
    }
  })

  it('uses real ISO dates and unique ids', () => {
    for (const u of UPDATES) expect(u.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(new Set(UPDATES.map(u => u.id)).size).toBe(UPDATES.length)
  })
})
