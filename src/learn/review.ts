/**
 * Learn — admin review calls (db/phase21i_learn_review.sql). Every function checks has_role('admin') itself.
 *
 * Destination: src/learn/review.ts
 */

import { getSupabase } from '../db'
import type { McqOption } from './types'

export type ItemStatus = 'draft' | 'review_needed' | 'published' | 'archived'
export type StatusCounts = { draft: number; review_needed: number; published: number; archived: number }
export type ReviewCollection = StatusCounts & { id: string; slug: string | null; title: string; status: 'draft' | 'published' | 'archived' }
export type ReviewTemplate = StatusCounts & { template_key: string }
export type ReviewSummary = { collections: ReviewCollection[]; templates: ReviewTemplate[] }

export type ReviewItem = {
  id: string
  template_key: string
  status: ItemStatus
  item_type: 'flashcard' | 'mcq'
  topic: string
  prompt: string
  concise_answer: string
  clinical_rationale: string | null
  clinical_caveats: string | null
  mcq_options: McqOption[] | null
  source_agency: string | null
  source_citation: string
  third_party_sources: string[]
  primary_pcid: number | null
  primary_name: string | null
}

export async function reviewSummary(): Promise<ReviewSummary> {
  const sb = await getSupabase()
  const { data, error } = await sb.rpc('learn_review_summary')
  if (error) throw error
  return data as ReviewSummary
}

export async function reviewItems(template: string, status: ItemStatus, limit: number, offset: number, seed: string) {
  const sb = await getSupabase()
  const { data, error } = await sb.rpc('learn_review_items', {
    p_template: template,
    p_status: status,
    p_limit: limit,
    p_offset: offset,
    p_seed: seed,
  })
  if (error) throw error
  return data as { total: number; items: ReviewItem[] }
}

export async function setItemStatus(ids: string[], status: ItemStatus): Promise<number> {
  const sb = await getSupabase()
  const { data, error } = await sb.rpc('learn_set_status', { p_ids: ids, p_status: status })
  if (error) throw error
  return data as number
}

export async function setCollectionStatus(id: string, status: 'draft' | 'published' | 'archived'): Promise<void> {
  const sb = await getSupabase()
  const { error } = await sb.rpc('learn_set_collection_status', { p_collection: id, p_status: status })
  if (error) throw error
}
