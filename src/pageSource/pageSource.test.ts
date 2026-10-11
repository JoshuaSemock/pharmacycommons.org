import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { METFORMIN, METFORMIN_SOURCE } from './fixtures/metformin'
import { contextAt, panelFor, parsePageSource, REGISTRY, serializeFragment, serializePage, templateModel } from './index'
import type { Diagnostic, MainItem, ParseResult } from './types'

const errors = (r: ParseResult) => r.diagnostics.filter(d => d.severity === 'error')
const codes = (r: ParseResult) => errors(r).map(d => d.code)
const parse = (src: string) => parsePageSource(src, METFORMIN)
const fmt = (d: Diagnostic[]) => d.map(x => `${x.line} ${x.code}: ${x.message}`).join('\n')

/** Replaces one exact piece of the metformin page (fails loudly if it's not there). */
function edit(find: string, replace: string): string {
  if (!METFORMIN_SOURCE.includes(find)) throw new Error(`fixture lacks: ${find}`)
  return METFORMIN_SOURCE.replace(find, replace)
}

const infoboxEdit = (line: string) => edit('qtc_risk:               # source: none', line)

const mainOrder = (items: MainItem[]) => items.map(i => (i.kind === 'section' ? `## ${i.heading}` : i.kind === 'embed' ? `::${i.name}` : 'lead'))

// ─── The complete metformin page ───────────────────────────────────────────────

describe('metformin, fully filled out', () => {
  const r = parse(METFORMIN_SOURCE)

  it('parses with no errors or warnings', () => {
    expect(fmt(r.diagnostics)).toBe('')
    expect(r.ok).toBe(true)
  })

  it('keeps the drug template order, with contributor sections where they were written', () => {
    expect(mainOrder(r.model.main)).toEqual([
      'lead',
      '::hierarchy',
      '::fda-label',
      '## Mechanism of action',
      '## Dosing',
      '## Renal dosing',
      '## Safety',
      '## Interactions',
      '## Pregnancy and lactation',
      '## Patient education',
      '::guidelines',
      '::classifications',
      '::lists',
      '::references',
      '::metadata',
    ])
    const sections = r.model.main.filter(m => m.kind === 'section')
    expect(sections.filter(s => s.kind === 'section' && s.template).map(s => s.id)).toEqual(['renal-dosing', 'patient-education'])
    expect(sections.filter(s => s.kind === 'section' && !s.template).map(s => s.id)).toEqual([null, null, null, null, null])
  })

  it('stores only the community layer of Quick Facts: one cited override', () => {
    expect(r.model.infobox?.lines).toEqual([
      {
        key: 'do_not_crush',
        value: 'Extended-release tablets: swallow whole; never crush, cut or chew',
        isNull: false,
        citations: [{ kind: 'dailymed', id: '1ed9dde4-339c-486f-a346-dde33a5e493f', key: 'dailymed:1ed9dde4-339c-486f-a346-dde33a5e493f' }],
      },
    ])
  })

  it('keeps every source brand and adds none', () => {
    expect(r.model.brands?.lines.map(l => `${l.action}:${l.brand}`)).toEqual([
      'source:FORTAMET',
      'source:Glucophage',
      'source:GLUCOPHAGE XR',
      'source:Glumetza',
      'source:Riomet',
    ])
  })

  it('turns the renal dosing block into three non-overlapping, cited thresholds', () => {
    const renal = r.model.main.find(m => m.kind === 'section' && m.id === 'renal-dosing')
    const block = renal?.kind === 'section' ? renal.parts.find(p => p.kind === 'block') : undefined
    expect(block?.kind === 'block' ? block.block.lines.map(l => [l.measure, l.comparator, l.low, l.high, l.citations.length]) : null).toEqual([
      ['egfr', '<', 30, null, 2],
      ['egfr', 'range', 30, 45, 2],
      ['egfr', '>=', 45, null, 1],
    ])
  })

  it('extracts links, values and citations for the database', () => {
    const targets = r.extracted.links.map(l => l.target)
    expect(targets).toContain('type 2 diabetes')
    expect(targets).toContain('topiramate')
    expect(new Set(targets).size).toBe(14)
    expect(r.extracted.properties).toEqual([{ key: 'do_not_crush', target: '', location: 'heading:Dosing' }])
    const keys = new Set(r.extracted.citations.map(c => c.key))
    expect([...keys].sort()).toEqual([
      'dailymed:1ed9dde4-339c-486f-a346-dde33a5e493f',
      'dailymed:b6d7edc9-93d6-4480-906d-55c18d053600',
      'pmid:11832527',
      'pmid:20393934',
      'pmid:26900641',
      'pmid:32897388',
      'pmid:39651989',
      'pmid:9742977',
    ])
    expect(r.extracted.citations.filter(c => c.location === 'block:renal-dosing')).toHaveLength(5)
  })

  it('serializes back to exactly the same text (opening and publishing unchanged is a no-op)', () => {
    expect(serializePage(r.model, METFORMIN)).toBe(METFORMIN_SOURCE)
  })

  it('round-trips the model', () => {
    expect(parse(serializePage(r.model, METFORMIN)).model).toEqual(r.model)
  })
})

