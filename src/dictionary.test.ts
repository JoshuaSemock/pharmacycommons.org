import { describe, expect, it, vi } from 'vitest'

// dictionary.ts imports the shared client; keep tests offline.
vi.mock('./supabaseClient', () => ({ supabase: {} }))

import { dicUtf16, dicUtf8, dictionaryBucketOf, displayDefinition, filterOf, ilikePattern, isFilter, tagOf, wordCount } from './dictionary'

describe('dictionaryBucketOf', () => {
  it('files ordinary words under their first letter', () => {
    expect(dictionaryBucketOf('metformin')).toBe('M')
    expect(dictionaryBucketOf('Glucophage')).toBe('G')
    expect(dictionaryBucketOf('(S)-ketamine')).toBe('S')
  })
  it('keeps Greek-looking abbreviations under their Latin letter', () => {
    expect(dictionaryBucketOf('PSI')).toBe('P')
    expect(dictionaryBucketOf('ETA')).toBe('E')
    expect(dictionaryBucketOf('PI')).toBe('P')
  })
  it('files hyphenated Greek words and glyphs under the Greek letter', () => {
    expect(dictionaryBucketOf('beta-carotene')).toBe('g:beta')
    expect(dictionaryBucketOf('17alpha-estriol')).toBe('g:alpha')
    expect(dictionaryBucketOf('α-methylfentanyl')).toBe('g:alpha')
    expect(dictionaryBucketOf('µg')).toBe('g:mu')
  })
  it('sends digits to # and symbols to sym', () => {
    expect(dictionaryBucketOf('5-HO-DMT')).toBe('#')
    expect(dictionaryBucketOf('°')).toBe('sym')
    expect(dictionaryBucketOf('(+)-menthol')).toBe('sym')
  })
})

describe('filterOf', () => {
  it('splits drugs, abbreviations and terms', () => {
    expect(filterOf({ kind: 'Term', term_type: 'brand' })).toBe('drugs')
    expect(filterOf({ kind: 'Term', term_type: 'generic' })).toBe('drugs')
    expect(filterOf({ kind: 'Abbreviation', term_type: 'Initialism' })).toBe('abbreviations')
    expect(filterOf({ kind: 'Grammar', term_type: 'Other' })).toBe('abbreviations')
    expect(filterOf({ kind: 'Term', term_type: 'Other' })).toBe('terms')
    expect(filterOf({ kind: 'Term', term_type: null })).toBe('terms')
  })
  it('validates URL values', () => {
    expect(isFilter('drugs')).toBe(true)
    expect(isFilter('nope')).toBe(false)
    expect(isFilter(null)).toBe(false)
  })
})

describe('displayDefinition', () => {
  it('rewrites the brand and generic boilerplate', () => {
    expect(displayDefinition({ definition: 'The brand drug form of metformin. ', term_type: 'brand' })).toBe('Brand name for metformin.')
    expect(displayDefinition({ definition: 'The generic drug form of Glucophage.', term_type: 'generic' })).toBe('Generic name; sold as Glucophage.')
    expect(displayDefinition({ definition: 'A generic name for a drug i.e., unbranded.', term_type: 'generic' })).toBe('Generic drug name.')
    expect(displayDefinition({ definition: null, term_type: 'generic' })).toBe('Generic drug name.')
    expect(displayDefinition({ definition: null, term_type: 'Other' })).toBeNull()
    expect(displayDefinition({ definition: 'Every Day. Use daily.', term_type: 'Initialism' })).toBe('Every Day. Use daily.')
  })
  it('describes "generic" rows by the record they link to', () => {
    const g = 'A generic name for a drug i.e., unbranded.'
    expect(displayDefinition({ definition: g, term_type: 'generic', member_pcid: 4000162 })).toBe('Brand-name product (FDA).')
    expect(displayDefinition({ definition: g, term_type: 'generic', member_pcid: 2001728 })).toBe('Combination product.')
    expect(displayDefinition({ definition: g, term_type: 'generic', member_pcid: 1003067 })).toBe('Generic drug name.')
  })
  it('tags brands by PCID block as well as by type', () => {
    expect(tagOf({ kind: 'Term', term_type: 'generic', member_pcid: 4000162 })).toBe('Brand')
    expect(tagOf({ kind: 'Term', term_type: 'brand', member_pcid: 1003067 })).toBe('Brand')
    expect(tagOf({ kind: 'Term', term_type: 'generic', member_pcid: 1003067 })).toBe('Generic')
    expect(tagOf({ kind: 'Abbreviation', term_type: 'Initialism', member_pcid: null })).toBe('Abbreviation')
    expect(tagOf({ kind: 'Term', term_type: 'Other', member_pcid: null })).toBeNull()
  })
})

describe('the .dic file', () => {
  const body = 'acetaminophen\r\nGlucophage\r\nα-methylfentanyl\r\n'

  it('counts one word per CRLF line', () => {
    expect(wordCount(body)).toBe(3)
  })

  it('writes UTF-8 with a byte-order mark', async () => {
    const bytes = new Uint8Array(await dicUtf8(body).arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder('utf-8').decode(bytes.slice(3))).toBe(body)
  })

  it('writes UTF-16 LE with a byte-order mark', async () => {
    const bytes = new Uint8Array(await dicUtf16(body).arrayBuffer())
    expect([...bytes.slice(0, 2)]).toEqual([0xff, 0xfe])
    expect(new TextDecoder('utf-16le').decode(bytes.slice(2))).toBe(body)
  })
})

describe('ilikePattern', () => {
  it('escapes LIKE wildcards', () => {
    expect(ilikePattern(' 50%_off ')).toBe('50\\%\\_off')
  })
})
