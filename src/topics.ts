/**
 * /topics — everything in the Commons that is not a drug (blocks 6–9):
 * clinical concepts, labs and measurements, biological targets, herbal and
 * botanical sources. Drugs have /browse; classes and lists have their own
 * indexes. This is the way to find a topic you don't know the name of:
 * narrow by kind and subtype, read the A–Z list, or sort by how connected
 * each topic is to the rest of the knowledge base.
 *
 * "Connected" = distinct records that point at the topic: subjects of
 * clinical_statements whose object it is ("metformin — side effect — lactic
 * acidosis") plus pages whose Overview links to it (page_links). All reads
 * are public tables; nothing here writes.
 */

import { supabase } from './supabaseClient'
import { BUCKETS, bucketOf } from './catalog'
import type { Bucket } from './catalog'

export type TopicKind = 'clinical' | 'measurement' | 'target' | 'functional'

export const TOPIC_KINDS: { key: TopicKind; label: string; one: string; hint: string }[] = [
  { key: 'clinical', label: 'Clinical concepts', one: 'Clinical concept', hint: 'Conditions, symptoms, adverse effects, contraindications and risk factors, plus terminology: anatomy, physiology, organisms, procedures, dosage forms, routes and other medical terms' },
  { key: 'measurement', label: 'Labs and measurements', one: 'Lab or measurement', hint: 'Lab panels, vital signs, scales and derived calculations' },
  { key: 'target', label: 'Biological targets', one: 'Biological target', hint: 'Enzymes, transporters, genes and proteins drugs act on or depend on' },
  { key: 'functional', label: 'Herbals and botanicals', one: 'Herbal or botanical', hint: 'Plants and other biological sources of medicines and supplements' },
]

export type Topic = {
  pcid: number
  slug: string
  name: string
  kind: TopicKind
  /** The recorded subtype ("Indication", "Serum Lab Panel"), or null. */
  subtype: string | null
  /** Distinct records pointing at this topic. */
  connections: number
  /** Created by a contributor at /new rather than loaded from a source. */
  community: boolean
}

type Sub<K extends string> = { [P in K]: string | null } | { [P in K]: string | null }[] | null
export type TopicRow = {
  pcid: number
  slug: string
  name: string
  entity_type: string
  clinical_concepts?: Sub<'concept_type'>
  measurements?: Sub<'measurement_type'>
  biological_targets?: Sub<'target_type'>
  functional_groups?: Sub<'group_type'>
}

function subValue<K extends string>(v: Sub<K> | undefined, key: K): string | null {
  const row = Array.isArray(v) ? v[0] : v
  const val = row?.[key]
  return typeof val === 'string' && val.trim() ? val.trim() : null
}

/** "Botanical source" is the only herbal subtype today and says nothing the kind doesn't. */
function cleanSubtype(kind: TopicKind, subtype: string | null): string | null {
  if (kind === 'functional' && subtype && /^botanical/i.test(subtype)) return null
  return subtype
}

/** Joins entity rows with the records that point at them. Pure, for tests. */
export function buildTopics(
  rows: TopicRow[],
  statements: { subject_pcid: number; object_pcid: number }[],
  links: { source_pcid: number; target_pcid: number }[],
  communityPcids: number[],
): Topic[] {
  const pointers = new Map<number, Set<number>>()
  const add = (target: number, source: number) => {
    if (target === source) return
    const set = pointers.get(target) ?? new Set<number>()
    set.add(source)
    pointers.set(target, set)
  }
  for (const s of statements) add(s.object_pcid, s.subject_pcid)
  for (const l of links) add(l.target_pcid, l.source_pcid)
  const community = new Set(communityPcids)

  return rows
    .filter((r): r is TopicRow & { entity_type: TopicKind } => TOPIC_KINDS.some(k => k.key === r.entity_type))
    .map(r => {
      const kind = r.entity_type
      const subtype =
        subValue(r.clinical_concepts, 'concept_type') ??
        subValue(r.measurements, 'measurement_type') ??
        subValue(r.biological_targets, 'target_type') ??
        subValue(r.functional_groups, 'group_type')
      return {
        pcid: r.pcid,
        slug: r.slug,
        name: r.name.trim(),
        kind,
        subtype: cleanSubtype(kind, subtype),
        connections: pointers.get(r.pcid)?.size ?? 0,
        community: community.has(r.pcid),
      }
    })
}

