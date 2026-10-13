import { useCallback, useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Button from './Button'
import { useSession } from '../auth'
import {
  COMMENT_MAX,
  HANDLE_PATTERN,
  commentError,
  countVisible,
  deleteComment,
  editComment,
  getComments,
  getMyHandle,
  isPatroller,
  moderateComment,
  postComment,
  setPublicHandle,
  threadComments,
} from '../blogComments'
import type { BlogComment, CommentThread } from '../blogComments'

/**
 * Comments under a blog post (phase 17, src/blogComments.ts).
 *
 * Any signed-in account can comment after choosing a public @handle.
 * Comments publish at once and reviewers patrol them from /review. One level
 * of replies. Text is plain: no markdown, no HTML, no auto-linked URLs (keeps
 * spam links worthless and nothing to sanitize). Each comment has an anchor,
 * #comment-<id>, which the review queue links to.
 *
 * Destination: src/components/BlogComments.tsx
 */

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const LINK = `text-ink underline decoration-hepatica-300 underline-offset-2 hover:decoration-hepatica-600 ${FOCUS}`
const FIELD =
  'lp-field block w-full rounded-md px-3 py-2 font-sans text-[15px] leading-relaxed text-ink placeholder:text-ink/60'
const ALERT = 'rounded-md border border-rose-300 bg-rose-100/40 px-3 py-2 font-sans text-sm text-ink'

type Viewer =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; handle: string | null; patroller: boolean }

