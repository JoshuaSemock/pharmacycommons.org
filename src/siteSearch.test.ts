import { describe, expect, it } from 'vitest'
import { STRONG_SCORE, drugScore, groupHits, scoreEntry, searchSite, staticEntries, tokens } from './siteSearch'
import type { SiteEntry } from './siteSearch'

const extra: SiteEntry[] = [
  { id: 'list-do-not-crush', kind: 'list', title: 'Do not crush', hint: 'List · 226 drugs', to: '/lists/do-not-crush', keywords: [], body: 'Oral forms that should not be crushed' },
  { id: 'list-georgia-mpje', kind: 'list', title: 'Georgia MPJE', hint: 'List', to: '/lists/georgia-mpje', keywords: [] },
  { id: 'class-n06ab', kind: 'class', title: 'Selective serotonin reuptake inhibitors', hint: 'WHO ATC · N06AB', to: '/classifications/ssri', keywords: ['N06AB'] },
  { id: 'blog-how-to-edit', kind: 'blog', title: 'How to edit a page', hint: 'A walkthrough', to: '/blog/how-to-edit-a-page', keywords: ['editing', 'wiki'] },
]
const all = [...staticEntries(), ...extra]
const top = (q: string) => searchSite(all, q)[0]

describe('tokens', () => {
  it('treats plurals as the same word but leaves short words and -ss alone', () => {
    expect(tokens('Days Supply')).toEqual(['day', 'supply'])
    expect(tokens('glass')).toEqual(['glass'])
    expect(tokens('gas')).toEqual(['gas'])
  })
})

describe('searchSite', () => {
  it('sends "dosing calculator" to the days supply tool', () => {
    expect(top('dosing calculator').to).toBe('/tools/days-supply')
  })
  it('finds days supply by "day supply", "days supply" and "quantity dispense"', () => {
    for (const q of ['day supply', 'days supply', 'quantity dispense', 'qty']) expect(top(q).to).toBe('/tools/days-supply')
  })
  it('finds the other tools by their other names', () => {
    expect(top('crcl').to).toBe('/tools/creatinine-clearance')
    expect(top('egfr').to).toBe('/tools/creatinine-clearance')
    expect(top('med rec').to).toBe('/tools/medication-reconciliation')
    expect(top('spell check').to).toBe('/tools/dictionary')
    expect(top('qt').to).toBe('/lists/arrhythmia-risk-long-qt')
    expect(top('torsades').to).toBe('/lists/arrhythmia-risk-long-qt')
  })
  it('matches a partly typed title', () => {
    expect(top('creat').to).toBe('/tools/creatinine-clearance')
    expect(top('medication rec').to).toBe('/tools/medication-reconciliation')
  })
  it('finds site pages, lists, classes and posts', () => {
    expect(top('blog').to).toBe('/blog')
    expect(top('privacy policy').to).toBe('/privacy')
    expect(top('sign in').to).toBe('/account')
    expect(top('georgia').to).toBe('/lists/georgia-mpje')
    expect(top('N06AB').to).toBe('/classifications/ssri')
    expect(top('editing').to).toBe('/blog/how-to-edit-a-page')
  })
  it('prefers a title over a keyword over a description', () => {
    expect(scoreEntry(extra[0], 'do not crush')).toBe(100)
    expect(scoreEntry(extra[0], 'crushed')).toBe(20) // description only
    const tool = staticEntries().find(e => e.id === 'tool-days-supply') as SiteEntry
    expect(scoreEntry(tool, 'dosing calculator')).toBe(92)
    expect(scoreEntry(tool, 'days supply and')).toBe(90)
  })
  it('needs every query word to match', () => {
    expect(searchSite(all, 'dosing banana')).toEqual([])
  })
  it('ignores one-letter queries and empty input', () => {
    expect(searchSite(all, 'a')).toEqual([])
    expect(searchSite(all, '  ')).toEqual([])
  })
  it('does not offer planned tools, which have nowhere to go', () => {
    expect(all.some(e => e.id === 'tool-body-surface-area')).toBe(false)
    expect(searchSite(all, 'body surface area').every(h => h.kind !== 'tool')).toBe(true)
  })
  it('every static entry has a destination on this site', () => {
    for (const e of staticEntries()) expect(e.to.startsWith('/')).toBe(true)
  })
})

describe('Enter-to-jump threshold', () => {
  it('is cleared by exact titles and keywords, not by loose matches', () => {
    expect(top('lists').score).toBeGreaterThanOrEqual(STRONG_SCORE)
    expect(top('dosing calculator').score).toBeGreaterThanOrEqual(STRONG_SCORE)
    expect(top('insulin').score).toBeLessThan(STRONG_SCORE) // "insulin pen" is only a partial match
  })
})

describe('groupHits', () => {
  it('orders groups by best score and caps each group', () => {
    const hits = searchSite(all, 'list')
    const { site } = groupHits(hits, 0, 2)
    expect(site.every(g => g.items.length <= 2)).toBe(true)
    expect(site[0].best).toBeGreaterThanOrEqual(site[site.length - 1].best)
  })
  it('puts drugs first only when they match at least as well', () => {
    const hits = searchSite(all, 'tools')
    expect(groupHits(hits, drugScore('metformin', undefined, 'tools'), 3).drugsFirst).toBe(false)
    expect(groupHits([], 50, 3).drugsFirst).toBe(true)
    expect(groupHits(searchSite(all, 'blog'), drugScore('Blog', undefined, 'blog'), 3).drugsFirst).toBe(true)
  })
})

describe('drugScore', () => {
  it('scores exact, prefix and other matches', () => {
    expect(drugScore('metformin', undefined, 'Metformin')).toBe(100)
    expect(drugScore('metformin', undefined, 'metf')).toBe(85)
    expect(drugScore('metformin', 'Glucophage', 'glucophage')).toBe(100)
    expect(drugScore('metformin', undefined, 'form')).toBe(50)
  })
})
