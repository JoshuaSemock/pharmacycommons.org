import { describe, expect, it } from 'vitest'
import {
  buildCountQuery,
  buildRowsQuery,
  checkUpdate,
  keyCondition,
  lockReason,
  parseRowsParams,
  quoteIdent,
  sameValue,
  toCsv,
  toParam,
  type TableMeta,
} from './localDb'

const moieties: TableMeta = {
  name: 'moieties',
  kind: 'r',
  estimate: 15929,
  comment: null,
  columns: [
    { name: 'pcid', type: 'bigint', notnull: true, generated: false, pk: true },
    { name: 'name', type: 'text', notnull: true, generated: false, pk: false },
    { name: 'unii', type: 'text', notnull: false, generated: false, pk: false },
    { name: 'synonyms', type: 'text[]', notnull: false, generated: false, pk: false },
    { name: 'parent_moiety_pcid', type: 'bigint', notnull: false, generated: false, pk: false },
  ],
}
const view: TableMeta = { ...moieties, name: 'moiety_hierarchy', kind: 'm' }
const ledger: TableMeta = { ...moieties, name: 'pcid_blocks' }
const nokey: TableMeta = { ...moieties, name: 'loose', columns: moieties.columns.map(c => ({ ...c, pk: false })) }

describe('parseRowsParams', () => {
  it('keeps known columns, drops unknown ones and caps the limit', () => {
    const p = parseRowsParams(new URLSearchParams('sort=name&dir=desc&limit=9999&offset=-4&f.unii=ABC&f.nope=1&q= met '), moieties)
    expect(p).toEqual({ limit: 500, offset: 0, sort: 'name', dir: 'desc', q: 'met', filters: { unii: 'ABC' } })
  })
  it('ignores a sort column that is not in the table', () => {
    expect(parseRowsParams(new URLSearchParams('sort=pcid;drop table x'), moieties).sort).toBeUndefined()
  })
  it('allows up to 100,000 rows for CSV', () => {
    expect(parseRowsParams(new URLSearchParams(''), moieties, true).limit).toBe(100_000)
  })
})

describe('buildRowsQuery', () => {
  it('orders by the key by default and binds every value', () => {
    const p = parseRowsParams(new URLSearchParams('f.name=met%25&f.parent_moiety_pcid=1001923&q=x'), moieties)
    const q = buildRowsQuery(moieties, p)
    expect(q.text).toBe(
      'select * from public."moieties" where "name"::text ilike $1 and "parent_moiety_pcid"::text = $2 and ' +
        '("pcid"::text ilike $3 or "name"::text ilike $3 or "unii"::text ilike $3 or "synonyms"::text ilike $3 or "parent_moiety_pcid"::text ilike $3)' +
        ' order by "pcid" limit 100 offset 0',
    )
    expect(q.values).toEqual(['%met\\%%', '1001923', '%x%'])
  })
  it('sorts by the chosen column, then the key', () => {
    const q = buildRowsQuery(moieties, parseRowsParams(new URLSearchParams('sort=name&dir=desc&offset=200'), moieties))
    expect(q.text).toBe('select * from public."moieties" order by "name" desc nulls last, "pcid" limit 100 offset 200')
  })
  it('treats NULL in a filter as "is null"', () => {
    const q = buildCountQuery(moieties, parseRowsParams(new URLSearchParams('f.unii=NULL'), moieties))
    expect(q.text).toBe('select count(*)::bigint as n from public."moieties" where "unii" is null')
    expect(q.values).toEqual([])
  })
})

describe('editing rules', () => {
  it('locks the key, pcid, views, ledgers and keyless tables', () => {
    expect(lockReason(moieties, moieties.columns[0])).toMatch(/row key/)
    expect(lockReason(moieties, moieties.columns[1])).toBeNull()
    expect(lockReason(view, view.columns[1])).toMatch(/Derived/)
    expect(lockReason(ledger, ledger.columns[1])).toMatch(/ledger/)
    expect(lockReason(nokey, nokey.columns[1])).toMatch(/no primary key/)
  })
  it('checkUpdate refuses wrong keys, unknown columns and NULL in a required column', () => {
    const ok = { table: 'moieties', key: { pcid: '1001923' }, column: 'unii', oldValue: null, newValue: '9100L32L2N' }
    expect(checkUpdate(moieties, ok)).toBeNull()
    expect(checkUpdate(undefined, ok)).toMatch(/Unknown table/)
    expect(checkUpdate(moieties, { ...ok, column: 'nope' })).toMatch(/Unknown column/)
    expect(checkUpdate(moieties, { ...ok, key: { name: 'x' } })).toMatch(/row key/)
    expect(checkUpdate(moieties, { ...ok, column: 'name', newValue: null })).toMatch(/NOT NULL/)
    expect(checkUpdate(moieties, { ...ok, column: 'pcid' })).toMatch(/row key/)
  })
  it('keyCondition compares keys as text from the given parameter number', () => {
    expect(keyCondition(moieties, { pcid: 1001923 }, 2)).toEqual({ sql: '"pcid"::text = $2', values: ['1001923'] })
  })
})

describe('helpers', () => {
  it('quotes identifiers', () => {
    expect(quoteIdent('we"ird')).toBe('"we""ird"')
  })
  it('converts edits to parameters by column type', () => {
    expect(toParam('text[]', '["a","b"]')).toEqual(['a', 'b'])
    expect(toParam('text[]', '{a,b}')).toBe('{a,b}')
    expect(toParam('jsonb', { a: 1 })).toBe('{"a":1}')
    expect(toParam('bigint', 5)).toBe('5')
    expect(toParam('text', null)).toBeNull()
  })
  it('compares values the way the browser saw them', () => {
    expect(sameValue(JSON.parse(JSON.stringify(new Date('2026-11-16T00:00:00Z'))), '2026-11-16T00:00:00.000Z')).toBe(true)
    expect(sameValue({ a: 1 }, { a: 1 })).toBe(true)
    expect(sameValue(null, undefined)).toBe(true)
    expect(sameValue('1', 1)).toBe(false)
  })
  it('writes CSV with quoting', () => {
    expect(toCsv(['a', 'b'], [{ a: 'x,y', b: null }, { a: 'say "hi"', b: { k: 1 } }])).toBe('a,b\r\n"x,y",\r\n"say ""hi""","{""k"":1}"\r\n')
  })
})
