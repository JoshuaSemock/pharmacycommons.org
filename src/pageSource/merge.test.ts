import { describe, expect, it } from 'vitest'
import { INFOBOX_KEYS, METFORMIN, METFORMIN_SOURCE } from './fixtures/metformin'
import { assignSectionIds, fromLegacy, mergeModels, parsePageSource, sectionIdsOf, serializeFragment, serializePage, spliceFragment } from './index'
import type { PageModel } from './types'

let n = 0
const newId = () => `s-${++n}`
const parse = (src: string, base?: PageModel) =>
  parsePageSource(src, METFORMIN, base ? { sectionIds: sectionIdsOf(base) } : {})

/** The published metformin page, with ids on every section. */
const BASE = assignSectionIds(parse(METFORMIN_SOURCE).model, newId)
const BASE_SRC = serializePage(BASE, METFORMIN)

/** An edit of the base page: parse the changed text, keeping section ids. */
function editOf(find: string, replace: string): PageModel {
  if (!BASE_SRC.includes(find)) throw new Error(`missing: ${find}`)
  const r = parse(BASE_SRC.replace(find, replace), BASE)
  expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([])
  return assignSectionIds(r.model, newId)
}

const section = (m: PageModel, heading: string) => {
  const s = m.main.find(x => x.kind === 'section' && x.heading === heading)
  return s && s.kind === 'section' ? s : null
}

describe('section-level merge', () => {
  it('keeps both edits when two people change different sections', () => {
    const mine = editOf('Swallow extended-release tablets whole.', 'Swallow extended-release tablets whole, with water.')
    const theirs = editOf('## Interactions\n', '## Interactions\n\nAlso see [[alcohol]].\n')
    const r = mergeModels(BASE, theirs, mine)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.changed).toEqual([section(BASE, 'Patient education')?.id])
    const text = serializePage(r.model, METFORMIN)
    expect(text).toContain('with water.')
    expect(text).toContain('Also see [[alcohol]].')
  })

  it('reports a conflict when both change the same section differently', () => {
    const mine = editOf('Take it with meals', 'Take it with food')
    const theirs = editOf('Take it with meals', 'Take each dose with meals')
    const r = mergeModels(BASE, theirs, mine)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.conflicts.map(c => c.label)).toEqual(['## Patient education'])
    expect(r.conflicts[0].incoming).toContain('with food')
    expect(r.conflicts[0].current).toContain('Take each dose')
  })

  it('after a conflict, offers the merged page with the current text in the clashing section', () => {
    const mine = editOf('Take it with meals', 'Take it with food').main
    const mineWithMore = editOf('Take it with meals', 'Take it with food')
    const withLead = { ...mineWithMore, main: mine.map(m => (m.kind === 'lead' ? { ...m, markdown: 'New lead.' } : m)) }
    const theirs = editOf('Take it with meals', 'Take each dose with meals')
    const r = mergeModels(BASE, theirs, withLead)
    expect(r.ok).toBe(false)
    const text = serializePage(r.model, METFORMIN)
    expect(text).toContain('Take each dose with meals')
    expect(text).toContain('New lead.')
  })

  it('treats identical changes as no conflict', () => {
    const a = editOf('Take it with meals', 'Take it with food')
    const b = editOf('Take it with meals', 'Take it with food')
    expect(mergeModels(BASE, b, a).ok).toBe(true)
  })

  it('merges Quick Facts per key', () => {
    const mine = editOf('acb_score:              # source: 1', 'acb_score: 0 [@pmid:1]')
    const theirs = editOf('qtc_risk:               # source: none', 'qtc_risk: [NONE] [@pmid:2]')
    const r = mergeModels(BASE, theirs, mine, INFOBOX_KEYS.map(k => k.key))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.infobox?.lines.map(l => l.key)).toEqual(['do_not_crush', 'acb_score', 'qtc_risk'])
    expect(r.changed).toEqual(['infobox:acb_score'])
  })

  it('conflicts on the same Quick Facts key', () => {
    const mine = editOf('acb_score:              # source: 1', 'acb_score: 0 [@pmid:1]')
    const theirs = editOf('acb_score:              # source: 1', 'acb_score: 2 [@pmid:2]')
    const r = mergeModels(BASE, theirs, mine)
    expect(r.ok ? [] : r.conflicts.map(c => c.unit)).toEqual(['infobox:acb_score'])
  })

  it("keeps someone else's new section when I only edited another one", () => {
    const theirs = editOf('## Interactions\n', '## Monitoring\n\nCheck B12 every 2 to 3 years.\n\n## Interactions\n')
    const mine = editOf('Take it with meals', 'Take it with food')
    const r = mergeModels(BASE, theirs, mine)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const order = r.model.main.map(m => (m.kind === 'section' ? m.heading : m.kind))
    expect(order.indexOf('Monitoring')).toBe(order.indexOf('Interactions') - 1)
  })

  it('takes my reorder when nobody else reordered', () => {
    const mine = editOf('::lists\n\n::references', '::references\n\n::lists')
    const theirs = editOf('Take it with meals', 'Take it with food')
    const r = mergeModels(BASE, theirs, mine)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const tail = r.model.main.slice(-3).map(m => (m.kind === 'embed' ? m.name : '?'))
    expect(tail).toEqual(['references', 'lists', 'metadata'])
    expect(serializePage(r.model, METFORMIN)).toContain('Take it with food')
  })

  it('conflicts when both reorder differently', () => {
    const mine = editOf('::lists\n\n::references', '::references\n\n::lists')
    const theirs = editOf('::guidelines\n\n::classifications', '::classifications\n\n::guidelines')
    const r = mergeModels(BASE, theirs, mine)
    expect(r.ok ? [] : r.conflicts.map(c => c.unit)).toEqual(['order'])
  })

  it('a section edit merges onto a page that changed elsewhere', () => {
    const frag = serializeFragment(BASE, METFORMIN, { kind: 'section', heading: 'Patient education' }).replace('Take it with meals', 'Take it with food')
    const target = { kind: 'section' as const, heading: 'Patient education' }
    const parsed = parsePageSource(frag, METFORMIN, { mode: 'fragment', target })
    expect(parsed.ok).toBe(true)
    const mine = spliceFragment(BASE, parsed.model, target)
    const theirs = editOf('## Interactions\n', '## Interactions\n\nAlso see [[alcohol]].\n')
    const r = mergeModels(BASE, theirs, mine)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.changed).toEqual([section(BASE, 'Patient education')?.id])
    expect(section(r.model, 'Patient education')?.id).toBe(section(BASE, 'Patient education')?.id)
  })
})

