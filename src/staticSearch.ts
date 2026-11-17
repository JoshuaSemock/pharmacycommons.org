/**
 * Typo-tolerant site search for the static edition: an in-browser copy of the
 * `search_all` RPC (db/phase28_site_search.sql), so "metfromin" offers metformin
 * on pharmacycommons.org with no database behind it.
 *
 * Data: /data/search-index.json, written from the `search_index` view by
 * scripts/static/export-sqlite.mjs (about 0.6 MB gzipped, fetched only when the
 * header search finds nothing locally).
 *
 * Same rules as the SQL, step for step:
 *  - t1, plain matches: exact, prefix, word-prefix, all-words and substring hits on
 *    each row's normalised key, scored 100 (slug) / 95 / 92 / 90 / 80 / 75 / 60 / 50 / 40 / 35.
 *  - t2, typo guesses, only when t1's best score is under 40: rows whose key is
 *    trigram-similar to the query (pg_trgm `%`, similarity >= 0.3, or `<%`,
 *    word_similarity >= 0.6), best 60 by similarity, then the optimal string
 *    alignment distance decides the score (30 / 26 / 22).
 *  - one row per PCID, ranked by score, distance, entity type, core moiety, name length.
 *
 * pg_trgm's word_similarity() uses a greedy scan; here every extent is tried, so on
 * rare ties a borderline row can differ. scripts/static/check-search.mjs compares this
 * module with the database's own search_all() on a query set.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Destination: src/staticSearch.ts
 */

/** search-index.json: one group per PCID, each with its (src, term) rows. */
export interface SearchIndexFile {
  v: 1
  /** entity_type values, indexed by `t` below */
  types: string[]
  /** [pcid, typeIndex, slug, name, coreMoiety (1/0), rows: [srcIndex, term][]] */
  groups: [number, number, string, string, number, [number, string][]][]
  /** src values, indexed by the rows' first element: name, brand, alias, code */
  srcs: string[]
}

interface Row {
  pcid: number
  type: string
  slug: string
  name: string
  core: boolean
  src: string
  term: string
  key: string
  grams: string[] // unique trigrams of key, sorted
  order: string[] // trigrams of key in order (for word_similarity extents)
}

export interface SearchIndex {
  rows: Row[]
  /** trigram → row numbers, to find typo candidates without scanning every row */
  byGram: Map<string, number[]>
}

export interface SearchAllHit {
  pcid: string
  name: string
  slug: string
  entity_type: string
  match: { on: string; text?: string; score: number }
}

export interface SearchAllResult {
  query: string
  fuzzy: boolean
  did_you_mean: string | null
  results: SearchAllHit[]
}

const TYPE_ORDER = ['moiety', 'combination', 'class', 'clinical', 'measurement', 'target', 'functional', 'list']
const SIM_LIMIT = 0.3 // pg_trgm.similarity_threshold default
const WORD_SIM_LIMIT = 0.6 // pg_trgm.word_similarity_threshold default

/** public.search_norm: lower case, runs of anything but a–z/0–9 become one space, trimmed. */
export function searchNorm(t: string | null | undefined): string {
  return (t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** pg_trgm trigrams in order: each alphanumeric word padded "  word ", lower case. */
export function trigramList(s: string): string[] {
  const out: string[] = []
  for (const w of s.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!w) continue
    const p = `  ${w} `
    for (let i = 0; i + 3 <= p.length; i++) out.push(p.slice(i, i + 3))
  }
  return out
}

export function trigramSet(s: string): string[] {
  return [...new Set(trigramList(s))].sort()
}

function commonCount(a: string[], b: string[]): number {
  // both sorted and unique
  let i = 0
  let j = 0
  let n = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      n++
      i++
      j++
    } else if (a[i] < b[j]) i++
    else j++
  }
  return n
}

/** pg_trgm similarity(a, b) on precomputed sorted trigram sets. */
export function similarityOf(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  const c = commonCount(a, b)
  return c / (a.length + b.length - c)
}

export function similarity(a: string, b: string): number {
  return similarityOf(trigramSet(a), trigramSet(b))
}

/**
 * pg_trgm word_similarity(q, text): the best similarity between q's trigram set and
 * any continuous extent of text's ordered trigrams.
 */