// ─── Template ──────────────────────────────────────────────────────────────────

describe('a page nobody has edited', () => {
  const src = serializePage(templateModel(METFORMIN), METFORMIN)

  it('opens as the drug template and parses cleanly', () => {
    const r = parse(src)
    expect(fmt(r.diagnostics)).toBe('')
    expect(r.model).toEqual(templateModel(METFORMIN))
    expect(src).toContain('acb_score:              # source: 1')
    expect(src).toContain('## Renal dosing\n\n:::renal-dosing\n:::')
  })
})

// ─── Raw HTML is rejected (§7a) ────────────────────────────────────────────────

describe('raw HTML', () => {
  const lead = 'Metformin is a biguanide that lowers'

  it.each([
    ['<b>bold</b> text', 'Use **bold**'],
    ['line<br>break', 'Leave a blank line'],
    ['<a href="https://x.org">x</a>', '[text](https://…)'],
    ['<!-- note to editors -->', 'edit summary'],
    ['<div>block</div>', 'HTML layout tags'],
    ['<marquee>x</marquee>', 'Use Markdown instead'],
  ])('rejects %s with the Markdown to use', (html, hint) => {
    const r = parse(edit(lead, `${html}\n\n${lead}`))
    expect(codes(r)).toEqual(['raw_html'])
    expect(errors(r)[0].message).toContain(hint)
    // The HTML is inserted where the lead began: line 27, after the title, brands, Quick Facts and rail embeds.
    expect(errors(r)[0].line).toBe(27)
  })

  it.each([
    ['eGFR <30 and a < b'],
    ['see <https://www.fda.gov>'],
    ['the `<b>` tag'],
    ['```\n<div>shown as code</div>\n```'],
    ['metformin 500mg<1000mg'],
  ])('accepts %s', text => {
    expect(codes(parse(edit(lead, `${text}\n\n${lead}`)))).toEqual([])
  })

  it('rejects HTML inside a structured value', () => {
    expect(codes(parse(infoboxEdit('qtc_risk: <b>low</b> [@pmid:1]')))).toEqual(['raw_html'])
  })
})

// ─── [NONE] (§4) ───────────────────────────────────────────────────────────────

