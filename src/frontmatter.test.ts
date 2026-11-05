import { describe, expect, it } from 'vitest'
import { MAX_FRONTMATTER_LENGTH, parseFrontmatter } from './frontmatterParse'
import {
  readFlag,
  readIsoDate,
  readList,
  readPairs,
  readText,
} from './frontmatter'

describe('parseFrontmatter', () => {
  it('splits a block from the body', () => {
    const r = parseFrontmatter('---\ntitle: Hello\ntags: [a, b]\n---\n\nBody text.\n')
    expect(r.error).toBeNull()
    expect(r.meta).toEqual({ title: 'Hello', tags: ['a', 'b'] })
    expect(r.body).toBe('Body text.')
  })

  it('returns the whole text when there is no block', () => {
    const r = parseFrontmatter('\nJust text.\n\n---\n\nMore.\n')
    expect(r).toEqual({ meta: {}, body: 'Just text.\n\n---\n\nMore.', error: null })
  })

  it('treats a block that never closes as ordinary text', () => {
    const r = parseFrontmatter('---\ntitle: x\n\nBody.')
    expect(r.meta).toEqual({})
    expect(r.body).toBe('---\ntitle: x\n\nBody.')
  })

  it('accepts CRLF, a BOM and a blank line after the opening fence', () => {
    const r = parseFrontmatter('﻿---\r\n\r\ntitle: "A: B"\r\n---\r\nBody\r\n')
    expect(r.error).toBeNull()
    expect(r.meta).toEqual({ title: 'A: B' })
    expect(r.body).toBe('Body')
  })

  it('accepts an empty block', () => {
    expect(parseFrontmatter('---\n---\nBody')).toEqual({ meta: {}, body: 'Body', error: null })
  })

  it('keeps dates as strings', () => {
    const r = parseFrontmatter('---\ndate: 2026-10-27\nversion: 0.2\n---\n')
    expect(r.meta.date).toBe('2026-10-27')
    expect(r.meta.version).toBe(0.2)
  })

  it('reports broken YAML, returns no metadata and still strips the block', () => {
    const r = parseFrontmatter('---\ntitle: Build log: part 1\n---\nBody')
    expect(r.error).toBeTruthy()
    expect(r.meta).toEqual({})
    expect(r.body).toBe('Body')
  })

  it('refuses anchors and aliases', () => {
    const r = parseFrontmatter('---\na: &x [1, 2]\nb: *x\n---\nBody')
    expect(r.error).toBeTruthy()
    expect(r.meta).toEqual({})
  })

  it('refuses duplicate keys', () => {
    expect(parseFrontmatter('---\na: 1\na: 2\n---\n').error).toBeTruthy()
  })

  it('refuses a block that is not key: value pairs', () => {
    expect(parseFrontmatter('---\n- a\n- b\n---\n').error).toBeTruthy()
    expect(parseFrontmatter('---\njust a string\n---\n').error).toBeTruthy()
  })

  it('refuses an oversized block', () => {
    const r = parseFrontmatter(`---\nnote: ${'x'.repeat(MAX_FRONTMATTER_LENGTH)}\n---\nBody`)
    expect(r.error).toMatch(/limit/)
    expect(r.body).toBe('Body')
  })
})

describe('typed readers', () => {
  const meta = {
    title: '  Hi  ',
    empty: '   ',
    version: 0.2,
    list: ['a', ' b ', 3, null, { x: 1 }],
    csv: 'a, b ,, c',
    flagBool: true,
    flagText: 'True',
    pairs: { Operator: 'Acme', Count: 2, Blank: '', Nested: { x: 1 } },
  }

  it('readText', () => {
    expect(readText(meta, 'title')).toBe('Hi')
    expect(readText(meta, 'empty')).toBeUndefined()
    expect(readText(meta, 'version')).toBe('0.2')
    expect(readText(meta, 'missing')).toBeUndefined()
    expect(readText(meta, 'list')).toBeUndefined()
  })

  it('readIsoDate', () => {
    expect(readIsoDate({ d: '2026-10-27' }, 'd')).toBe('2026-10-27')
    expect(readIsoDate({ d: '2026-02-31' }, 'd')).toBeUndefined()
    expect(readIsoDate({ d: 'October 27, 2026' }, 'd')).toBeUndefined()
    expect(readIsoDate({}, 'd')).toBeUndefined()
  })

  it('readFlag', () => {
    expect(readFlag(meta, 'flagBool')).toBe(true)
    expect(readFlag(meta, 'flagText')).toBe(true)
    expect(readFlag(meta, 'missing')).toBe(false)
    expect(readFlag({ draft: false }, 'draft')).toBe(false)
  })

  it('readList', () => {
    expect(readList(meta, 'list')).toEqual(['a', 'b', '3'])
    expect(readList(meta, 'csv')).toEqual(['a', 'b', 'c'])
    expect(readList(meta, 'missing')).toEqual([])
  })

  it('readPairs', () => {
    expect(readPairs(meta, 'pairs')).toEqual([
      { label: 'Operator', value: 'Acme' },
      { label: 'Count', value: '2' },
    ])
    expect(readPairs(meta, 'list')).toEqual([])
  })
})
