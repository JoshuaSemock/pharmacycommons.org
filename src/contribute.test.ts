import { describe, expect, it } from 'vitest'
import { HANDLE_PATTERN, PAGE_KINDS, PAGE_KIND_GROUPS, contributeErrorMessage, linkMarkup, openLinkQuery, pageKindParam, slugify, subtypeFor } from './contribute'

describe('openLinkQuery', () => {
  it('finds an unfinished [[ before the caret', () => {
    const text = 'See [[metf'
    expect(openLinkQuery(text, text.length)).toEqual({ start: 4, query: 'metf' })
  })

  it('ignores closed links, piped links and new lines', () => {
    expect(openLinkQuery('See [[metformin]] and', 21)).toBeNull()
    expect(openLinkQuery('[[metformin|Gluc', 16)).toBeNull()
    expect(openLinkQuery('[[metf\nmore', 11)).toBeNull()
    expect(openLinkQuery('no link here', 12)).toBeNull()
  })

  it('works mid-text when the caret is inside the brackets', () => {
    expect(openLinkQuery('A [[war]] B', 7)).toEqual({ start: 2, query: 'war' })
  })
})

describe('linkMarkup', () => {
  it('uses the slug as the target and the name as the text', () => {
    expect(linkMarkup({ slug: 'insulin-glargine', name: 'Insulin glargine', entityType: 'moiety' })).toBe(
      '[[insulin-glargine|Insulin glargine]]',
    )
  })
  it('skips the label when the name already is the slug', () => {
    expect(linkMarkup({ slug: 'warfarin', name: 'Warfarin', entityType: 'moiety' })).toBe('[[warfarin]]')
  })
})

describe('contributeErrorMessage', () => {
  it('explains RPC exceptions in plain language', () => {
    expect(contributeErrorMessage('edit_conflict')).toMatch(/someone else saved/i)
    expect(contributeErrorMessage('not_verified')).toMatch(/verified NPI/)
    expect(contributeErrorMessage('duplicate key', '23505')).toMatch(/handle is taken/)
    expect(contributeErrorMessage('anything else')).toMatch(/couldn’t be saved/)
  })
})

describe('HANDLE_PATTERN', () => {
  it('matches the database check', () => {
    // contributor_profiles.handle ~ '^[A-Za-z0-9_.-]{3,30}$'
    expect(HANDLE_PATTERN.test('jsmith_rph')).toBe(true)
    expect(HANDLE_PATTERN.test('ab')).toBe(false)
    expect(HANDLE_PATTERN.test('has space')).toBe(false)
    expect(HANDLE_PATTERN.test('a'.repeat(31))).toBe(false)
  })
})

describe('new pages', () => {
  it('maps every kind to a creatable PCID block', () => {
    const creatable = ['moiety', 'precise_form', 'combination', 'formulation', 'class', 'clinical', 'measurement', 'target', 'functional']
    for (const k of PAGE_KINDS) expect(creatable).toContain(k.kind)
    // Every option sits in a group the picker shows.
    const groups = PAGE_KIND_GROUPS.map(g => g.group)
    for (const k of PAGE_KINDS) expect(groups).toContain(k.group)
    expect(new Set(PAGE_KINDS.map(k => k.id)).size).toBe(PAGE_KINDS.length)
    // Clinical concepts and herbals carry the subtype create_page stores.
    for (const k of PAGE_KINDS.filter(k => k.kind === 'clinical' || k.kind === 'functional')) expect(k.subtype).toBeTruthy()
  })

  it('offers classifications and terminology (psychedelics, lungs)', () => {
    expect(PAGE_KINDS.find(k => k.id === 'class')?.kind).toBe('class')
    expect(PAGE_KINDS.find(k => k.id === 'anatomy')).toMatchObject({ kind: 'clinical', subtype: 'Anatomy', group: 'Terminology' })
    expect(PAGE_KINDS.find(k => k.id === 'term')).toMatchObject({ kind: 'clinical', subtype: 'Term' })
  })

  it('reads ?type= only when it names a page type', () => {
    expect(pageKindParam('class')).toBe('class')
    expect(pageKindParam('list')).toBe('')
    expect(pageKindParam(null)).toBe('')
  })

  it('stores the chosen measurement type, else the option subtype', () => {
    const lab = PAGE_KINDS.find(k => k.id === 'measurement')!
    const symptom = PAGE_KINDS.find(k => k.id === 'symptom')!
    const drug = PAGE_KINDS.find(k => k.id === 'moiety')!
    expect(subtypeFor(lab, 'Vital Sign')).toBe('Vital Sign')
    expect(subtypeFor(lab, '')).toBeNull()
    expect(subtypeFor(symptom, 'Vital Sign')).toBe('Symptom')
    expect(subtypeFor(drug, '')).toBeNull()
  })

  it('slugifies like pc_slugify()', () => {
    expect(slugify('  Lactic Acidosis ')).toBe('lactic-acidosis')
    expect(slugify('Lisinopril/Hydrochlorothiazide')).toBe('lisinopril-hydrochlorothiazide')
    expect(slugify('Vitamin D3 (cholecalciferol)')).toBe('vitamin-d3-cholecalciferol')
    expect(slugify('—')).toBe('')
  })

  it('explains duplicate refusals', () => {
    expect(contributeErrorMessage('page_exists')).toMatch(/already exists/)
    expect(contributeErrorMessage('identifier_exists')).toMatch(/UNII or CAS/)
  })
})
