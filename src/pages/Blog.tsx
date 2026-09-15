import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageShell, { RailHeading } from './PageShell'
import { listPosts, allTags, formatDate } from '../blog'

export default function Blog() {
  const posts = useMemo(() => listPosts(), [])
  const tags = useMemo(() => allTags(), [])
  const [params, setParams] = useSearchParams()

  // The URL is the only source of truth, so back/forward and shared links agree.
  const active = params.get('tag')
  const visible = active ? posts.filter(p => p.tags.includes(active)) : posts

  function selectTag(tag: string | null) {
    const next = new URLSearchParams(params)
    if (tag) next.set('tag', tag)
    else next.delete('tag')
    setParams(next, { replace: true })
  }

  const aside =
    tags.length > 0 ? (
      <div>
        <RailHeading>Filter by topic</RailHeading>
        <div className="flex flex-wrap gap-1.5">
          <TagButton label="All" active={active === null} onClick={() => selectTag(null)} />
          {tags.map(tag => (
            <TagButton
              key={tag}
              label={tag}
              active={active === tag}
              onClick={() => selectTag(active === tag ? null : tag)}
            />
          ))}
        </div>
        <p className="mt-4 font-sans text-[12.5px] text-sage-600" aria-live="polite">
          {active
            ? `${visible.length} of ${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`
            : `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`}
        </p>
      </div>
    ) : undefined

  return (
    <PageShell
      title="Notes from the build"
      lede="Data-model decisions, environmental-risk methodology, and the occasional argument about why a drug reference should be free. Written as the work happens, not after it."
      aside={aside}
      toc={false}
    >
      {visible.length === 0 ? (
        <p className="py-10 font-sans text-[15.5px] text-sage-600">
          {posts.length === 0
            ? 'No posts yet. Add a markdown file to src/content/posts/ and it will appear here.'
            : 'No posts with that topic.'}
        </p>
      ) : (
        <ul className="divide-y divide-sage-200">
          {visible.map(post => (
            <li key={post.slug} className="py-9 first:pt-10">
              <article>
                <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[13.5px] text-sage-600">
                  <time dateTime={post.date}>{formatDate(post.date)}</time>
                  <span>{post.readingMinutes} minute read</span>
                  {post.draft && (
                    <span className="rounded border border-coral-200 bg-coral-100 px-1.5 py-0.5 font-mono text-[11px] text-coral-600">
                      draft
                    </span>
                  )}
                </p>

                <h2
                  className="font-display text-[26px] font-semibold leading-snug text-balance text-sage-900"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  <Link
                    to={`/blog/${post.slug}`}
                    className="transition-colors hover:text-aqua-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-500"
                  >
                    {post.title}
                  </Link>
                </h2>

                {post.summary && (
                  <p className="mt-3 font-sans text-[16px] leading-[1.65] text-pretty text-sage-600">
                    {post.summary}
                  </p>
                )}

                {post.tags.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Topics">
                    {post.tags.map(tag => (
                      <li key={tag}>
                        <button
                          type="button"
                          onClick={() => selectTag(tag)}
                          className="rounded-md border border-sage-200 bg-white/60 px-2 py-0.5 font-sans text-[12.5px] text-sage-600 transition-colors hover:border-sage-300 hover:text-sage-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-500"
                        >
                          {tag}
                        </button>
                      </li>
                    ))}
                  </ul>
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
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md border px-2.5 py-1 font-sans text-[12.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-500 ${
        active
          ? 'border-aqua-400 bg-aqua-100 text-aqua-700'
          : 'border-sage-200 bg-white/60 text-sage-600 hover:border-sage-300 hover:text-sage-900'
      }`}
    >
      {label}
    </button>
  )
}
