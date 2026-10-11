import { describe, expect, it } from 'vitest'
import { METFORMIN, METFORMIN_SOURCE } from '../pageSource/fixtures/metformin'
import { parsePageSource, templateModel } from '../pageSource'
import { applyCompletion, completionAt } from './complete'
import { rangeLabel, referenceParts } from './PageParts'
import { toProblem } from './api'
import { draftKey } from './draft'
import { numbersFor } from './usePageModel'
import { citeKeys } from './remarkCite'

const at = (text: string) => completionAt(text, text.length, METFORMIN)

describe('autocomplete', () => {
  it('[[ asks for pages', () => {
    expect(at('See [[metf')).toMatchObject({ kind: 'page', query: 'metf', start: 4 })
  })
  it('{{ offers Quick Facts keys', () => {
    const c = at('Score {{acb')
    expect(c?.options.map(o => o.insert)).toEqual(['{{acb_score}}'])
  })
  it('[@ offers citation kinds and sources already on the page', () => {
    const c = completionAt(`${METFORMIN_SOURCE}\nNew claim.[@pm`, METFORMIN_SOURCE.length + 15, METFORMIN)
    const labels = c?.options.map(o => o.label) ?? []
    expect(labels).toContain('pmid:')
    expect(labels).toContain('pmid:26900641')
  })
  it('::: at line start offers this page type’s blocks', () => {
    const c = at('## Renal dosing\n\n:::re')
    expect(c?.options).toEqual([{ label: ':::renal-dosing', insert: ':::renal-dosing\n\n:::', hint: 'Renal dosing' }])
    const text = 'x\n:::re'
    const r = applyCompletion(text, text.length, at(text) as NonNullable<ReturnType<typeof at>>, ':::renal-dosing\n\n:::')
    expect(r.text).toBe('x\n:::renal-dosing\n\n:::')
    expect(r.text.slice(0, r.caret)).toBe('x\n:::renal-dosing\n')
  })
  it('a bare ::: (closing a block) offers nothing, so Enter starts a new line', () => {
    expect(at(':::infobox\nacb_score: 1 [@pmid:1]\n:::')).toBeNull()
    expect(at('::')).toBeNull()
  })
  it(':: offers locked sections', () => {
    expect(at('::fda')?.options.map(o => o.label)).toEqual(['::fda-label-link', '::fda-label'])
  })
  it('inside :::infobox, a bare word offers keys with their source values', () => {
    const c = at(':::infobox\nacb')
    expect(c?.options).toEqual([{ label: 'acb_score', insert: 'acb_score: ', hint: 'ACB score (source: 1)' }])
  })
  it('nothing to complete in plain prose', () => {
    expect(at('Metformin lowers glucose')).toBeNull()
  })
})

describe('reading view', () => {
  it('labels renal ranges in words and units', () => {
    const base = { action: 'x', citations: [] }
    expect(rangeLabel({ ...base, measure: 'egfr', comparator: '<', low: 30, high: null })).toBe('eGFR <30 mL/min/1.73 m²')
    expect(rangeLabel({ ...base, measure: 'egfr', comparator: 'range', low: 30, high: 45 })).toBe('eGFR 30 to <45 mL/min/1.73 m²')
    expect(rangeLabel({ ...base, measure: 'crcl', comparator: '>=', low: 60, high: null })).toBe('CrCl ≥60 mL/min')
    expect(rangeLabel({ ...base, measure: 'dialysis', comparator: 'any', low: null, high: null })).toBe('On dialysis')
  })

  it('formats a PubMed reference Vancouver-style with links', () => {
    const r = referenceParts({
      ordinal: 1,
      key: 'pmid:26900641',
      kind: 'pmid',
      title: 'Long-term Metformin Use and Vitamin B12 Deficiency in the Diabetes Prevention Program Outcomes Study',
      authors: 'Aroda VR, Edelstein SL, Goldberg RB, et al.',
      container: 'J Clin Endocrinol Metab',
      year: 2016,
      volume: '101',
      issue: '4',
      pages: '1754-61',
      doi: '10.1210/jc.2015-3754',
      pmid: '26900641',
      setid: null,
      url: null,
    })
    expect(r.text).toBe(
      'Aroda VR, Edelstein SL, Goldberg RB, et al. Long-term Metformin Use and Vitamin B12 Deficiency in the Diabetes Prevention Program Outcomes Study. J Clin Endocrinol Metab. 2016;101(4):1754-61.',
    )
    expect(r.links.map(l => l.label)).toEqual(['PMID 26900641', 'doi:10.1210/jc.2015-3754'])
  })

  it('formats a DailyMed label and a source not yet looked up', () => {
    expect(
      referenceParts({ ordinal: 2, key: 'dailymed:1ed9dde4-339c-486f-a346-dde33a5e493f', kind: 'dailymed', title: 'METFORMIN HYDROCHLORIDE TABLET, EXTENDED RELEASE', authors: 'AJANTA PHARMA USA INC.', container: 'DailyMed', year: 2026, volume: null, issue: null, pages: null, doi: null, pmid: null, setid: '1ed9dde4-339c-486f-a346-dde33a5e493f', url: null }).text,
    ).toBe('AJANTA PHARMA USA INC. METFORMIN HYDROCHLORIDE TABLET, EXTENDED RELEASE. DailyMed, 2026.')
    expect(referenceParts({ ordinal: 3, key: 'pmid:1', kind: 'pmid', title: null, authors: null, container: null, year: null, volume: null, issue: null, pages: null, doi: null, pmid: null, setid: null, url: null })).toEqual({
      text: 'pmid:1.',
      links: [{ href: 'https://pubmed.ncbi.nlm.nih.gov/1/', label: 'PMID 1' }],
    })
  })

  it('numbers citations from the stored list, else in reading order', () => {
    const m = parsePageSource(METFORMIN_SOURCE, METFORMIN).model
    expect(numbersFor(m, []).get('pmid:9742977')).toBe(2)
    expect(numbersFor(templateModel(METFORMIN), []).size).toBe(0)
  })

  it('normalises citation keys in text the way the parser does', () => {
    expect(citeKeys('@doi:10.2337/DC25-S009; @pmid:1')).toEqual(['doi:10.2337/dc25-s009', 'pmid:1'])
  })
})

describe('publish errors', () => {
  it('maps edge function answers to problems the editor can show', () => {
    expect(toProblem(422, { error: 'invalid', diagnostics: [] })).toEqual({ kind: 'invalid', diagnostics: [] })
    expect(toProblem(409, { error: 'edit_conflict', conflicts: [], revisionId: 5, source: 'x' })).toEqual({ kind: 'conflict', conflicts: [], revisionId: 5, source: 'x' })
    expect(toProblem(422, { error: 'citation_not_found', key: 'pmid:9', message: 'No PMID 9' })).toEqual({ kind: 'citation', key: 'pmid:9', message: 'No PMID 9' })
    expect(toProblem(429, { error: 'rate_limited', message: 'Slow down' })).toMatchObject({ kind: 'message', status: 429, code: 'rate_limited' })
    expect(toProblem(0, {})).toMatchObject({ kind: 'message', status: 0 })
  })

  it('keeps one draft per page and section', () => {
    expect(draftKey(1, undefined)).toBe('pc:draft:1:page')
    expect(draftKey(1, { kind: 'section', heading: 'Patient Education' })).toBe('pc:draft:1:section:patient education')
    expect(draftKey(1, { kind: 'rail', name: 'infobox' })).toBe('pc:draft:1:infobox')
  })
})
