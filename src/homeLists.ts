/**
 * The few entries of a list that the home page previews (src/pages/Home.tsx).
 *
 * Goes through getSupabase() so the SDK stays out of the first-load bundle, and
 * only runs once a tile is near the viewport. `get_list` returns the whole list;
 * we keep a handful of rows. Failure returns null: the tile then shows just its
 * link to the full list.
 *
 * Destination: src/homeLists.ts
 */

import { getSupabase } from './db'
import type { ListDetail, ListItem } from './api.generated'
import { sortItems } from './lists'

export type ListPreview = {
  title: string
  total: number
  items: ListItem[]
}

/** The list's own rank when it has one, otherwise A to Z. */
export function previewItems(items: ListItem[], count: number): ListItem[] {
  const ranked = items.some(i => i.rank !== null)
  return sortItems(items, ranked ? 'rank' : 'name', false).slice(0, count)
}

export async function loadListPreview(slug: string, count: number): Promise<ListPreview | null> {
  try {
    const supabase = await getSupabase()
    const { data, error } = await supabase.rpc('get_list', { p_slug: slug })
    if (error || !data) return null
    const detail = data as ListDetail
    const items = (detail.items ?? []).map(i => ({
      ...i,
      rank: i.rank === null || i.rank === undefined ? null : Number(i.rank),
      value: i.value === null || i.value === undefined ? null : Number(i.value),
    }))
    return { title: detail.title, total: items.length, items: previewItems(items, count) }
  } catch {
    return null
  }
}
