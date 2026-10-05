import { describe, expect, it } from 'vitest'
import { diffStats, lineDiff, revisionText, withContext } from './diff'

describe('lineDiff', () => {
  it('marks added, removed and unchanged lines in order', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc\nd')).toEqual([
      { op: 'same', text: 'a' },
      { op: 'del', text: 'b' },
      { op: 'add', text: 'B' },
      { op: 'same', text: 'c' },
      { op: 'add', text: 'd' },
    ])
  })

  it('treats an empty side as all added or all removed', () => {
    expect(diffStats(lineDiff('', 'x\ny'))).toEqual({ added: 2, removed: 0 })
    expect(diffStats(lineDiff('x\ny', ''))).toEqual({ added: 0, removed: 2 })
    expect(lineDiff('same', 'same')).toEqual([{ op: 'same', text: 'same' }])
  })
})

describe('withContext', () => {
  it('keeps changes plus nearby lines and folds the rest into one gap', () => {
    const before = ['1', '2', '3', '4', '5', '6', '7', '8'].join('\n')
    const after = ['1', '2', '3', '4', '5', '6', '7', 'eight'].join('\n')
    const shown = withContext(lineDiff(before, after), 1)
    expect(shown[0]).toBeNull()
    expect(shown.filter(Boolean).map(l => l!.text)).toEqual(['7', '8', 'eight'])
  })
})

describe('revisionText', () => {
  it('joins description and body with a blank line', () => {
    expect(revisionText({ description: 'Lead.', body_md: '## A' })).toBe('Lead.\n\n## A')
    expect(revisionText({ description: '', body_md: '## A' })).toBe('## A')
  })
})
