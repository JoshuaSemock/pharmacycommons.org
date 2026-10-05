import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import WikiMarkdown from './components/WikiMarkdown'
import type { LinkedPage, PropertyValue } from './pageContent'
import { entityHref, linkKey, propertyKey, tokenizeWiki } from './wiki'

describe('tokenizeWiki', () => {
  it('splits links, labelled links and properties out of text', () => {
    expect(tokenizeWiki('See [[Metformin]], [[insulin-glargine|Lantus]] and {{ACB_score:amitriptyline}}.')).toEqual([
      { kind: 'text', value: 'See ' },
      { kind: 'link', target: 'Metformin', label: 'Metformin' },
      { kind: 'text', value: ', ' },
      { kind: 'link', target: 'insulin-glargine', label: 'Lantus' },
      { kind: 'text', value: ' and ' },
      { kind: 'property', key: 'acb_score', target: 'amitriptyline' },
      { kind: 'text', value: '.' },
    ])
  })

  it('treats a property with no target as this page', () => {
    expect(tokenizeWiki('{{acb_score}}')).toEqual([{ kind: 'property', key: 'acb_score', target: '' }])
  })

  it('leaves malformed patterns as text', () => {
    expect(tokenizeWiki('[[ ]] [[a\nb]] {{1bad}} {single}')).toEqual([
      { kind: 'text', value: '[[ ]]' },
      { kind: 'text', value: ' [[a\nb]] {{1bad}} {single}' },
    ])
  })
})

describe('keys match the database', () => {
  // refresh_page_links(): lower(trim(split_part(text, '|', 1))) and lower(key) / lower(trim(target))
  it('linkKey', () => expect(linkKey('  Type 2 Diabetes |T2DM')).toBe('type 2 diabetes'))
  it('propertyKey', () => expect(propertyKey('ACB_Score', ' Amitriptyline ')).toBe('acb_score|amitriptyline'))
})

describe('entityHref', () => {
  it('routes classes, lists and everything else', () => {
    expect(entityHref('class', 'biguanides')).toBe('/classifications/biguanides')
    expect(entityHref('list', 'do-not-crush')).toBe('/lists/do-not-crush')
    expect(entityHref('clinical', 'hypertension')).toBe('/drugs/hypertension')
  })
})

describe('WikiMarkdown', () => {
  const htn: LinkedPage = { pcid: 6000003, slug: 'hypertension', name: 'Hypertension', entityType: 'clinical' }
  const ami: LinkedPage = { pcid: 1000500, slug: 'amitriptyline', name: 'Amitriptyline', entityType: 'moiety' }
  const links = new Map<string, LinkedPage | null>([
    ['hypertension', htn],
    ['no such page', null],
  ])
  const properties = new Map<string, PropertyValue>([
    ['acb_score|amitriptyline', { key: 'acb_score', label: 'ACB score', value: '3', origin: 'list', list_slug: 'anticholinergic-burden', target: ami }],
    ['acb_score|', { key: 'acb_score', label: 'ACB score', value: '0', origin: 'community', citation: 'Boustani 2008', target: null }],
    ['dosing|', { key: 'dosing', label: 'Dosing', value: null, origin: 'label', resolve: 'client', target: null }],
  ])

  const render = (source: string) =>
    renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(WikiMarkdown, { source, links, properties, labelAnchor: 'prescribing-information' })),
    )

  it('renders resolved links, red links and value chips', () => {
    const html = render(
      'Treats [[Hypertension|high blood pressure]]; see [[No Such Page]]. ACB {{acb_score}}, amitriptyline {{ACB_score:amitriptyline}}, dose {{dosing}}, unknown {{bogus}}.',
    )
    expect(html).toContain('href="/drugs/hypertension"')
    expect(html).toContain('>high blood pressure</a>')
    expect(html).toContain('No page for “No Such Page” yet')
    expect(html).toContain('title="ACB score: community value. Source: Boustani 2008">0')
    expect(html).toContain('href="/lists/anticholinergic-burden"')
    expect(html).toContain('>3<')
    expect(html).toContain('href="#prescribing-information"')
    expect(html).toContain('{{bogus}}')
  })

  it('leaves wiki syntax inside code alone and allows no raw HTML', () => {
    const html = render('Write `[[metformin]]` to link.\n\n<script>alert(1)</script><b>bold</b>')
    expect(html).toContain('<code')
    expect(html).toContain('[[metformin]]')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<b>')
  })

  it('demotes headings and marks outside links nofollow', () => {
    const html = render('## Vancomycin dosing\n\n[guide](https://example.org)')
    expect(html).toContain('<h3')
    expect(html).not.toContain('<h2')
    expect(html).toContain('rel="nofollow ugc noopener noreferrer"')
  })
})
