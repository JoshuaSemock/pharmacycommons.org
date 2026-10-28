/**
 * Learn — database access. Uses getSupabase() so the SDK stays out of the first-load bundle.
 * Reads work for guests (published official content is public); progress calls need a session.
 *
 * Destination: src/learn/api.ts
 */

import { getSupabase } from '../db'
import { clampLimits, type LearnSettings } from './settings'
import type { LearnCollection, LearnItem, McqOption, ReviewEvent, SchedState } from './types'

const ITEM_COLS =
  'id,item_type,template_key,subject_area,topic,subtopic,tags,primary_pcid,prompt,concise_answer,clinical_rationale,clinical_caveats,mcq_options,source_agency,source_citation,source_url,license,third_party_sources,content_version'

type ItemRow = Omit<LearnItem, 'mcq_options'> & { mcq_options: McqOption[] | null }

export async function listCollections(): Promise<LearnCollection[]> {
  const sb = await getSupabase()
  const { data: cols, error } = await sb
    .from('learn_collections')
    .select('id,slug,title,description,subject_area,sort_order')
    .eq('is_official', true)
    .eq('status', 'published')
    .order('sort_order')
    .order('title')
  if (error) throw error
  const { data: counts, error: cErr } = await sb.from('learn_collection_counts').select('collection_id,flashcard_count,mcq_count')
  if (cErr) throw cErr
  const n = new Map((counts ?? []).map(c => [c.collection_id as string, (c.flashcard_count as number) + (c.mcq_count as number)]))
  return (cols ?? [])
    .map(c => ({ ...(c as Omit<LearnCollection, 'item_count'>), item_count: n.get(c.id as string) ?? 0 }))
    .filter(c => c.item_count > 0)
}

/** A collection and its published items in the collection's order. `idOrSlug` may be either. */
export async function getCollection(idOrSlug: string): Promise<{ collection: LearnCollection; items: LearnItem[] } | null> {
  const sb = await getSupabase()
  const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)
  const { data: col, error } = await sb
    .from('learn_collections')
    .select('id,slug,title,description,subject_area,excluded_item_ids')
    .eq(isId ? 'id' : 'slug', idOrSlug)
    .maybeSingle()
  if (error) throw error
  if (!col) return null

  const excluded = new Set<string>((col.excluded_item_ids as string[] | null) ?? [])
  const items: LearnItem[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error: iErr } = await sb
      .from('learn_collection_items')
      .select(`sort_order, learn_items!inner(${ITEM_COLS})`)
      .eq('collection_id', col.id)
      .order('sort_order')
      .range(from, from + 999)
    if (iErr) throw iErr
    for (const row of (data ?? []) as unknown as { learn_items: ItemRow }[]) {
      if (!excluded.has(row.learn_items.id)) items.push(row.learn_items)
    }
    if (!data || data.length < 1000) break
  }
  return {
    collection: { id: col.id, slug: col.slug, title: col.title, description: col.description, subject_area: col.subject_area, item_count: items.length },
    items,
  }
}

/** Published items by id, for the due queue that spans collections. Missing or unpublished ids are skipped. */
export async function getItemsByIds(ids: readonly string[]): Promise<LearnItem[]> {
  const sb = await getSupabase()
  const out: LearnItem[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await sb.from('learn_items').select(ITEM_COLS).in('id', ids.slice(i, i + 100))
    if (error) throw error
    out.push(...((data ?? []) as unknown as ItemRow[]))
  }
  return out
}

type StateRow = Partial<SchedState> & { item_id: string; state: SchedState['state'] }

/** All of the signed-in learner's scheduling state, keyed by item id. */
export async function getMyStates(): Promise<Map<string, SchedState>> {
  const sb = await getSupabase()
  const out = new Map<string, SchedState>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('learn_user_item_state').select('*').range(from, from + 999)
    if (error) throw error
    for (const r of (data ?? []) as StateRow[]) {
      out.set(r.item_id, {
        state: r.state,
        step: r.step ?? 0,
        stability: r.stability ?? 0,
        difficulty: r.difficulty ?? 0,
        reps: r.reps ?? 0,
        lapses: r.lapses ?? 0,
        last_rating: r.last_rating ?? null,
        last_reviewed_at: r.last_reviewed_at ?? null,
        due_at: r.due_at ?? new Date().toISOString(),
      })
    }
    if (!data || data.length < 1000) break
  }
  return out
}

/** The signed-in learner's saved settings; null when they have never saved any. Throws when the read fails. */
export async function getMySettings(): Promise<LearnSettings | null> {
  const sb = await getSupabase()
  const { data, error } = await sb.from('learn_user_settings').select('max_new_per_day,max_reviews_per_day,cover_options').maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    limits: clampLimits({ newItems: data.max_new_per_day as number, reviews: data.max_reviews_per_day as number }),
    coverOptions: data.cover_options === true,
  }
}

/** Save the signed-in learner's settings (one row per user; RLS limits it to their own). */
export async function saveMySettings(userId: string, s: LearnSettings): Promise<void> {
  const sb = await getSupabase()
  const { error } = await sb.from('learn_user_settings').upsert(
    {
      user_id: userId,
      max_new_per_day: s.limits.newItems,
      max_reviews_per_day: s.limits.reviews,
      cover_options: s.coverOptions,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (error) throw error
}

/** How many cards the signed-in learner has started since local midnight (counts against the new-card limit). */
export async function countMyNewToday(now: Date = new Date()): Promise<number> {
  const sb = await getSupabase()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const { count, error } = await sb
    .from('learn_review_events')
    .select('id', { count: 'exact', head: true })
    .gte('reviewed_at', start.toISOString())
    .eq('state_before->>state', 'new')
  if (error) return 0
  return count ?? 0
}

/** Record one review. Idempotent on client_event_id; an event older than the stored state does not change it. */
export async function recordReview(e: ReviewEvent): Promise<void> {
  const sb = await getSupabase()
  const { error } = await sb.rpc('learn_record_review', {
    p_item: e.item_id,
    p_collection: e.collection_id,
    p_mode: e.mode,
    p_rating: e.rating,
    p_is_correct: e.is_correct,
    p_selected_option: e.selected_option_id,
    p_was_unsure: e.was_unsure,
    p_duration_ms: e.duration_ms,
    p_client_event_id: e.client_event_id,
    p_reviewed_at: e.reviewed_at,
    p_scheduler_version: e.scheduler_version,
    p_state_before: e.state_before,
    p_state_after: e.state_after,
  })
  if (error) throw error
}

export type StudyLink = { collection_id: string; slug: string | null; title: string; item_count: number }

/** Published collections with a card about this drug or topic (drug-page study pill). */
export async function collectionsForPcid(pcid: number): Promise<StudyLink[]> {
  const sb = await getSupabase()
  const { data, error } = await sb.rpc('learn_collections_for_pcid', { p_pcid: pcid })
  if (error) throw error
  return (data ?? []) as StudyLink[]
}

/** Published collections built from a list (list-page study pill). */
export async function collectionsForList(slug: string): Promise<StudyLink[]> {
  const sb = await getSupabase()
  const { data, error } = await sb.rpc('learn_collections_for_list', { p_slug: slug })
  if (error) throw error
  return ((data ?? []) as StudyLink[]).filter(c => c.item_count > 0)
}
