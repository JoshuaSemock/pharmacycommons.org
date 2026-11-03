import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GROUPS, GROUP_ORDER, KIND_KEYS, PREDICATES, isGroup, nodeKind, pagePath, predicateDefinition, predicatePhrase } from './predicates'

// The SQL decides which predicates become edges. Read it, so the two can't drift.
// phase 19 holds the original mapping; later phases (31a adds on_list) redefine the function, so read them all.
const sql = ['phase19_network.sql', 'phase31a_network_lists.sql'].map(f => readFileSync(new URL(`../../db/${f}`, import.meta.url), 'utf8')).join('\n')
const mapping = [...new Map([...sql.matchAll(/when '([a-z_]+)'\s+then '([a-z]+)'/g)].map(m => [m[1], { predicate: m[1], group: m[2] }])).values()]

describe('predicate vocabulary', () => {
  it('finds the mapping in the migration', () => {
    expect(mapping.length).toBeGreaterThan(25)
  })

  it('has a reading for every predicate the database turns into an edge', () => {
    const missing = mapping.filter(m => !(m.predicate in PREDICATES)).map(m => m.predicate)
    expect(missing).toEqual([])
  })

  it('only maps into groups the page knows', () => {
    for (const m of mapping) expect(isGroup(m.group)).toBe(true)
  })

  it('describes every group', () => {
    for (const g of GROUP_ORDER) {
      expect(GROUPS[g].label).toBeTruthy()
      expect(GROUPS[g].meaning.length).toBeGreaterThan(20)
    }
  })

  it('gives classification and clinical groups different line styles so color is never needed', () => {
    expect(GROUPS.safety.line).not.toBe(GROUPS.classification.line)
    expect(GROUPS.use.line).not.toBe(GROUPS.safety.line)
  })

  it('never lets a safety or use edge read as a recommendation or as proof of cause', () => {
    for (const [name, meta] of Object.entries(PREDICATES)) {
      expect(`${meta.forward} ${meta.reverse}`.toLowerCase(), name).not.toMatch(/\b(should be used|is indicated|recommended for|proves)\b/)
    }
    expect(GROUPS.safety.meaning).toMatch(/not proof of cause/i)
    expect(GROUPS.use.meaning).toMatch(/not a treatment recommendation/i)
  })
})

describe('phrases', () => {
  it('reads an edge from either end', () => {
    expect(predicatePhrase('member_of', 'subject')).toBe('is a member of')
    expect(predicatePhrase('member_of', 'object')).toBe('has member')
    expect(predicatePhrase('has_component', 'object')).toBe('is a component of')
  })

  it('falls back to the raw name for an unknown predicate', () => {
    expect(predicatePhrase('brand_new_thing', 'subject')).toBe('brand new thing')
    expect(predicateDefinition('brand_new_thing')).toMatch(/source/i)
  })
})

describe('node kinds and links', () => {
  it('draws kinds differently by shape, not hue', () => {
    expect(nodeKind('class').shape).not.toBe(nodeKind('moiety').shape)
    expect(nodeKind('clinical').shape).not.toBe(nodeKind('target').shape)
    expect(KIND_KEYS).toContain('functional')
  })

  it('draws a list as its own kind and links it to /lists', () => {
    expect(nodeKind('list').label).toBe('List')
    expect(nodeKind('list').shape).not.toBe(nodeKind('class').shape)
    expect(pagePath('list', 'anticholinergic-burden')).toBe('/lists/anticholinergic-burden')
  })

  it('reads on_list from either end and keeps lists apart from classification', () => {
    expect(isGroup('lists')).toBe(true)
    expect(predicatePhrase('on_list', 'subject')).toBe('is listed on')
    expect(predicatePhrase('on_list', 'object')).toBe('lists')
    expect(mapping).toContainEqual({ predicate: 'on_list', group: 'lists' })
    expect(GROUPS.lists.meaning).toMatch(/not a recommendation/i)
  })

  it('does not break on a kind it has not heard of', () => {
    expect(nodeKind('mystery').label).toBe('Record')
  })

  it('links records to their own pages and refuses odd slugs', () => {
    expect(pagePath('moiety', 'metformin')).toBe('/drugs/metformin')
    expect(pagePath('class', 'biguanides')).toBe('/classifications/biguanides')
    expect(pagePath('moiety', '../../evil')).toBeNull()
    expect(pagePath('moiety', 'javascript:alert(1)')).toBeNull()
    expect(pagePath('moiety', '')).toBeNull()
  })
})
