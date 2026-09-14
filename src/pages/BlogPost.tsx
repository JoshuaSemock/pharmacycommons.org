import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import Markdown from './Markdown'
import { getPost, listPosts, formatDate } from '../blog'

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>()
  const post = slug ? getPost(slug) : undefined

  useEffect(() => {
    document.title = post ? `${post.title} · Pharmacy Commons` : 'Post not found · Pharmacy Commons'
    window.scrollTo(0, 0)
  }, [post])

  if (!post) {
    return (
      <main className="mx-auto max-w-7xl px-4 sm:px-6 pb-24">
        <div className="max-w-3xl pt-16">
          <h1
            className="font-display text-3xl font-semibold text-sage-900"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Post not found
          </h1>
          <p className="mt-4 font-sans text-[15px] text-sage-600">
            That post does not exist, or it is still a draft.
          </p>
          <Link
            to="/blog"
            className="mt-6 inline-block font-sans text-[14px] text-aqua-700 underline decoration-aqua-300 underline-offset-2 hover:decoration-aqua-600"
          >
            Back to all posts
          </Link>
        </div>
      </main>
    )
  }

  const posts = listPosts()
  const index = posts.findIndex(p => p.slug === post.slug)
  const newer = index > 0 ? posts[index - 1] : undefined
  const older = index >= 0 && index < posts.length - 1 ? posts[index + 1] : undefined

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 pb-24">
      <article className="max-w-2xl pt-12">
        <Link
          to="/blog"
          className="font-sans text-[13px] text-sage-600 hover:text-sage-900 transition-colors"
        >
          ← All posts
        </Link>

        <header className="mt-6 mb-8">
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-sage-600">
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span aria-hidden="true">·</span>
            <span>{post.author}</span>
            <span aria-hidden="true">·</span>
            <span>{post.readingMinutes} min read</span>
            {post.draft && (
              <span className="rounded border border-coral-200 bg-coral-100 px-1.5 py-0.5 text-coral-600">
                draft
              </span>
            )}
          </div>

          <h1
            className="font-display text-3xl sm:text-[34px] font-semibold leading-[1.15] text-sage-900"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {post.title}
          </h1>

          {post.summary && (
            <p className="mt-4 font-sans text-[16px] leading-relaxed text-sage-600">
              {post.summary}
            </p>
          )}
        </header>

        <div className="border-t border-sage-200 pt-8">
          <Markdown source={post.body} />
        </div>

        {post.tags.length > 0 && (
          <p className="mt-10 flex flex-wrap gap-1.5">
            {post.tags.map(tag => (
              <Link
                key={tag}
                to={`/blog?tag=${encodeURIComponent(tag)}`}
                className="rounded border border-sage-200 bg-sage-100 px-1.5 py-0.5 font-mono text-[10px] text-sage-600 hover:border-sage-300 hover:text-sage-900 transition-colors"
              >
                {tag}
              </Link>
            ))}
          </p>
        )}

        {(newer || older) && (
          <nav className="mt-12 flex flex-col gap-4 border-t border-sage-200 pt-6 sm:flex-row sm:justify-between">
            {newer ? (
              <Link to={`/blog/${newer.slug}`} className="group max-w-[20rem]">
                <span className="block font-mono text-[10px] text-sage-600">Newer</span>
                <span className="block font-sans text-[14px] text-sage-700 group-hover:text-aqua-700 transition-colors">
                  {newer.title}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {older && (
              <Link to={`/blog/${older.slug}`} className="group max-w-[20rem] sm:text-right">
                <span className="block font-mono text-[10px] text-sage-600">Older</span>
                <span className="block font-sans text-[14px] text-sage-700 group-hover:text-aqua-700 transition-colors">
                  {older.title}
                </span>
              </Link>
            )}
          </nav>
        )}
      </article>
    </main>
  )
}
