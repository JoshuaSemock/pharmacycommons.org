import { describe, expect, it } from 'vitest'
import { cellText, editText, groupOf, isSecret, lockReason, parseEdit, pcidHref, type TableMeta } from './localTables'
import { lockReason as serverLockReason, type TableMeta as ServerTableMeta } from '../scripts/localDb'

describe('groupOf', () => {
  it('sorts tables under the right heading', () => {
    expect(groupOf({ name: 'moieties', kind: 'r' })).toBe('Records')
    expect(groupOf({ name: 'clinical_statements', kind: 'r' })).toBe('Relationships')
    expect(groupOf({ name: 'list_items', kind: 'r' })).toBe('Lists')
    expect(groupOf({ name: 'label_sections', kind: 'r' })).toBe('Labels')
    expect(groupOf({ name: 'fda_products', kind: 'r' })).toBe('Sources')
    expect(groupOf({ name: 'learn_items', kind: 'r' })).toBe('Learn')
    expect(groupOf({ name: 'page_revisions', kind: 'r' })).toBe('Community (dormant)')
    expect(groupOf({ name: 'entity_changes', kind: 'r' })).toBe('History')
    expect(groupOf({ name: 'pcid_blocks', kind: 'r' })).toBe('Bookkeeping')
    expect(groupOf({ name: 'moiety_hierarchy', kind: 'm' })).toBe('Derived views')
    expect(groupOf({ name: 'something_new', kind: 'r' })).toBe('Other')
  })
})

describe('display helpers', () => {
  it('links PCID columns to the permalink', () => {
    expect(pcidHref('pcid', '1001923')).toBe('/id/PCID-1001923')
    expect(pcidHref('parent_moiety_pcid', 1003192)).toBe('/id/PCID-1003192')
    expect(pcidHref('setid', '1001923')).toBeNull()
    expect(pcidHref('pcid', null)).toBeNull()
  })
  it('hides secrets and shortens long values', () => {
    expect(isSecret('token_hash')).toBe(true)
    expect(isSecret('name')).toBe(false)
    expect(cellText(null)).toBe('NULL')
    expect(cellText('x'.repeat(100), 10)).toBe('xxxxxxxxx…')
    expect(cellText({ a: 1 })).toBe('{"a":1}')
    expect(editText(['a'])).toBe('[\n  "a"\n]')
  })
  it('parses edits by type and rejects bad input', () => {
    expect(parseEdit('text', 'abc', false)).toBe('abc')
    expect(parseEdit('text', 'abc', true)).toBeNull()
    expect(parseEdit('text[]', '["a"]', false)).toEqual(['a'])
    expect(parseEdit('jsonb', '{"a":1}', false)).toBe('{"a":1}')
    expect(() => parseEdit('jsonb', '{bad', false)).toThrow()
    expect(parseEdit('boolean', ' TRUE ', false)).toBe('true')
    expect(() => parseEdit('boolean', 'yes', false)).toThrow(/true or false/)
  })
})

describe('lockReason', () => {
  it('matches the server rules for every case', () => {
    const base: TableMeta = {
      name: 'moieties',
      kind: 'r',
      estimate: 0,
      comment: null,
      columns: [
        { name: 'pcid', type: 'bigint', notnull: true, generated: false, pk: true },
        { name: 'name', type: 'text', notnull: true, generated: false, pk: false },
        { name: 'id', type: 'bigint', notnull: true, generated: true, pk: false },
      ],
    }
    const cases: TableMeta[] = [
      base,
      { ...base, kind: 'v' },
      { ...base, name: 'entity_changes' },
      { ...base, columns: base.columns.map(c => ({ ...c, pk: false })) },
    ]
    for (const t of cases) {
      for (const c of t.columns) expect(lockReason(t, c)).toBe(serverLockReason(t as ServerTableMeta, c))
    }
  })
})