describe('[NONE]', () => {
  it('records an explicit no-value override', () => {
    const r = parse(infoboxEdit('qtc_risk: [NONE] [@pmid:20393934]'))
    expect(codes(r)).toEqual([])
    expect(r.model.infobox?.lines.find(l => l.key === 'qtc_risk')).toEqual({
      key: 'qtc_risk',
      value: null,
      isNull: true,
      citations: [{ kind: 'pmid', id: '20393934', key: 'pmid:20393934' }],
    })
  })

  it('treats the word none as an ordinary value', () => {
    const r = parse(infoboxEdit('qtc_risk: none known [@pmid:20393934]'))
    expect(codes(r)).toEqual([])
    expect(r.model.infobox?.lines.find(l => l.key === 'qtc_risk')).toMatchObject({ value: 'none known', isNull: false })
  })

  it('must be the whole value', () => {
    expect(codes(parse(infoboxEdit('qtc_risk: [NONE] known [@pmid:1]')))).toEqual(['null_token_not_alone'])
  })

  it('must be in capitals', () => {
    const r = parse(infoboxEdit('qtc_risk: [none] [@pmid:1]'))
    expect(codes(r)).toEqual(['null_token_case'])
    expect(errors(r)[0].suggestion).toBe('[NONE]')
  })

  it('needs a citation', () => {
    expect(codes(parse(infoboxEdit('qtc_risk: [NONE]')))).toEqual(['citation_required'])
  })

  it('is plain text in prose', () => {
    expect(codes(parse(edit('## Patient education\n', '## Patient education\n\nNot an override: [NONE].\n')))).toEqual([])
  })
})

// ─── Discoverability (§4a) ─────────────────────────────────────────────────────

describe('wrong guesses get pointed somewhere useful', () => {
  it('sends a kidney fact to the renal dosing block', () => {
    const r = parse(infoboxEdit('kidney_warning: avoid below 30 [@pmid:1]'))
    expect(codes(r)).toEqual(['unknown_key'])
    expect(errors(r)[0].message).toContain(':::renal-dosing under ## Renal dosing')
    expect(errors(r)[0].message).toContain('egfr < 30')
  })

  it('suggests the nearest key for a typo', () => {
    const r = parse(infoboxEdit('acb_scor: 2 [@pmid:1]'))
    expect(errors(r)[0].suggestion).toBe('acb_score')
  })

  it('suggests the nearest block name', () => {
    const r = parse(edit(':::renal-dosing', ':::renal'))
    expect(errors(r).find(d => d.code === 'unknown_block')?.suggestion).toBe(':::renal-dosing')
  })

  it('requires a citation on a changed value', () => {
    expect(codes(parse(infoboxEdit('qtc_risk: low')))).toEqual(['citation_required'])
  })

  it('explains a malformed citation key', () => {
    const r = parse(infoboxEdit('qtc_risk: low [@pmid:abc]'))
    expect(codes(r)).toContain('bad_citation')
    expect(errors(r)[0].message).toContain('digits only')
  })

  it('warns, without blocking, when a value just repeats the source', () => {
    const r = parse(edit('acb_score:              # source: 1', 'acb_score: 1 [@pmid:1]'))
    expect(r.ok).toBe(true)
    expect(r.diagnostics.map(d => d.code)).toEqual(['same_as_source'])
  })

  it('panel lists Quick Facts keys with their source values, plus [NONE]', () => {
    const line = METFORMIN_SOURCE.split('\n').findIndex(l => l.startsWith('acb_score')) + 1
    const cursor = contextAt(METFORMIN_SOURCE, line)
    expect(cursor).toEqual({ region: 'block', name: 'infobox' })
    const panel = panelFor(cursor, METFORMIN)
    expect(panel.entries.find(e => e.label === 'acb_score')).toMatchObject({ insert: 'acb_score: ', source: '1' })
    expect(panel.entries.map(e => e.label)).toContain('[NONE]')
  })

  it('panel inside renal dosing lists the line forms', () => {
    const line = METFORMIN_SOURCE.split('\n').findIndex(l => l.startsWith('egfr 30-45')) + 1
    const panel = panelFor(contextAt(METFORMIN_SOURCE, line), METFORMIN)
    expect(panel.title).toBe('Renal dosing')
    expect(panel.entries.map(e => e.label)).toContain('egfr N-M: action')
  })
})

// ─── Sections: locked, required, movable ───────────────────────────────────────

