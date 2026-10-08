import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import Markdown from './Markdown'
import PageShell, { PageFrame, PageTitle, RailHeading } from './PageShell'
import { getPost, listPosts, formatDate } from '../blog'

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>()
  const post = slug ? getPost(slug) : undefined

  useEffect(() => {
    if (post) document.title = `${post.title} · Pharmacy Commons`
  }, [post])

  if (!post) {
    return (
      <PageShell title="Post not found" lede="That post does not exist, or it is still a draft.">
        <p className="pt-8">
          <Link
            to="/blog"
            className="font-sans text-[15px] text-ink underline decoration-hepatica-300 underline-offset-2 hover:decoration-hepatica-600"
          >
            Back to all posts
          </Link>
        </p>
      </PageShell>
    )
  }

  const posts = listPosts()
  const index = posts.findIndex(p => p.slug === post.slug)
  const newer = index > 0 ? posts[index - 1] : undefined
  const older = index >= 0 && index < posts.length - 1 ? posts[index + 1] : undefined

  const header = (
    <>
      <Link
        to="/blog"
        className="lp-press inline-block rounded-md px-2.5 py-1 font-sans text-[13.5px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40"
      >
        ← All posts
      </Link>
      <div className="mt-7">
        <PageTitle title={post.title} lede={post.summary}>
          <div className="mt-7 flex flex-wrap items-baseline gap-x-8 gap-y-2 font-sans text-[14px] text-ink">
            <p>
              By <span className="font-medium text-ink">{post.author}</span>
            </p>
            <p>
              <time dateTime={post.date}>{formatDate(post.date)}</time>
              {', '}
              {post.readingMinutes} minute read
            </p>
            {post.draft && (
              <span className="lp-label rounded bg-rose-100 px-1.5 py-0.5 font-mono text-[11px] text-ink">
                draft
              </span>
            )}
          </div>
        </PageTitle>
      </div>
    </>
  )

  const topics =
    post.tags.length > 0 ? (
      <div>
        <RailHeading>Topics</RailHeading>
        <ul className="flex flex-wrap gap-1.5">
          {post.tags.map(tag => (
            <li key={tag}>
              <Link
                to={`/blog?tag=${encodeURIComponent(tag)}`}
                className="lp-raised lp-press block rounded-md px-2 py-0.5 font-sans text-[12.5px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40"
              >
                {tag}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    ) : undefined

  return (
    <PageFrame
      header={header}
      aside={topics}
      asideOnMobile="hidden"
      contentKey={post.slug}
      tocMin={2}
    >
      <article className="pt-10">
        <Markdown source={post.body} />
      </article>

      {/* Small screens: topics follow the post instead of sitting above it. */}
      {topics && <div className="mt-12 lg:hidden">{topics}</div>}

      {(newer || older) && (
        <nav
          aria-label="More posts"
          className="mt-16 grid gap-6 border-t border-ink/15 pt-8 sm:grid-cols-2"
        >
          {newer ? (
            <Link to={`/blog/${newer.slug}`} className="lp-card group block rounded-md p-4">
              <span className="block font-sans text-[12.5px] text-ink">Newer post</span>
              <span
                className="lp-link-text mt-1 block font-display text-[18px] leading-snug text-ink"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {newer.title}
              </span>
            </Link>
          ) : (
            <span className="hidden sm:block" />
          )}
          {older && (
            <Link to={`/blog/${older.slug}`} className="lp-card group block rounded-md p-4 sm:text-right">
              <span className="block font-sans text-[12.5px] text-ink">Older post</span>
              <span
                className="lp-link-text mt-1 block font-display text-[18px] leading-snug text-ink"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {older.title}
              </span>
            </Link>
          )}
        </nav>
      )}
    </PageFrame>
  )
}
