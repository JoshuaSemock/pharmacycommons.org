import { describe, expect, it } from 'vitest'
import type { FrontmatterResult } from './frontmatter'
import { UPDATES, buildUpdate, byNewest, ctaFor, updateProblem, whatsNew } from './updates'

const FILES = import.meta.glob<FrontmatterResult>('./content/updates/*.md', { query: '?fm', import: 'default', eager: true })

const fm = (meta: Record<string, unknown>, body = 'Summary.'): FrontmatterResult => ({ meta, body, error: null })
const valid = { date: '2026-11-03', kind: 'Feature', title: 'A title', to: '/somewhere' }

describe("what's new", () => {
  it('merges features and blog posts, newest first', () => {
    const all = whatsNew()
    const dates = all.map(u => u.date)
    expect(dates).toEqual([...dates].sort().reverse())
    expect(all.some(u => u.kind === 'Blog post')).toBe(true)
    expect(all[0].date).toBe(dates[0])
    expect(all.map(u => u.id)).toEqual(expect.arrayContaining(['developers', 'medication-reconciliation']))
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

describe('update files', () => {
  it('finds the committed entries and loads every one of them', () => {
    expect(Object.keys(FILES).length).toBeGreaterThan(30)
    expect(UPDATES).toHaveLength(Object.keys(FILES).length)
  })

  it.each(Object.entries(FILES))('%s: is usable', (_path, file) => {
    expect(updateProblem(file)).toBeNull()
  })

  it.each(Object.entries(FILES))('%s: is named yyyy-mm-dd-id after its own date and id', (path, file) => {
    const u = buildUpdate(path, file)
    expect(path.split('/').pop()).toBe(`${u?.date}-${u?.id}.md`)
  })

  it('takes the summary from the body and the id from the file name when not given', () => {
    const u = buildUpdate('./content/updates/2026-11-03-my-thing.md', fm(valid, 'Does a thing.'))
    expect(u).toMatchObject({ id: 'my-thing', summary: 'Does a thing.', kind: 'Feature', to: '/somewhere' })
  })

  it('rejects entries with a bad date, kind, title or link', () => {
    expect(updateProblem(fm({ ...valid, date: '2026-02-31' }))).toMatch(/date/)
    expect(updateProblem(fm({ ...valid, kind: 'Blog post' }))).toMatch(/kind/)
    expect(updateProblem(fm({ ...valid, title: '' }))).toMatch(/title/)
    expect(updateProblem(fm({ ...valid, to: 'tools' }))).toMatch(/to /)
    expect(updateProblem({ meta: {}, body: '', error: 'bad yaml' })).toMatch(/bad yaml/)
    expect(buildUpdate('./x.md', fm({ ...valid, kind: 'Nope' }))).toBeNull()
  })

  it('orders newest first, then by order, then id', () => {
    const e = (id: string, date: string, order?: number) => ({ id, date, order, kind: 'Feature' as const, title: id, summary: '', to: '/' })
    const sorted = [e('b', '2026-01-01', 1), e('a', '2026-01-01', 1), e('z', '2026-01-01', 0), e('new', '2026-02-01')].sort(byNewest)
    expect(sorted.map(u => u.id)).toEqual(['new', 'z', 'a', 'b'])
  })
})