describe('sections', () => {
  it("template sections can't be deleted", () => {
    const r = parse(edit('## Patient education\n', ''))
    expect(codes(r)).toContain('section_removed')
  })

  it("locked sections can't be deleted", () => {
    const r = parse(edit('::fda-label\n\n', ''))
    expect(errors(r).map(d => d.suggestion)).toEqual(['::fda-label'])
  })

  it('can be reordered', () => {
    const r = parse(edit('::lists\n\n::references', '::references\n\n::lists'))
    expect(r.ok).toBe(true)
    expect(mainOrder(r.model.main).slice(-3)).toEqual(['::references', '::lists', '::metadata'])
  })

  it('contributor sections can be removed', () => {
    const start = METFORMIN_SOURCE.indexOf('## Interactions')
    const end = METFORMIN_SOURCE.indexOf('## Pregnancy and lactation')
    const r = parse(METFORMIN_SOURCE.slice(0, start) + METFORMIN_SOURCE.slice(end))
    expect(r.ok).toBe(true)
  })

  it('keeps contributor section ids from the base revision', () => {
    const r = parsePageSource(METFORMIN_SOURCE, METFORMIN, { sectionIds: { dosing: 's-7f3a' } })
    expect(r.model.main.find(m => m.kind === 'section' && m.heading === 'Dosing')).toMatchObject({ id: 's-7f3a' })
  })

  it('locks the title', () => {
    expect(codes(parse(edit('# metformin', '# Metformin HCl')))).toEqual(['title_locked'])
  })

  it('refuses a second # heading', () => {
    expect(codes(parse(edit('## Safety', '# Safety')))).toContain('h1_not_allowed')
  })

  it('needs a heading before text that follows a locked section', () => {
    expect(codes(parse(edit('::guidelines\n', '::guidelines\n\nOrphan paragraph.\n')))).toEqual(['text_needs_heading'])
  })

  it('keeps a section block in its own section', () => {
    const block = METFORMIN_SOURCE.slice(METFORMIN_SOURCE.indexOf(':::renal-dosing'), METFORMIN_SOURCE.indexOf(':::\n\n**Iodinated') + 4)
    const moved = METFORMIN_SOURCE.replace(block, '').replace('## Safety\n', `## Safety\n\n${block}`)
    expect(codes(parse(moved))).toEqual(['block_misplaced'])
  })

  it('reports an unclosed block', () => {
    expect(codes(parse(edit('egfr >= 45: no labelled dose adjustment; keep monitoring eGFR at least annually [@dailymed:1ed9dde4-339c-486f-a346-dde33a5e493f]\n:::', 'egfr >= 45: x [@pmid:1]')))).toContain('unclosed_block')
  })
})

// ─── Renal dosing grammar ──────────────────────────────────────────────────────

describe('renal dosing lines', () => {
  const renal = (lines: string) =>
    edit(
      METFORMIN_SOURCE.slice(METFORMIN_SOURCE.indexOf(':::renal-dosing'), METFORMIN_SOURCE.indexOf(':::\n\n**Iodinated') + 3),
      `:::renal-dosing\n${lines}\n:::`,
    )

  it('accepts touching ranges', () => {
    expect(codes(parse(renal('egfr < 30: a [@pmid:1]\negfr 30-45: b [@pmid:1]\negfr >= 45: c [@pmid:1]\ncrcl < 30: d [@pmid:1]\ndialysis: e [@pmid:1]')))).toEqual([])
  })

  it('rejects overlapping ranges for the same measure', () => {
    expect(codes(parse(renal('egfr < 45: a [@pmid:1]\negfr 30-60: b [@pmid:1]')))).toEqual(['overlap'])
    expect(codes(parse(renal('egfr <= 30: a [@pmid:1]\negfr 30-45: b [@pmid:1]')))).toEqual(['overlap'])
  })

  it('accepts ≥, ≤, en dashes and "to"', () => {
    const r = parse(renal('egfr ≤ 29: a [@pmid:1]\negfr 30–44: b [@pmid:1]\ncrcl 10 to 50: c [@pmid:1]'))
    expect(codes(r)).toEqual([])
  })

  it('every line needs a citation and an action', () => {
    expect(codes(parse(renal('egfr < 30: contraindicated')))).toEqual(['citation_required'])
    expect(codes(parse(renal('egfr < 30: [@pmid:1]')))).toEqual(['action_required'])
  })

  it('rejects a reversed range and an unknown measure', () => {
    expect(codes(parse(renal('egfr 45-30: a [@pmid:1]')))).toEqual(['bad_range'])
    const r = parse(renal('gfr < 30: a [@pmid:1]'))
    expect(errors(r)[0].suggestion).toBe('egfr')
  })
})