describe('pages from the Overview editor (format 1)', () => {
  it('turns the description into the lead on the template', () => {
    const m = fromLegacy('Metformin is a biguanide.', '', METFORMIN)
    expect(m.main[0]).toEqual({ kind: 'lead', id: 'lead', markdown: 'Metformin is a biguanide.' })
    expect(parsePageSource(serializePage(m, METFORMIN), METFORMIN).ok).toBe(true)
  })

  it('turns ## headings in the old body into sections before the locked ones', () => {
    const m = fromLegacy('Lead.', '## Dosing pearls\n\nTake with food.', METFORMIN)
    expect(m.main.slice(0, 3).map(x => (x.kind === 'section' ? x.heading : x.kind === 'embed' ? x.name : 'lead'))).toEqual(['lead', 'Dosing pearls', 'hierarchy'])
  })

  it('keeps unparseable old text whole, as the lead', () => {
    const m = fromLegacy('Lead.', '# Big heading\n\nText', METFORMIN)
    expect(m.main[0]).toMatchObject({ kind: 'lead', markdown: 'Lead.\n\n# Big heading\n\nText' })
  })

  it("converts Joshua's live metformin text (PCID-1001923, 2026-10-10)", () => {
    const live =
      'Metformin is a glucose-independent therapy option in Type 2 Diabetes for blood glucose management, with a lower risk of hypoglycemia than insulin therapy. Guidelines have largely pushed metformin into an adjunct therapy option space, preferring stronger [[A1c%]] controllers like GLP-1RAs and SGLT2is.'
    const m = fromLegacy(live, '', METFORMIN)
    const r = parsePageSource(serializePage(m, METFORMIN), METFORMIN)
    expect(r.ok).toBe(true)
    expect(r.extracted.links.map(l => l.target)).toEqual(['A1c%'])
  })
})
