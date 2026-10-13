import { describe, expect, it } from 'vitest'
import { HANDLE_PATTERN, commentErrorMessage, countVisible, threadComments } from './blogComments'
import type { BlogComment } from './blogComments'
import { HANDLE_PATTERN as CONTRIBUTE_HANDLE_PATTERN } from './contribute'

function row(id: number, parent: number | null, at: string, state: BlogComment['state'] = 'visible'): BlogComment {
  return {
    id,
    parent_id: parent,
    handle: state === 'visible' ? `user${id}` : null,
    credential: null,
    body: state === 'visible' ? `body ${id}` : null,
    state,
    created_at: at,
    edited_at: null,
    is_mine: false,
  }
}

describe('threadComments', () => {
  it('nests replies under their parent, oldest first', () => {
    const rows = [
      row(3, 1, '2026-10-12T10:03:00Z'),
      row(2, null, '2026-10-12T10:02:00Z'),
      row(1, null, '2026-10-12T10:01:00Z'),
      row(4, 1, '2026-10-12T10:02:30Z'),
    ]
    const t = threadComments(rows)
    expect(t.map(c => c.id)).toEqual([1, 2])
    expect(t[0].replies.map(r => r.id)).toEqual([4, 3])
    expect(t[1].replies).toEqual([])
  })

  it('keeps a reply whose parent is missing as a top-level comment', () => {
    const t = threadComments([row(5, 99, '2026-10-12T10:00:00Z')])
    expect(t.map(c => c.id)).toEqual([5])
  })

  it('breaks timestamp ties by id', () => {
    const t = threadComments([row(8, null, '2026-10-12T10:00:00Z'), row(7, null, '2026-10-12T10:00:00Z')])
    expect(t.map(c => c.id)).toEqual([7, 8])
  })
})

describe('countVisible', () => {
  it('ignores hidden and deleted placeholders', () => {
    expect(countVisible([row(1, null, 'a', 'hidden'), row(2, 1, 'b'), row(3, 1, 'c', 'deleted')])).toBe(1)
  })
})

describe('commentErrorMessage', () => {
  it('maps RPC reasons and constraint codes to plain language', () => {
    expect(commentErrorMessage('rate_limited')).toMatch(/wait/)
    expect(commentErrorMessage('handle_required')).toMatch(/handle/)
    expect(commentErrorMessage('whatever', '23505')).toMatch(/taken/)
    expect(commentErrorMessage('whatever')).toMatch(/try again/)
  })
})

describe('HANDLE_PATTERN', () => {
  it('matches the contributor handle rule', () => {
    expect(HANDLE_PATTERN.source).toBe(CONTRIBUTE_HANDLE_PATTERN.source)
  })
})