export function wordSimilarityOf(qSet: string[], textOrder: string[]): number {
  if (!qSet.length || !textOrder.length) return 0
  const inQ = new Set(qSet)
  let best = 0
  for (let i = 0; i < textOrder.length; i++) {
    if (!inQ.has(textOrder[i])) continue // a best extent starts on a shared trigram
    const seen = new Set<string>()
    let common = 0
    for (let j = i; j < textOrder.length; j++) {
      const g = textOrder[j]
      if (!seen.has(g)) {
        seen.add(g)
        if (inQ.has(g)) common++
      }
      if (inQ.has(g)) {
        const s = common / (qSet.length + seen.size - common)
        if (s > best) best = s
      }
    }
  }
  return best
}

export function wordSimilarity(q: string, text: string): number {
  return wordSimilarityOf(trigramSet(q), trigramList(text))
}

/** public.osa_distance: optimal string alignment (Damerau–Levenshtein without repeated edits). */
export function osaDistance(a: string, b: string): number {
  const la = a.length
  const lb = b.length
  if (la === 0) return lb
  if (lb === 0) return la
  const w = lb + 1
  const d = new Array<number>((la + 1) * w)
  for (let i = 0; i <= la; i++) d[i * w] = i
  for (let j = 0; j <= lb; j++) d[j] = j
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(d[(i - 1) * w + j] + 1, d[i * w + j - 1] + 1, d[(i - 1) * w + j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[(i - 2) * w + j - 2] + 1)
      d[i * w + j] = v
    }
  }
  return d[la * w + lb]
}

export function buildIndex(file: SearchIndexFile): SearchIndex {
  const rows: Row[] = []
  const byGram = new Map<string, number[]>()
  for (const [pcid, t, slug, name, core, list] of file.groups) {
    for (const [s, term] of list) {
      const key = searchNorm(term)
      const order = trigramList(key)
      const grams = [...new Set(order)].sort()
      const n = rows.length
      rows.push({ pcid, type: file.types[t], slug, name, core: core === 1, src: file.srcs[s], term, key, grams, order })
      for (const g of grams) {
        const at = byGram.get(g)
        if (at) at.push(n)
        else byGram.set(g, [n])
      }
    }
  }
  return { rows, byGram }
}

interface Hit {
  row: Row
  score: number
  dist: number | null
}

function typeRank(t: string): number {
  const i = TYPE_ORDER.indexOf(t)
  return i < 0 ? TYPE_ORDER.length : i // array_position() is null for others: sorts last
}

function compareHits(a: Hit, b: Hit): number {
  return (
    b.score - a.score ||
    (a.dist ?? Infinity) - (b.dist ?? Infinity) ||
    typeRank(a.row.type) - typeRank(b.row.type) ||
    Number(!a.row.core) - Number(!b.row.core) ||
    a.row.name.length - b.row.name.length ||
    a.row.name.localeCompare(b.row.name, 'en')
  )
}

function plainScore(r: Row, qn: string, words: string[]): number {
  const k = r.key
  if (r.src === 'name' && k === qn) return 95
  if ((r.src === 'alias' || r.src === 'code') && (k === qn || k === qn.replace(/s$/, ''))) return 92
  if (r.src === 'brand' && k === qn) return 90
  if (r.src === 'name' && k.startsWith(qn)) return 80
  if ((r.src === 'brand' || r.src === 'alias' || r.src === 'code') && k.startsWith(qn)) return 75
  if (r.src === 'name' && k.includes(' ' + qn)) return 60
  if (r.src === 'name' && words.length > 1 && words.every(w => k.includes(w))) return 50
  if (r.src === 'name' && k.includes(qn)) return 40
  if (r.src !== 'name') return 35
  return 0
}

/** Keep the best hit per PCID (SQL: distinct on (pcid) ... order by score desc nulls last, dist). */
function bestPerPcid(hits: Hit[]): Hit[] {
  const best = new Map<number, Hit>()
  for (const h of hits) {
    const b = best.get(h.row.pcid)
    if (!b || h.score > b.score || (h.score === b.score && (h.dist ?? Infinity) < (b.dist ?? Infinity))) best.set(h.row.pcid, h)
  }
  return [...best.values()]
}

