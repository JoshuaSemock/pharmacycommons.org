import { describe, expect, it } from 'vitest'
import { HANDLE_PATTERN, contributeErrorMessage, linkMarkup, openLinkQuery } from './contribute'

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
