import { describe, expect, it } from 'vitest'
import { parseFrontmatter } from './frontmatterParse'
import type { FrontmatterResult } from './frontmatter'
import { buildPost } from './blog'

const FILES = import.meta.glob<FrontmatterResult>('./content/posts/*.md', { query: '?fm', import: 'default', eager: true })

describe('blog post front matter', () => {
  it('finds the committed posts', () => {
    expect(Object.keys(FILES).length).toBeGreaterThan(0)
  })

  it.each(Object.entries(FILES))('%s: front matter reads without error', (_path, fm) => {
    expect(fm.error).toBeNull()
  })

  it.each(Object.entries(FILES))('%s: has a title and an ISO date', (path, fm) => {
    const post = buildPost(path, fm)
    expect(post.title).not.toBe('')
    expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(post.body.length).toBeGreaterThan(100)
  })

  it('has one post per slug', () => {
    const slugs = Object.entries(FILES).map(([p, fm]) => buildPost(p, fm).slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})

describe('buildPost', () => {
  it('reads every key and applies the defaults', () => {
    const post = buildPost(
      './content/posts/2026-11-05-hello-world.md',
      parseFrontmatter('---\ntitle: "Hello: world"\ndate: 2026-11-05\nsummary: S\ntags: [a, b]\ndraft: true\n---\nSome words here.\n'),
    )
    expect(post).toMatchObject({
      slug: 'hello-world',
      title: 'Hello: world',
      date: '2026-11-05',
      author: 'Joshua Semock, PharmD',
      summary: 'S',
      tags: ['a', 'b'],
      draft: true,
      body: 'Some words here.',
      readingMinutes: 1,
    })
  })

  it('falls back to the file name when the front matter is broken', () => {
    const post = buildPost('./content/posts/2026-11-05-oops.md', parseFrontmatter('---\ntitle: a: b\n---\nBody'))
    expect(post.title).toBe('oops')
    expect(post.body).toBe('Body')
  })

  it('accepts the legacy comma-separated tags and quoted draft flag', () => {
    const post = buildPost('./content/posts/x.md', parseFrontmatter('---\ntags: a, b\ndraft: "true"\n---\nBody'))
    expect(post.tags).toEqual(['a', 'b'])
    expect(post.draft).toBe(true)
  })
})