export async function loadTopics(signal?: AbortSignal): Promise<Topic[]> {
  const kinds = TOPIC_KINDS.map(k => k.key)
  const ents = supabase
    .from('entities')
    .select(
      'pcid,slug,name,entity_type,clinical_concepts(concept_type),measurements(measurement_type),' +
        'biological_targets(target_type),functional_groups(group_type)',
    )
    .in('entity_type', kinds)
    .order('name')
    .limit(5000)
  const { data, error } = await (signal ? ents.abortSignal(signal) : ents)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as TopicRow[]
  const pcids = rows.map(r => r.pcid)
  if (pcids.length === 0) return []

  // Connections and contributor pages are extras: if they fail, the list still shows.
  const [st, ln, cp] = await Promise.all([
    supabase.from('clinical_statements').select('subject_pcid,object_pcid').in('object_pcid', pcids).limit(20000),
    supabase.from('page_links').select('source_pcid,target_pcid').in('target_pcid', pcids).limit(20000),
    supabase.from('community_pages').select('pcid').in('pcid', pcids),
  ])
  return buildTopics(
    rows,
    st.error ? [] : ((st.data ?? []) as { subject_pcid: number; object_pcid: number }[]),
    ln.error ? [] : ((ln.data ?? []) as { source_pcid: number; target_pcid: number }[]),
    cp.error ? [] : ((cp.data ?? []) as { pcid: number }[]).map(r => r.pcid),
  )
}

// ─── Narrowing ────────────────────────────────────────────────────────────────

export type TopicFilter = { kind: TopicKind | null; subtype: string | null; q: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Kind, then subtype, then a text filter over name and subtype. */
export function filterTopics(topics: Topic[], f: TopicFilter): Topic[] {
  const q = norm(f.q)
  return topics.filter(
    t =>
      (!f.kind || t.kind === f.kind) &&
      (!f.subtype || t.subtype === f.subtype) &&
      (!q || norm(t.name).includes(q) || (t.subtype !== null && norm(t.subtype).includes(q))),
  )
}

export function kindCounts(topics: Topic[]): Record<TopicKind, number> {
  const out: Record<TopicKind, number> = { clinical: 0, measurement: 0, target: 0, functional: 0 }
  for (const t of topics) out[t.kind]++
  return out
}

/** Subtypes within a kind, most common first; topics with none count as "Other". */
export function subtypeCounts(topics: Topic[], kind: TopicKind): { subtype: string | null; count: number }[] {
  const m = new Map<string | null, number>()
  for (const t of topics) if (t.kind === kind) m.set(t.subtype, (m.get(t.subtype) ?? 0) + 1)
  return [...m]
    .map(([subtype, count]) => ({ subtype, count }))
    .sort((a, b) => (a.subtype === null ? 1 : b.subtype === null ? -1 : b.count - a.count || a.subtype.localeCompare(b.subtype)))
}

export type TopicSort = 'az' | 'connected'

export function sortTopics(topics: Topic[], sort: TopicSort): Topic[] {
  const byName = (a: Topic, b: Topic) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  return [...topics].sort(sort === 'connected' ? (a, b) => b.connections - a.connections || byName(a, b) : byName)
}

/** A–Z runs for the list, using Browse's buckets (A…Z, 0–9, Greek, symbols). */
export function groupByLetter(topics: Topic[]): { bucket: Bucket; items: Topic[] }[] {
  const m = new Map<Bucket, Topic[]>()
  for (const t of sortTopics(topics, 'az')) {
    const b = bucketOf(t.name)
    const list = m.get(b)
    if (list) list.push(t)
    else m.set(b, [t])
  }
  return BUCKETS.filter(b => m.has(b.key)).map(b => ({ bucket: b.key, items: m.get(b.key)! }))
}

export function kindLabelOf(kind: TopicKind): string {
  return TOPIC_KINDS.find(k => k.key === kind)?.label ?? kind
}

/** Singular kind for one topic's detail line ("Clinical concept · Indication"). */
export function kindOneOf(kind: TopicKind): string {
  return TOPIC_KINDS.find(k => k.key === kind)?.one ?? kind
}
