import { describe, expect, it } from 'vitest'
import { INFOBOX_KEYS, METFORMIN, METFORMIN_SOURCE } from './fixtures/metformin'
import {
  buildPayload,
  citationOrder,
  fromCrossref,
  fromDailyMed,
  fromEsummary,
  overlayStructured,
  parsePageSource,
  resolveCitation,
  serializeCommunity,
  serializePage,
} from './index'
import type { SourceMeta } from './index'

const parsed = parsePageSource(METFORMIN_SOURCE, METFORMIN)
const model = parsed.model

// Trimmed from live responses fetched 2026-10-10.
const ESUMMARY = {
  result: {
    uids: ['26900641', '999999999'],
    '26900641': {
      uid: '26900641',
      pubdate: '2016 Apr',
      source: 'J Clin Endocrinol Metab',
      authors: [
        { name: 'Aroda VR', authtype: 'Author' },
        { name: 'Edelstein SL', authtype: 'Author' },
        { name: 'Goldberg RB', authtype: 'Author' },
        { name: 'Knowler WC', authtype: 'Author' },
        { name: 'Diabetes Prevention Program Research Group', authtype: 'CollectiveName' },
      ],
      title: 'Long-term Metformin Use and Vitamin B12 Deficiency in the Diabetes Prevention Program Outcomes Study.',
      volume: '101',
      issue: '4',
      pages: '1754-61',
      articleids: [
        { idtype: 'pubmed', value: '26900641' },
        { idtype: 'doi', value: '10.1210/jc.2015-3754' },
      ],
    },
    '999999999': { uid: '999999999', error: 'cannot get document summary' },
  },
}
const CROSSREF = {
  status: 'ok',
  message: {
    issue: '4',
    'short-container-title': [],
    DOI: '10.1210/jc.2015-3754',
    page: '1754-1761',
    title: ['Long-term Metformin Use and Vitamin B12 Deficiency in the Diabetes Prevention Program Outcomes Study'],
    volume: '101',
    author: [
      { given: 'Vanita R.', family: 'Aroda' },
      { given: 'Sharon L.', family: 'Edelstein' },
      { name: 'the Diabetes Prevention Program Research Group' },
    ],
    'container-title': ['The Journal of Clinical Endocrinology & Metabolism'],
    issued: { 'date-parts': [[2016, 4, 1]] },
  },
}
const DAILYMED = {
  data: [
    {
      spl_version: 7,
      published_date: 'Sep 17, 2026',
      title: 'METFORMIN HYDROCHLORIDE TABLET, EXTENDED RELEASE [AJANTA PHARMA USA INC.]',
      setid: '1ed9dde4-339c-486f-a346-dde33a5e493f',
    },
  ],
}
const pmid = (id: string) => ({ kind: 'pmid' as const, id, key: `pmid:${id}` })
const dm = { kind: 'dailymed' as const, id: '1ed9dde4-339c-486f-a346-dde33a5e493f', key: 'dailymed:1ed9dde4-339c-486f-a346-dde33a5e493f' }

describe('citation lookups', () => {
  it('reads PubMed esummary', () => {
    const r = fromEsummary(pmid('26900641'), ESUMMARY)
    expect(r).toMatchObject({
      status: 'found',
      meta: {
        title: 'Long-term Metformin Use and Vitamin B12 Deficiency in the Diabetes Prevention Program Outcomes Study',
        authors: 'Aroda VR, Edelstein SL, Goldberg RB, et al.',
        container: 'J Clin Endocrinol Metab',
        year: 2016,
        volume: '101',
        issue: '4',
        pages: '1754-61',
        doi: '10.1210/jc.2015-3754',
        pmid: '26900641',
        resolved: true,
      },
    })
  })

  it('says when a PMID does not exist', () => {
    expect(fromEsummary(pmid('999999999'), ESUMMARY)).toEqual({ status: 'not_found', message: 'PubMed has no article with PMID 999999999.' })
  })

  it('reads Crossref', () => {
    const r = fromCrossref({ kind: 'doi', id: '10.1210/jc.2015-3754', key: 'doi:10.1210/jc.2015-3754' }, CROSSREF)
    expect(r).toMatchObject({ status: 'found', meta: { authors: 'Aroda VR, Edelstein SL', year: 2016, container: 'The Journal of Clinical Endocrinology & Metabolism', pages: '1754-1761' } })
  })

  it('reads DailyMed', () => {
    expect(fromDailyMed(dm, DAILYMED)).toMatchObject({
      status: 'found',
      meta: { title: 'METFORMIN HYDROCHLORIDE TABLET, EXTENDED RELEASE', authors: 'AJANTA PHARMA USA INC.', container: 'DailyMed', year: 2026 },
    })
    expect(fromDailyMed(dm, { data: [] }).status).toBe('not_found')
  })

  it('publishes anyway when a service is down, and resolves later', async () => {
    const r = await resolveCitation(pmid('1'), () => Promise.reject(new Error('timeout')))
    expect(r).toMatchObject({ status: 'unavailable', meta: { key: 'pmid:1', resolved: false } })
  })

  it('needs no lookup for url: citations', async () => {
    const r = await resolveCitation({ kind: 'url', id: 'https://www.fda.gov/x', key: 'url:https://www.fda.gov/x' }, () => Promise.resolve(null))
    expect(r).toMatchObject({ status: 'found', meta: { url: 'https://www.fda.gov/x', resolved: true } })
  })
})

