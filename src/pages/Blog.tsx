import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageShell from './PageShell'
import { listPosts, allTags, formatDate } from '../blog'

export default function Blog() {
  const posts = useMemo(() => listPosts(), [])
  const tags = useMemo(() => allTags(), [])
  const [params, setParams] = useSearchParams()
  const [active, setActive] = useState<string | null>(params.get('tag'))

  const visible = active ? posts.filter(p => p.tags.includes(active)) : posts

  function selectTag(tag: string | null) {
    setActive(tag)
    const next = new URLSearchParams(params)
    if (tag) next.set('tag', tag)
    else next.delete('tag')
    setParams(next, { replace: true })
  }

  return (
    <PageShell
      kicker="Blog"
      title="Notes from the build"
      lede="Data-model decisions, environmental-risk methodology, and the occasional argument about why a drug reference should be free. Written as the work happens, not after it."
    >
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-sage-200 pt-8">
          <TagButton label="All" active={active === null} onClick={() => selectTag(null)} />
          {tags.map(tag => (
            <TagButton
              key={tag}
              label={tag}
              active={active === tag}
              onClick={() => selectTag(tag)}
            />
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="border-t border-sage-200 py-10 font-sans text-[14.5px] text-sage-600">
          {posts.length === 0
            ? 'No posts yet. Add a markdown file to src/content/posts/ and it will appear here.'
            : 'No posts with that tag.'}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-sage-200">
          {visible.map(post => (
            <li key={post.slug} className="py-7">
              <article>
                <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-sage-600">
                  <time dateTime={post.date}>{formatDate(post.date)}</time>
                  <span aria-hidden="true">·</span>
                  <span>{post.readingMinutes} min read</span>
                  {post.draft && (
                    <span className="rounded border border-coral-200 bg-coral-100 px-1.5 py-0.5 text-coral-600">
                      draft
                    </span>
                  )}
                </div>

                <h2
                  className="font-display text-[22px] font-semibold leading-snug text-sage-900"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  <Link to={`/blog/${post.slug}`} className="hover:text-aqua-700 transition-colors">
                    {post.title}
                  </Link>
                </h2>

                {post.summary && (
                  <p className="mt-2 font-sans text-[14.5px] leading-relaxed text-sage-600">
                    {post.summary}
                  </p>
                )}

                {post.tags.length > 0 && (
                  <p className="mt-3 flex flex-wrap gap-1.5">
                    {post.tags.map(tag => (
                      <span
                        key={tag}
                        className="rounded border border-sage-200 bg-sage-100 px-1.5 py-0.5 font-mono text-[10px] text-sage-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </p>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  )
}

function TagButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 font-sans text-[12.5px] transition-colors ${
        active
          ? 'border-aqua-400 bg-aqua-100 text-aqua-700'
          : 'border-sage-200 bg-white/60 text-sage-600 hover:border-sage-300 hover:text-sage-900'
      }`}
    >
      {label}
    </button>
  )
}