export default function BlogComments({ slug }: { slug: string }) {
  const { user, loading: sessionLoading } = useSession()
  const userId = user?.id ?? null
  const [rows, setRows] = useState<BlogComment[] | 'loading' | 'failed'>('loading')
  const [viewer, setViewer] = useState<Viewer>({ kind: 'loading' })
  const [replyTo, setReplyTo] = useState<number | null>(null)
  const [version, setVersion] = useState(0)

  const reload = useCallback(() => setVersion(v => v + 1), [])

  useEffect(() => {
    let cancelled = false
    getComments(slug)
      .then(r => {
        if (!cancelled) setRows(r)
      })
      .catch(() => {
        if (!cancelled) setRows('failed')
      })
    return () => {
      cancelled = true
    }
    // userId: is_mine depends on who is signed in.
  }, [slug, version, userId])

  useEffect(() => {
    if (sessionLoading) {
      setViewer({ kind: 'loading' })
      return
    }
    if (!userId) {
      setViewer({ kind: 'signed-out' })
      return
    }
    let cancelled = false
    Promise.all([getMyHandle(), isPatroller()])
      .then(([handle, patroller]) => {
        if (!cancelled) setViewer({ kind: 'signed-in', handle, patroller })
      })
      .catch(() => {
        if (!cancelled) setViewer({ kind: 'signed-in', handle: null, patroller: false })
      })
    return () => {
      cancelled = true
    }
  }, [userId, sessionLoading])

  // Arriving from /review with #comment-<id>: scroll once the comments exist.
  useEffect(() => {
    if (!Array.isArray(rows)) return
    const hash = window.location.hash
    if (!hash.startsWith('#comment-')) return
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'center' })
  }, [rows])

  const threads = Array.isArray(rows) ? threadComments(rows) : []
  const count = Array.isArray(rows) ? countVisible(rows) : 0
  const canWrite = viewer.kind === 'signed-in' && viewer.handle !== null
  const patroller = viewer.kind === 'signed-in' && viewer.patroller

  return (
    <section aria-labelledby="comments" className="mt-16 border-t border-ink/15 pt-8">
      <h2
        id="comments"
        className="font-display text-[22px] font-semibold leading-snug text-ink"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Comments{count > 0 ? ` (${count})` : ''}
      </h2>

      <div className="mt-5">
        <Composer
          slug={slug}
          viewer={viewer}
          onHandle={handle => setViewer(v => (v.kind === 'signed-in' ? { ...v, handle } : v))}
          onPosted={reload}
        />
      </div>

      {rows === 'loading' ? (
        <div className="mt-8 h-20 animate-pulse rounded-md bg-ink/10 motion-reduce:animate-none" aria-busy="true" />
      ) : rows === 'failed' ? (
        <p className="mt-8 font-sans text-[15px] text-ink">Comments couldn’t be loaded right now.</p>
      ) : threads.length === 0 ? (
        <p className="mt-8 font-sans text-[15px] text-ink">No comments yet.</p>
      ) : (
        <ol className="lp-divide-y mt-8">
          {threads.map(t => (
            <li key={t.id} className="py-5">
              <CommentItem
                comment={t}
                slug={slug}
                patroller={patroller}
                canReply={canWrite && t.state === 'visible'}
                replying={replyTo === t.id}
                onReply={() => setReplyTo(r => (r === t.id ? null : t.id))}
                onChanged={reload}
              />
              <Replies thread={t} slug={slug} patroller={patroller} onChanged={reload} />
              {replyTo === t.id && (
                <div className="mt-4 pl-4 sm:pl-8">
                  <CommentForm
                    label={`Reply to @${t.handle ?? 'comment'}`}
                    submitLabel="Post reply"
                    onCancel={() => setReplyTo(null)}
                    onSubmit={async body => {
                      await postComment(slug, body, t.id)
                      setReplyTo(null)
                      reload()
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Replies({
  thread,
  slug,
  patroller,
  onChanged,
}: {
  thread: CommentThread
  slug: string
  patroller: boolean
  onChanged: () => void
}) {
  if (thread.replies.length === 0) return null
  return (
    <ol className="mt-4 space-y-4 border-l border-ink/15 pl-4 sm:pl-6" aria-label="Replies">
      {thread.replies.map(r => (
        <li key={r.id}>
          <CommentItem
            comment={r}
            slug={slug}
            patroller={patroller}
            canReply={false}
            replying={false}
            onReply={() => undefined}
            onChanged={onChanged}
          />
        </li>
      ))}
    </ol>
  )
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function CommentItem({
  comment,
  slug,
  patroller,
  canReply,
  replying,
  onReply,
  onChanged,
}: {
  comment: BlogComment
  slug: string
  patroller: boolean
  canReply: boolean
  replying: boolean
  onReply: () => void
  onChanged: () => void
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm-delete' | 'hide'>('view')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const noteId = useId()

  if (comment.state !== 'visible') {
    return (
      <p id={`comment-${comment.id}`} className="font-sans text-[14px] italic text-ink">
        {comment.state === 'hidden' ? 'This comment was hidden by a reviewer.' : 'This comment was deleted.'}
      </p>
    )
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setMode('view')
      setNote('')
      onChanged()
    } catch (err) {
      setError(commentError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article id={`comment-${comment.id}`} className="scroll-mt-24 font-sans text-ink">
      <p className="text-[13.5px]">
        <span className="font-medium">@{comment.handle}</span>
        {comment.credential && <span> · {comment.credential}</span>}
        {' · '}
        <Link to={`/blog/${slug}#comment-${comment.id}`} className={LINK}>
          <time dateTime={comment.created_at}>{formatWhen(comment.created_at)}</time>
        </Link>
        {comment.edited_at && <span title={`Edited ${formatWhen(comment.edited_at)}`}> · edited</span>}
      </p>

      {mode === 'edit' ? (
        <div className="mt-2">
          <CommentForm
            label="Edit your comment"
            initial={comment.body ?? ''}
            submitLabel="Save"
            onCancel={() => setMode('view')}
            onSubmit={async body => {
              await editComment(comment.id, body)
              setMode('view')
              onChanged()
            }}
          />
        </div>
      ) : (
        <p className="mt-1.5 whitespace-pre-line text-[15.5px] leading-[1.7] [overflow-wrap:anywhere]">{comment.body}</p>
      )}

      {mode === 'view' && (canReply || comment.is_mine || patroller) && (
        <p className="mt-2 flex flex-wrap gap-2">
          {canReply && (
            <Button size="sm" selected={replying} onClick={onReply}>
              Reply
            </Button>
          )}
          {comment.is_mine && (
            <>
              <Button size="sm" onClick={() => setMode('edit')}>
                Edit
              </Button>
              <Button size="sm" onClick={() => setMode('confirm-delete')}>
                Delete
              </Button>
            </>
          )}
          {patroller && !comment.is_mine && (
            <Button size="sm" onClick={() => setMode('hide')}>
              Hide
            </Button>
          )}
        </p>
      )}

      {mode === 'confirm-delete' && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span>Delete this comment? Its text is erased for good.</span>
          <Button size="sm" disabled={busy} onClick={() => run(() => deleteComment(comment.id))}>
            Delete
          </Button>
          <Button size="sm" onClick={() => setMode('view')}>
            Cancel
          </Button>
        </p>
      )}

      {mode === 'hide' && (
        <form
          className="mt-2 max-w-xl space-y-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            if (note.trim()) void run(() => moderateComment(comment.id, 'hide', note.trim()))
          }}
        >
          <label htmlFor={noteId} className="block text-sm">
            Why hide it? (kept for reviewers, not shown publicly)
          </label>
          <input
            id={noteId}
            type="text"
            value={note}
            maxLength={500}
            onChange={e => setNote(e.target.value)}
            className={FIELD}
          />
          <span className="flex gap-2">
            <Button size="sm" type="submit" disabled={!note.trim() || busy}>
              Hide
            </Button>
            <Button size="sm" onClick={() => setMode('view')}>
              Cancel
            </Button>
          </span>
        </form>
      )}

      {error && (
        <p role="alert" className={`mt-2 ${ALERT}`}>
          {error}
        </p>
      )}
    </article>
  )
}

function Composer({
  slug,
  viewer,
  onHandle,
  onPosted,
}: {
  slug: string
  viewer: Viewer
  onHandle: (handle: string) => void
  onPosted: () => void
}) {
  if (viewer.kind === 'loading') return null
  if (viewer.kind === 'signed-out') {
    return (
      <p className="font-sans text-[15px] text-ink">
        <Link to="/account" className={LINK}>
          Sign in or register
        </Link>{' '}
        to join the conversation. Any account can comment.
      </p>
    )
  }
  if (viewer.handle === null) return <HandleForm onDone={onHandle} />
  return (
    <CommentForm
      label={`Comment as @${viewer.handle}`}
      submitLabel="Post comment"
      resetOnSubmit
      onSubmit={async body => {
        await postComment(slug, body, null)
        onPosted()
      }}
    />
  )
}

function HandleForm({ onDone }: { onDone: (handle: string) => void }) {
  const [handle, setHandle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  const valid = HANDLE_PATTERN.test(handle.trim())

  return (
    <form
      className="max-w-md space-y-2 font-sans text-ink"
      onSubmit={async e => {
        e.preventDefault()
        if (!valid) return
        setBusy(true)
        setError(null)
        try {
          await setPublicHandle(handle.trim())
          onDone(handle.trim())
        } catch (err) {
          setError(commentError(err))
        } finally {
          setBusy(false)
        }
      }}
    >
      <label htmlFor={id} className="block text-[15px]">
        Choose a public handle to comment. It appears next to everything you post or edit here.
      </label>
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-[15px]">@</span>
        <input
          id={id}
          type="text"
          value={handle}
          autoComplete="off"
          maxLength={30}
          onChange={e => setHandle(e.target.value)}
          className={`${FIELD} w-auto min-w-0 flex-1`}
          aria-describedby={`${id}-hint`}
        />
        <Button type="submit" size="sm" disabled={!valid || busy}>
          Save handle
        </Button>
      </span>
      <p id={`${id}-hint`} className="text-[13px]">
        3–30 letters, numbers, dots, dashes or underscores.
      </p>
      {error && (
        <p role="alert" className={ALERT}>
          {error}
        </p>
      )}
    </form>
  )
}

function CommentForm({
  label,
  submitLabel,
  initial = '',
  resetOnSubmit = false,
  onSubmit,
  onCancel,
}: {
  label: string
  submitLabel: string
  initial?: string
  resetOnSubmit?: boolean
  onSubmit: (body: string) => Promise<void>
  onCancel?: () => void
}) {
  const [body, setBody] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  const trimmed = body.trim()
  const remaining = COMMENT_MAX - body.length

  return (
    <form
      className="space-y-2 font-sans text-ink"
      onSubmit={async e => {
        e.preventDefault()
        if (!trimmed || busy) return
        setBusy(true)
        setError(null)
        try {
          await onSubmit(trimmed)
          if (resetOnSubmit) setBody('')
        } catch (err) {
          setError(commentError(err))
        } finally {
          setBusy(false)
        }
      }}
    >
      <label htmlFor={id} className="block text-[14px]">
        {label}
      </label>
      <textarea
        id={id}
        value={body}
        rows={4}
        maxLength={COMMENT_MAX}
        spellCheck
        onChange={e => setBody(e.target.value)}
        className={`${FIELD} resize-y`}
        aria-describedby={`${id}-note`}
      />
      <p id={`${id}-note`} className="text-[13px]">
        Comments are public and signed with your handle. Never include patient information.
        {remaining < 500 && ` ${remaining.toLocaleString()} characters left.`}
      </p>
      <span className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!trimmed || busy}>
          {busy ? 'Posting…' : submitLabel}
        </Button>
        {onCancel && (
          <Button size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </span>
      {error && (
        <p role="alert" className={ALERT}>
          {error}
        </p>
      )}
    </form>
  )
}
