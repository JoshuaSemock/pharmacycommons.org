import { describe, expect, it } from 'vitest'
import { REGISTRY } from './index'
import { pageTypeFor, parsePageSource } from './parse'
import { fillTemplate, serializePage, templateModel } from './serialize'
import { leadSummary } from './citations'
import { METFORMIN } from './fixtures/metformin'
import type { PageContext, PageModel, PageType } from './types'

/** docs/page-editor.md §9 (decided 2026-10-11): templates per page type, the lead summary. */

const ctxFor = (pageType: PageType, entityType: string, title: string): PageContext => ({
  ...METFORMIN,
  pageType,
  entityType,
  title,
  infoboxKeys: [],
  sourceBrands: [],
  sourceValues: {},
  registry: REGISTRY,
})

const HERBAL = ctxFor('herbal', 'functional', 'Ashwagandha')
const CLASS = ctxFor('class', 'class', 'Biguanides')
const CONCEPT = ctxFor('concept', 'clinical', 'Lactic acidosis')

describe('pageTypeFor', () => {
  it('maps every entity type to its template', () => {
    expect(['moiety', 'precise_form', 'combination', 'formulation'].map(pageTypeFor)).toEqual(['drug', 'drug', 'drug', 'drug'])
    expect(['clinical', 'measurement', 'target'].map(pageTypeFor)).toEqual(['concept', 'concept', 'concept'])
    expect(pageTypeFor('functional')).toBe('herbal')
    expect(pageTypeFor('class')).toBe('class')
    expect(pageTypeFor('list')).toBeNull()
    expect(pageTypeFor(null)).toBeNull()
  })
})

describe('registry templates', () => {
  it('has a template for every page type, and every embed it uses is allowed on that page type', () => {
    const embeds = new Map(REGISTRY.embeds.map(e => [e.name, e]))
    for (const type of ['drug', 'concept', 'herbal', 'class'] as const) {
      const t = REGISTRY.templates.find(x => x.page_type === type)
      expect(t, type).toBeDefined()
      const used = [...(t?.rail ?? []), ...(t?.main ?? []).flatMap(i => (i.kind === 'embed' ? [i.name] : []))]
      for (const name of used) {
        if (REGISTRY.blocks.some(b => b.name === name)) continue
        expect(embeds.get(name)?.page_types, `${type} uses ::${name}`).toContain(type)
      }
    }
  })

  it.each([
    ['herbal', HERBAL, ['Uses and evidence', 'Safety', 'Patient education']],
    ['class', CLASS, ['Class effects']],
    ['concept', CONCEPT, ['Patient education']],
  ] as const)('%s: an untouched page serializes and parses back to itself', (_t, ctx, headings) => {
    const model = templateModel(ctx)
    const source = serializePage(model, ctx)
    for (const h of headings) expect(source).toContain(`## ${h}`)
    const parsed = parsePageSource(source, ctx)
    expect(parsed.diagnostics.filter(d => d.severity === 'error')).toEqual([])
    expect(parsed.model.main).toEqual(model.main)
  })

  it('class pages keep sub-classes and the record in the rail, members in the main column', () => {
    const source = serializePage(templateModel(CLASS), CLASS)
    expect(source).toContain('::subclasses\n::machine-readable')
    expect(source.indexOf('## Class effects')).toBeLessThan(source.indexOf('::class-members'))
    expect(parsePageSource(source.replace('::class-members\n', ''), CLASS).diagnostics.map(d => d.code)).toContain('section_removed')
  })
})

describe('fillTemplate', () => {
  const written: PageModel = {
    title: 'Ashwagandha',
    brands: null,
    infobox: null,
    main: [
      { kind: 'lead', id: 'lead', markdown: 'An adaptogen.' },
      { kind: 'section', id: 's-1', heading: 'History', template: false, parts: [{ kind: 'prose', markdown: 'Ayurvedic.' }] },
      { kind: 'embed', id: 'references', name: 'references' },
    ],
  }

  it('adds missing template sections and embeds after their template neighbours, keeping what was written', () => {
    const filled = fillTemplate(written, HERBAL)
    const ids = filled.main.map(m => (m.kind === 'embed' ? `::${m.name}` : m.id))
    expect(ids).toEqual(['lead', 'uses-and-evidence', 'safety', 'interactions', 'patient-education', '::knowledge-base', 's-1', '::references', '::metadata'])
    expect(filled.main[0]).toEqual(written.main[0])
    const source = serializePage(filled, HERBAL)
    expect(parsePageSource(source, HERBAL, { sectionIds: { history: 's-1' } }).ok).toBe(true)
  })

  it('returns the same model when nothing is missing', () => {
    const full = templateModel(HERBAL)
    expect(fillTemplate(full, HERBAL)).toBe(full)
  })
})

describe('leadSummary', () => {
  it('takes the first paragraph as plain text', () => {
    const md =
      'Metformin lowers glucose by reducing **hepatic** output; see [[lactic acidosis|lactic acidosis]] and [[PCOS]] [@pmid:1][@doi:10.1/x]. Value {{acb_score}}.\n\nSecond paragraph.'
    expect(leadSummary(md)).toBe('Metformin lowers glucose by reducing hepatic output; see lactic acidosis and PCOS. Value.')
  })

  it("doesn't split on abbreviations or doses, and cuts long text at a word", () => {
    const md = 'Used e.g. at 1,000 mg. twice daily ' + 'with meals '.repeat(40)
    const s = leadSummary(md, 80) ?? ''
    expect(s.startsWith('Used e.g. at 1,000 mg. twice daily')).toBe(true)
    expect(s.length).toBeLessThanOrEqual(80)
    expect(s.endsWith('…')).toBe(true)
    expect(s).not.toMatch(/\s…$/)
  })

  it('returns null when there is no lead text', () => {
    expect(leadSummary('')).toBeNull()
    expect(leadSummary(null)).toBeNull()
    expect(leadSummary('[@pmid:1]')).toBeNull()
  })
})