describe('the reference list', () => {
  it('numbers sources in reading order: Quick Facts, lead, then the main column', () => {
    expect(citationOrder(model).map(c => c.key)).toEqual([
      'dailymed:1ed9dde4-339c-486f-a346-dde33a5e493f',
      'pmid:9742977',
      'pmid:39651989',
      'pmid:11832527',
      'pmid:32897388',
      'dailymed:b6d7edc9-93d6-4480-906d-55c18d053600',
      'pmid:20393934',
      'pmid:26900641',
    ])
  })
})

describe('publish payload', () => {
  const sources = new Map<string, SourceMeta>(
    citationOrder(model).map(c => [
      c.key,
      { key: c.key, kind: c.kind, title: null, authors: null, container: null, year: null, volume: null, issue: null, pages: null, doi: null, pmid: null, setid: null, url: null, resolved: false },
    ]),
  )
  const payload = buildPayload({ model, extracted: parsed.extracted, changed: ['lead'], summary: ' Rewrite lead ', sources })

  it('carries the model, the lead and the community-only source', () => {
    expect(payload.summary).toBe('Rewrite lead')
    expect(payload.description.startsWith('Metformin is a biguanide')).toBe(true)
    expect(payload.body_md.startsWith('::hierarchy')).toBe(true)
    expect(payload.source_md).toContain(':::infobox\ndo_not_crush: Extended-release tablets')
    expect(payload.source_md).not.toContain('# source')
    expect(payload.citations).toHaveLength(8)
  })

  it('refuses to build without metadata for every source', () => {
    expect(() => buildPayload({ model, extracted: parsed.extracted, changed: [], summary: 's', sources: new Map() })).toThrow(/No source metadata/)
  })

  it('community source is stable when only ingested values change', () => {
    const other = { ...METFORMIN, sourceValues: { ...METFORMIN.sourceValues, acb_score: '2' } }
    expect(serializeCommunity(parsePageSource(serializePage(model, other), other).model)).toBe(serializeCommunity(model))
  })
})

describe('live rows over a revision', () => {
  it('shows per-row Quick Facts, brand and renal changes in the editor', () => {
    const m = overlayStructured(
      model,
      {
        infobox: [
          { property_key: 'acb_score', value: '3', is_null_override: false, citation: 'Boustani 2008' },
          { property_key: 'qtc_risk', value: null, is_null_override: true, citation: '[@pmid:1]' },
          { property_key: 'dosing', value: null, is_null_override: false, citation: 'removed' },
        ],
        brands: [
          { brand_key: 'FORTAMET', brand_display: 'Fortamet', action: 'hide', citation: '[@pmid:2]', summary: 'not metformin' },
          { brand_key: 'DIABEX', brand_display: 'Diabex', action: 'add', citation: '[@pmid:3]', summary: 's' },
        ],
        thresholds: [{ block_name: 'renal-dosing', measure: 'egfr', comparator: '<', low: 30, high: null, action: 'avoid', citations: ['pmid:4'] }],
      },
      METFORMIN.sourceBrands,
      INFOBOX_KEYS.map(k => k.key),
    )
    expect(m.infobox?.lines.map(l => l.key)).toEqual(['acb_score', 'qtc_risk'])
    expect(m.brands?.lines.map(l => `${l.action}:${l.brand}`)).toEqual([
      'hide:FORTAMET',
      'source:Glucophage',
      'source:GLUCOPHAGE XR',
      'source:Glumetza',
      'source:Riomet',
      'add:Diabex',
    ])
    const text = serializePage(m, METFORMIN)
    expect(text).toContain('acb_score: 3 [@Boustani 2008]')
    expect(text).toContain(':::renal-dosing\negfr < 30: avoid [@pmid:4]\n:::')
    // The old free-text citation is flagged so the next editor replaces it.
    const r = parsePageSource(text, METFORMIN)
    expect(r.diagnostics.filter(d => d.severity === 'error').map(d => d.code)).toEqual(['bad_citation'])
  })
})
