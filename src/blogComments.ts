/**
 * Pharmacy Commons — blog comments (phase 17, db/phase17_blog_comments.sql)
 *
 * Any signed-in account can comment once it has a public @handle; verified
 * providers also show their credential badge. Comments publish at once and
 * patrollers review them afterwards from /review. One level of replies.
 *
 * Every write is a SECURITY DEFINER RPC that re-checks the caller; nothing
 * here decides what is allowed. The Supabase client is loaded on demand
 * (getSupabase) because comments sit below the post and shouldn't hold up
 * its first paint.
 *
 * Destination: src/blogComments.ts
 */

import { getSupabase } from './db'

export const COMMENT_MAX = 4000

/** Same rule as contributor_profiles.handle (and HANDLE_PATTERN in src/contribute.ts, which
 * isn't imported here because it pulls the Supabase SDK into the blog chunk). */
export const HANDLE_PATTERN = /^[A-Za-z0-9_.-]{3,30}$/

export type CommentState = 'visible' | 'hidden' | 'deleted'

/** One row of blog_comments(). Hidden/deleted rows carry no handle or text. */
export type BlogComment = {
  id: number
  parent_id: number | null
  handle: string | null
  credential: string | null
  body: string | null
  state: CommentState
  created_at: string
  edited_at: string | null
  is_mine: boolean
}

export type CommentThread = BlogComment & { replies: BlogComment[] }

/** A live comment nobody has reviewed yet (blog_comment_queue()). */
export type QueuedComment = {
  id: number
  post_slug: string
  parent_id: number | null
  handle: string
  credential: string | null
  body: string
  created_at: string
  edited_at: string | null
}

/**
 * Group flat rows into top-level comments with their replies, both oldest
 * first. A reply whose parent isn't in the list (shouldn't happen: the RPC
 * keeps a removed parent as a placeholder while it has live replies) is
 * shown as a top-level comment rather than dropped.
 */
export function threadComments(rows: BlogComment[]): CommentThread[] {
  const byTime = (a: BlogComment, b: BlogComment) =>
    a.created_at === b.created_at ? a.id - b.id : a.created_at < b.created_at ? -1 : 1
  const sorted = [...rows].sort(byTime)
  const tops = new Map<number, CommentThread>()
  for (const r of sorted) if (r.parent_id === null) tops.set(r.id, { ...r, replies: [] })
  const orphans: CommentThread[] = []
  for (const r of sorted) {
    if (r.parent_id === null) continue
    const parent = tops.get(r.parent_id)
    if (parent) parent.replies.push(r)
    else orphans.push({ ...r, replies: [] })
  }
  return [...tops.values(), ...orphans].sort(byTime)
}

/** Live comments only — the number shown in the heading. */
export function countVisible(rows: BlogComment[]): number {
  return rows.filter(r => r.state === 'visible').length
}

export async function getComments(slug: string): Promise<BlogComment[]> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.rpc('blog_comments', { p_slug: slug })
  if (error) throw new CommentError(error.message, error.code)
  return ((data ?? []) as BlogComment[]).map(r => ({ ...r, id: Number(r.id), parent_id: r.parent_id === null ? null : Number(r.parent_id) }))
}

/** The signed-in user's handle, or null if they haven't chosen one. */
export async function getMyHandle(): Promise<string | null> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.rpc('my_public_handle')
  if (error) throw new CommentError(error.message, error.code)
  return (data as string | null) ?? null
}

/** Whether the signed-in user may mark comments reviewed or hide them. */
export async function isPatroller(): Promise<boolean> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.rpc('has_role', { p_role: 'patroller' })
  if (error) return false
  return data === true
}

export async function setPublicHandle(handle: string): Promise<void> {
  const supabase = await getSupabase()
  const { error } = await supabase.rpc('set_public_handle', { p_handle: handle })
  if (error) throw new CommentError(error.message, error.code)
}

export async function postComment(slug: string, body: string, parentId: number | null): Promise<number> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.rpc('post_blog_comment', {
    p_slug: slug,
    p_body: body,
    p_parent_id: parentId,
  })
  if (error) throw new CommentError(error.message, error.code)
  return Number(data)
}

export async function editComment(id: number, body: string): Promise<void> {
  const supabase = await getSupabase()
  const { error } = await supabase.rpc('edit_blog_comment', { p_id: id, p_body: body })
  if (error) throw new CommentError(error.message, error.code)
}

export async function deleteComment(id: number): Promise<void> {
  const supabase = await getSupabase()
  const { error } = await supabase.rpc('delete_blog_comment', { p_id: id })
  if (error) throw new CommentError(error.message, error.code)
}

export type ModerationAction = 'patrol' | 'hide' | 'restore'

export async function moderateComment(id: number, action: ModerationAction, note?: string): Promise<void> {
  const supabase = await getSupabase()
  const { error } = await supabase.rpc('moderate_blog_comment', {
    p_id: id,
    p_action: action,
    p_note: note ?? null,
  })
  if (error) throw new CommentError(error.message, error.code)
}

export async function getCommentQueue(): Promise<QueuedComment[]> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.rpc('blog_comment_queue', { p_limit: 200 })
  if (error) throw new CommentError(error.message, error.code)
  return ((data ?? []) as QueuedComment[]).map(r => ({ ...r, id: Number(r.id) }))
}

/** Raised by the comment RPCs; `reason` is the exception text (e.g. 'rate_limited'). */
export class CommentError extends Error {
  reason: string
  code: string | undefined
  constructor(reason: string, code?: string) {
    super(commentErrorMessage(reason, code))
    this.reason = reason
    this.code = code
  }
}

export function commentErrorMessage(reason: string, code?: string): string {
  switch (reason) {
    case 'not_signed_in':
      return 'Sign in to comment.'
    case 'blocked':
      return 'Your account can’t post comments right now.'
    case 'handle_required':
      return 'Choose a public handle before your first comment.'
    case 'empty':
      return 'Write something first.'
    case 'too_long':
      return `Comments are limited to ${COMMENT_MAX.toLocaleString()} characters.`
    case 'rate_limited':
      return 'You’ve posted a lot of comments in a short time. Please wait a few minutes and try again.'
    case 'no_such_comment':
      return 'That comment is no longer available. It may have been deleted or hidden.'
    case 'reply_depth':
      return 'Replies can only answer a top-level comment.'
    case 'no_such_post':
      return 'This post can’t take comments.'
    case 'not_patroller':
      return 'Only reviewers can do that.'
    case 'note_required':
      return 'Add a short reason for hiding the comment.'
  }
  if (code === '23505') return 'That handle is taken. Try another.'
  if (code === '23514') return 'Handles are 3–30 letters, numbers, dots, dashes or underscores.'
  return 'That didn’t work. Please try again.'
}

export function commentError(err: unknown): string {
  if (err instanceof CommentError) return err.message
  return 'That didn’t work. Please try again.'
}