// ─── Brands ────────────────────────────────────────────────────────────────────

describe('brands', () => {
  it("source brands can't be deleted, only struck through with a reason", () => {
    const r = parse(edit('Glumetza                # source\n', ''))
    expect(codes(r)).toEqual(['source_brand_removed'])
    const struck = parse(edit('Glumetza                # source', '~~Glumetza~~ [@url:https://www.accessdata.fda.gov/x] example reason'))
    expect(codes(struck)).toEqual([])
    expect(struck.model.brands?.lines[3]).toMatchObject({ action: 'hide', brand: 'Glumetza', reason: 'example reason' })
  })

  it('a new brand needs a citation', () => {
    expect(codes(parse(edit('Riomet                  # source', 'Riomet                  # source\nNewbrand')))).toEqual(['citation_required'])
    const ok = parse(edit('Riomet                  # source', 'Riomet                  # source\nNewbrand [@dailymed:1ed9dde4-339c-486f-a346-dde33a5e493f]'))
    expect(ok.model.brands?.lines.at(-1)).toMatchObject({ action: 'add', brand: 'Newbrand' })
  })
})

// ─── Section editing (fragments, §7b) ──────────────────────────────────────────

describe('section edit links', () => {
  const model = parse(METFORMIN_SOURCE).model

  it('opens and re-parses just one section', () => {
    const text = serializeFragment(model, METFORMIN, { kind: 'section', heading: 'Patient education' })
    expect(text.startsWith('## Patient education\n')).toBe(true)
    const r = parsePageSource(text, METFORMIN, { mode: 'fragment', target: { kind: 'section', heading: 'Patient education' } })
    expect(fmt(r.diagnostics)).toBe('')
  })

  it('refuses edits outside the section', () => {
    const r = parsePageSource('## Patient education\n\nText.\n\n## Something else\n', METFORMIN, {
      mode: 'fragment',
      target: { kind: 'section', heading: 'Patient education' },
    })
    expect(codes(r)).toContain('outside_fragment')
  })

  it('opens the lead and Quick Facts on their own', () => {
    const lead = serializeFragment(model, METFORMIN, { kind: 'lead' })
    expect(parsePageSource(lead, METFORMIN, { mode: 'fragment', target: { kind: 'lead' } }).ok).toBe(true)
    const facts = serializeFragment(model, METFORMIN, { kind: 'rail', name: 'infobox' })
    const r = parsePageSource(facts, METFORMIN, { mode: 'fragment', target: { kind: 'rail', name: 'infobox' } })
    expect(r.ok).toBe(true)
    expect(r.model.infobox?.lines).toHaveLength(1)
  })
})

// ─── The registry and its database copy stay identical ─────────────────────────

describe('registry', () => {
  it('matches the seed in db/phase16a_block_schemas.sql', () => {
    const sql = readFileSync(new URL('../../db/phase16a_block_schemas.sql', import.meta.url), 'utf8')
    const m = /\$registry\$(\{[\s\S]*?\})\$registry\$/.exec(sql)
    expect(m).not.toBeNull()
    expect(JSON.parse(m ? m[1] : '{}')).toEqual(REGISTRY)
  })
})