/** search_all(p_q, p_limit, p_types) on the loaded index. */
export function searchAllLocal(index: SearchIndex, query: string, limit = 20, types: string[] | null = null): SearchAllResult {
  const qn = searchNorm(query)
  const raw = (query ?? '').trim().toLowerCase()
  const lim = Math.min(Math.max(Math.trunc(limit) || 20, 1), 50)
  const words = qn.split(' ').filter(w => w.length >= 2)
  const longest = qn.split(' ').reduce((a, w) => (w.length > a.length ? w : a), '')
  const typeOk = (r: Row) => !types || types.includes(r.type)

  // t1: plain matches
  const t1Raw: Hit[] = []
  if (qn.length >= 2) {
    for (const r of index.rows) {
      if (!typeOk(r)) continue
      const k = r.key
      if (!(k.includes(qn) || (words.length > 1 && k.includes(longest)))) continue
      const s = plainScore(r, qn, words)
      if (s > 0) t1Raw.push({ row: r, score: r.slug === raw ? 100 : s, dist: null })
    }
  }
  const t1 = bestPerPcid(t1Raw)
  const best = t1.reduce((m, h) => Math.max(m, h.score), 0)

  // t2: typo guesses
  let t2: Hit[] = []
  if (qn.length >= 4 && best < 40) {
    const qSet = trigramSet(qn)
    const seen = new Set<number>()
    const cands: { row: Row; sim: number }[] = []
    for (const g of qSet) {
      for (const n of index.byGram.get(g) ?? []) {
        if (seen.has(n)) continue
        seen.add(n)
        const r = index.rows[n]
        if (!typeOk(r)) continue
        const sim = similarityOf(r.grams, qSet)
        const wsim = wordSimilarityOf(qSet, r.order)
        if (sim >= SIM_LIMIT || wsim >= WORD_SIM_LIMIT) cands.push({ row: r, sim: Math.max(sim, wsim) })
      }
    }
    cands.sort((a, b) => b.sim - a.sim)
    const scored: Hit[] = []
    for (const { row } of cands.slice(0, 60)) {
      const dist = Math.min(osaDistance(row.key, qn), ...row.key.split(' ').map(w => osaDistance(w, qn)))
      if (dist > 3) continue
      let score: number | null = null
      if (dist <= 1) score = 30
      else if (dist === 2 && qn.length >= 6) score = 26
      else if (dist === 3 && qn.length >= 9) score = 22
      scored.push({ row, score: score ?? Number.NEGATIVE_INFINITY, dist })
    }
    t2 = bestPerPcid(scored).filter(h => h.score !== Number.NEGATIVE_INFINITY)
  }

  const fuzzy = t2.length > 0 && best < 40
  // SQL pool: typo guesses replace the plain matches whenever there are any (t2 only runs when best < 40).
  const pool = fuzzy ? t2 : t1
  const ranked = pool.filter(h => h.score >= 15).sort(compareHits).slice(0, lim)

  return {
    query: (query ?? '').trim(),
    fuzzy: fuzzy && ranked.length > 0,
    did_you_mean: fuzzy ? (ranked[0]?.row.name ?? null) : null,
    results: ranked.map(h => {
      const match: SearchAllHit['match'] = { on: fuzzy ? 'fuzzy' : h.row.src, score: h.score }
      if (h.row.src === 'brand' || h.row.src === 'alias' || h.row.src === 'code') match.text = h.row.term
      return { pcid: `PCID-${h.row.pcid}`, name: h.row.name, slug: h.row.slug, entity_type: h.row.type, match }
    }),
  }
}

let loaded: Promise<SearchIndex> | null = null

/** Fetches and indexes /data/search-index.json once. */
export function loadSearchIndex(realFetch: typeof fetch, url = '/data/search-index.json'): Promise<SearchIndex> {
  loaded ??= realFetch(url)
    .then(r => {
      if (!r.ok) throw new Error(`search index: HTTP ${r.status}`)
      return r.json() as Promise<SearchIndexFile>
    })
    .then(buildIndex)
    .catch(err => {
      loaded = null
      throw err
    })
  return loaded
}
