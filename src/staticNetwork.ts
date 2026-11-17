/**
 * Network pages for the static edition: in-browser copies of the read-only RPCs
 * network_neighborhood / _relations / _compare / _hierarchy / _edge_evidence
 * (db/phase19_network.sql, phase32a, phase32b, phase33), answered from an SQLite
 * copy of the tables they read (/data/db/network.sqlite.gz, written by
 * scripts/static/export-sqlite.mjs and opened with sql.js).
 *
 * SQLite does the lookups (indexes on members, classes, statement subjects and
 * objects, list items); the grouping, ranking and paging follow the SQL functions
 * line for line in TypeScript, so each answer has the same shape and order as the
 * database's. Community statements are not in the static data (accounts are off),
 * so include_community has no effect here.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Destination: src/staticNetwork.ts
 */

export type SqlValue = number | string | null
export type SqlRow = Record<string, SqlValue>

/** The one thing these functions need from a database: run a query, get rows. */
export interface Db {
  all(sql: string, params?: SqlValue[]): SqlRow[]
}

/** public.network_predicate_group */
export const PREDICATE_GROUP: Record<string, string> = {
  member_of: 'classification', has_member: 'classification', subclass_of: 'classification',
  has_component: 'composition', has_formulation: 'composition',
  treats: 'use', prevents: 'use', has_prevention: 'use', has_diagnosis: 'use', has_symptom: 'use',
  has_side_effect: 'safety', has_warning: 'safety', has_contraindication: 'safety', contraindicated_with: 'safety',
  causes: 'safety', has_risk_factor: 'safety', has_lower_risk_than: 'safety', is_hazardous: 'safety',
  interacts_with: 'interaction', inhibits: 'interaction', induces: 'interaction', substrate_of: 'interaction',
  is_substrate_of: 'interaction', has_pgx_association: 'interaction', has_pgx_gene: 'interaction',
  has_lab_effect: 'interaction', monitored_by: 'interaction', has_monitoring: 'interaction',
  on_list: 'lists', derived_from: 'lineage',
}

const GROUP_RANK: Record<string, number> = { classification: 1, composition: 2, use: 3, safety: 4, interaction: 5, lists: 6 }
const groupRank = (g: string) => GROUP_RANK[g] ?? 7

export interface Edge {
  id: string
  subject: number
  predicate: string
  object: number
  grp: string
  evidence_level: string | null
  source_agency: string | null
  source_doc_id: string | null
  direct: boolean
  community: boolean
  basis: string | null
}

export interface NodeRow {
  pcid: number
  slug: string | null
  name: string | null
  entity_type: string | null
  class_type: string | null
  term_type: string | null
}

const num = (v: SqlValue): number => (typeof v === 'number' ? v : Number(v))
const str = (v: SqlValue): string | null => (v === null || v === undefined ? null : String(v))
const clamp = (v: number | null | undefined, def: number, lo: number, hi: number) =>
  Math.min(Math.max(v ?? def, lo), hi)

/** Text order close to the database's for names (lower(name) / name). */
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const lowerName = (n: NodeRow | undefined) => (n?.name ?? '').toLowerCase()

/** Element-wise comparison of sorted number arrays, as Postgres compares bigint[]. */
export function compareArrays(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]
  return a.length - b.length
}

/** Statement predicates the network shows, as an SQL list (network_predicate_group(p) is not null). */
const PREDICATE_LIST = Object.keys(PREDICATE_GROUP).map(p => `'${p}'`).join(',')

/** public.network_edges(p_pcid, false): every edge touching one concept, one row per id. */
export function networkEdges(db: Db, pcid: number): Edge[] {
  const rows = db.all(
    `select 'cm:' || class_pcid || ':' || member_pcid as id, member_pcid as subject, 'member_of' as predicate,
            class_pcid as object, null as evidence_level, source_system as source_agency, null as source_doc_id,
            is_direct as direct, match_basis as basis
       from class_members where member_pcid = ?1
     union all
     select 'cm:' || class_pcid || ':' || member_pcid, member_pcid, 'member_of', class_pcid, null, source_system, null,
            is_direct, match_basis
       from class_members where class_pcid = ?1
     union all
     select 'sc:' || pcid || ':' || parent_pcid, pcid, 'subclass_of', parent_pcid, null, source_system, null, 1, 'class hierarchy'
       from drug_classes where pcid = ?1 and parent_pcid is not null
     union all
     select 'sc:' || pcid || ':' || parent_pcid, pcid, 'subclass_of', parent_pcid, null, source_system, null, 1, 'class hierarchy'
       from drug_classes where parent_pcid = ?1
     union all
     select 'cs:' || statement_id, subject_pcid, predicate, object_pcid, evidence_level, source_agency, source_doc_id, 1, null
       from clinical_statements
      where subject_pcid = ?1 and object_pcid is not null and predicate in (${PREDICATE_LIST})
     union all
     select 'cs:' || statement_id, subject_pcid, predicate, object_pcid, evidence_level, source_agency, source_doc_id, 1, null
       from clinical_statements
      where object_pcid = ?1 and subject_pcid <> ?1 and predicate in (${PREDICATE_LIST})
     union all
     select 'li:' || li.list_pcid || ':' || li.member_pcid, li.member_pcid, 'on_list', li.list_pcid, null, null, null, 1,
            l.kind || ' list'
       from list_items li join lists l on l.pcid = li.list_pcid
      where li.member_pcid = ?1 and l.published = 1
     union all
     select 'li:' || li.list_pcid || ':' || li.member_pcid, li.member_pcid, 'on_list', li.list_pcid, null, null, null, 1,
            l.kind || ' list'
       from list_items li join lists l on l.pcid = li.list_pcid
      where li.list_pcid = ?1 and l.published = 1 and li.member_pcid is not null`,
    [pcid],
  )
  const byId = new Map<string, Edge>()
  for (const r of rows) {
    const id = String(r.id)
    if (byId.has(id)) continue // distinct on (id)
    const predicate = String(r.predicate)
    byId.set(id, {
      id,
      subject: num(r.subject),
      predicate,
      object: num(r.object),
      grp: id.startsWith('cm:') || id.startsWith('sc:') ? 'classification' : id.startsWith('li:') ? 'lists' : PREDICATE_GROUP[predicate],
      evidence_level: str(r.evidence_level),
      source_agency: str(r.source_agency),
      source_doc_id: str(r.source_doc_id),
      direct: num(r.direct) === 1,
      community: false,
      basis: str(r.basis),
    })
  }
  return [...byId.values()].sort((a, b) => byText(a.id, b.id))
}

/** entities + drug_classes.class_type + moieties.term_type for a set of PCIDs. */
export function nodeRows(db: Db, pcids: Iterable<number>): Map<number, NodeRow> {
  const ids = [...new Set(pcids)]
  const out = new Map<number, NodeRow>()
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500)
    const rows = db.all(
      `select e.pcid, e.slug, e.name, e.entity_type, dc.class_type, m.term_type
         from entities e left join drug_classes dc on dc.pcid = e.pcid left join moieties m on m.pcid = e.pcid
        where e.pcid in (${chunk.map(() => '?').join(',')})`,
      chunk,
    )
    for (const r of rows) {
      const pcid = num(r.pcid)
      out.set(pcid, {
        pcid,
        slug: str(r.slug),
        name: str(r.name),
        entity_type: str(r.entity_type),
        class_type: str(r.class_type),
        term_type: str(r.term_type),
      })
    }
  }
  return out
}

export function edgeJson(e: Edge) {
  return {
    id: e.id, subject: e.subject, predicate: e.predicate, object: e.object, group: e.grp,
    evidence_level: e.evidence_level, source_agency: e.source_agency, source_doc_id: e.source_doc_id,
    direct: e.direct, community: e.community, basis: e.basis,
  }
}

function groupCounts(edges: Edge[]): Record<string, number> {
  const c: Record<string, number> = {}
  for (const e of edges) c[e.grp] = (c[e.grp] ?? 0) + 1
  return c
}

const otherOf = (e: Edge, pcid: number) => (e.subject === pcid ? e.object : e.subject)

export interface NeighborhoodArgs {
  p_pcid: number
  p_groups?: string[] | null
  p_include_community?: boolean
  p_limit?: number | null
  p_offset?: number | null
}

/** public.network_neighborhood */
export function networkNeighborhood(db: Db, a: NeighborhoodArgs) {
  const p = a.p_pcid
  const limit = clamp(a.p_limit, 40, 1, 200)
  const offset = Math.max(a.p_offset ?? 0, 0)
  const edges = networkEdges(db, p)
  const others = nodeRows(db, edges.map(e => otherOf(e, p)))
  // ranked: the other end must exist; row number within each group
  const ranked = edges
    .filter(e => others.has(otherOf(e, p)) && (!a.p_groups || a.p_groups.includes(e.grp)))
    .sort(
      (x, y) =>
        byText(x.grp, y.grp) ||
        Number(!x.direct) - Number(!y.direct) ||
        byText(lowerName(others.get(otherOf(x, p))), lowerName(others.get(otherOf(y, p)))) ||
        byText(x.id, y.id),
    )
  const inGroup = new Map<string, number>()
  const counter: Record<string, number> = {}
  for (const e of ranked) inGroup.set(e.id, (counter[e.grp] = (counter[e.grp] ?? 0) + 1))
  const picked = [...ranked].sort(
    (x, y) => inGroup.get(x.id)! - inGroup.get(y.id)! || groupRank(x.grp) - groupRank(y.grp) || byText(x.id, y.id),
  )
  const page = picked.slice(offset, offset + limit)
  const nodes = nodeRows(db, [p, ...page.flatMap(e => [e.subject, e.object])])
  return {
    center: nodes.get(p) ?? null,
    nodes: [...nodes.values()].sort((x, y) => byText(x.name ?? '', y.name ?? '') || x.pcid - y.pcid),
    edges: page.map(edgeJson),
    group_counts: groupCounts(edges),
    total: picked.length,
    offset,
    limit,
  }
}

export interface RelationsArgs extends NeighborhoodArgs {
  p_query?: string | null
}

/** public.network_relations */
export function networkRelations(db: Db, a: RelationsArgs) {
  const p = a.p_pcid
  const limit = clamp(a.p_limit, 50, 1, 200)
  const offset = Math.max(a.p_offset ?? 0, 0)
  const q = (a.p_query ?? '').trim().toLowerCase() || null
  const edges = networkEdges(db, p)
  const others = nodeRows(db, edges.map(e => otherOf(e, p)))
  const rows = edges
    .filter(e => {
      const o = others.get(otherOf(e, p))
      if (!o) return false
      if (a.p_groups && !a.p_groups.includes(e.grp)) return false
      return !q || (o.name ?? '').toLowerCase().includes(q)
    })
    .sort((x, y) => byText(lowerName(others.get(otherOf(x, p))), lowerName(others.get(otherOf(y, p)))) || byText(x.id, y.id))
  return {
    rows: rows.slice(offset, offset + limit).map(e => {
      const o = others.get(otherOf(e, p))!
      return {
        edge: edgeJson(e),
        node: { pcid: o.pcid, slug: o.slug, name: o.name, entity_type: o.entity_type, class_type: o.class_type, term_type: o.term_type },
        outgoing: e.subject === p,
      }
    }),
    group_counts: groupCounts(edges),
    total: rows.length,
    offset,
    limit,
  }
}

export interface CompareArgs {
  p_pcids: number[]
  p_include_community?: boolean
  p_members?: number[] | null
  p_limit?: number | null
  p_offset?: number | null
}

/** public.network_compare */
export function networkCompare(db: Db, a: CompareArgs) {
  const ids = [...new Set((a.p_pcids ?? []).filter(p => p !== null && p !== undefined))].sort((x, y) => x - y)
  if (ids.length < 2 || ids.length > 4) return null
  const limit = clamp(a.p_limit, 30, 1, 200)
  const offset = Math.max(a.p_offset ?? 0, 0)
  const wanted = a.p_members ? [...new Set(a.p_members)].sort((x, y) => x - y) : null
  const idSet = new Set(ids)

  type Raw = Edge & { src: number; other: number; outgoing: boolean }
  const raw: Raw[] = []
  for (const s of ids) for (const e of networkEdges(db, s)) raw.push({ ...e, src: s, other: otherOf(e, s), outgoing: e.subject === s })

  const between = new Map<string, Edge>()
  for (const r of raw) if (idSet.has(r.other) && !between.has(r.id)) between.set(r.id, r)
  const others = raw.filter(r => !idSet.has(r.other))

  // grouped: one row per other concept
  const byOther = new Map<number, Raw[]>()
  for (const o of others) {
    const list = byOther.get(o.other)
    if (list) list.push(o)
    else byOther.set(o.other, [o])
  }
  interface Grouped { other: number; members: number[]; grp: string }
  const grouped: Grouped[] = []
  for (const [other, list] of byOther) {
    const members = [...new Set(list.map(o => o.src))].sort((x, y) => x - y)
    const grp = [...list].sort((x, y) => groupRank(x.grp) - groupRank(y.grp))[0].grp
    grouped.push({ other, members, grp })
  }
  const keyOf = (m: number[]) => m.join(',')
  const sets = new Map<string, { members: number[]; n: number; groups: Record<string, number> }>()
  for (const g of grouped) {
    const k = keyOf(g.members)
    const s = sets.get(k) ?? { members: g.members, n: 0, groups: {} }
    s.n++
    s.groups[g.grp] = (s.groups[g.grp] ?? 0) + 1
    sets.set(k, s)
  }

  const names = nodeRows(db, grouped.map(g => g.other))
  const ranked: (Grouped & { rn: number })[] = []
  const bySet = new Map<string, Grouped[]>()
  for (const g of grouped) {
    if (!names.has(g.other)) continue // join entities
    const k = keyOf(g.members)
    const list = bySet.get(k)
    if (list) list.push(g)
    else bySet.set(k, [g])
  }
  for (const list of bySet.values()) {
    list.sort(
      (x, y) =>
        groupRank(x.grp) - groupRank(y.grp) || byText(lowerName(names.get(x.other)), lowerName(names.get(y.other))) || x.other - y.other,
    )
    list.forEach((g, i) => ranked.push({ ...g, rn: i + 1 }))
  }
  const page = ranked.filter(r =>
    wanted === null ? r.rn <= limit : keyOf(r.members) === keyOf(wanted) && r.rn > offset && r.rn <= offset + limit,
  )
  page.sort((x, y) => y.members.length - x.members.length || compareArrays(x.members, y.members) || x.rn - y.rn)

  const nodes = nodeRows(db, [...ids, ...page.map(r => r.other)])
  return {
    pcids: ids,
    entities: ids.map(p => nodes.get(p)).filter((n): n is NodeRow => !!n),
    between: [...between.values()].sort((x, y) => byText(x.id, y.id)).map(edgeJson),
    sets: [...sets.values()]
      .sort((x, y) => y.members.length - x.members.length || compareArrays(x.members, y.members))
      .map(s => ({ members: s.members, count: s.n, groups: s.groups })),
    rows: page.map(r => ({
      members: r.members,
      group: r.grp,
      rn: r.rn,
      node: nodes.get(r.other) ?? null,
      links: (byOther.get(r.other) ?? [])
        .slice()
        .sort((x, y) => x.src - y.src || byText(x.id, y.id))
        .map(o => ({ src: o.src, outgoing: o.outgoing, edge: edgeJson(o) })),
    })),
    offset,
    limit,
  }
}

/** public.network_hierarchy */
export function networkHierarchy(db: Db, a: { p_pcids: number[] }) {
  const ids = [...new Set((a.p_pcids ?? []).filter(p => p !== null && p !== undefined))].sort((x, y) => x - y)
  if (ids.length < 1 || ids.length > 4) return null
  const marks = ids.map(() => '?').join(',')
  const anchors = db
    .all(
      `select member_pcid as concept, class_pcid as cls from class_members where member_pcid in (${marks}) and is_direct = 1
       union
       select pcid, pcid from drug_classes where pcid in (${marks})`,
      [...ids, ...ids],
    )
    .map(r => ({ concept: num(r.concept), cls: num(r.cls) }))
  const chain = db.all(
    `with recursive anchors(concept, cls) as (
       select member_pcid, class_pcid from class_members where member_pcid in (${marks}) and is_direct = 1
       union
       select pcid, pcid from drug_classes where pcid in (${marks})
     ),
     chain(concept, cls) as (
       select concept, cls from anchors
       union
       select ch.concept, dc.parent_pcid from chain ch join drug_classes dc on dc.pcid = ch.cls where dc.parent_pcid is not null
     )
     select ch.concept, ch.cls, e.slug, e.name, coalesce(dc.class_type, 'other') as class_type, dc.parent_pcid
       from chain ch join drug_classes dc on dc.pcid = ch.cls join entities e on e.pcid = dc.pcid`,
    [...ids, ...ids],
  )
  interface HNode { pcid: number; slug: string | null; name: string | null; class_type: string; parent: number | null; members: number[] }
  const held = new Map<number, HNode>()
  for (const r of chain) {
    const cls = num(r.cls)
    const n = held.get(cls) ?? {
      pcid: cls, slug: str(r.slug), name: str(r.name), class_type: String(r.class_type),
      parent: r.parent_pcid === null ? null : num(r.parent_pcid), members: [],
    }
    const c = num(r.concept)
    if (!n.members.includes(c)) n.members.push(c)
    held.set(cls, n)
  }
  const nodes = [...held.values()]
  for (const n of nodes) n.members.sort((x, y) => x - y)
  const ents = nodeRows(db, ids)
  return {
    pcids: ids,
    entities: ids.map(p => ents.get(p)).filter((n): n is NodeRow => !!n),
    anchors: anchors.sort((x, y) => x.concept - y.concept || x.cls - y.cls).map(x => ({ concept: x.concept, class: x.cls })),
    nodes: nodes
      .map(n => ({
        ...n,
        meeting:
          n.members.length >= 2 &&
          !nodes.some(c => c.parent === n.pcid && compareArrays(c.members, n.members) === 0),
      }))
      .sort((x, y) => byText(x.class_type, y.class_type) || byText(x.name ?? '', y.name ?? '') || x.pcid - y.pcid)
      .map(n => ({ pcid: n.pcid, slug: n.slug, name: n.name, class_type: n.class_type, parent: n.parent, members: n.members, meeting: n.meeting })),
  }
}

const stripNulls = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined))

/** public.network_edge_evidence */
export function networkEdgeEvidence(db: Db, a: { p_edge_id: string }): Record<string, unknown> | null {
  const [kind = '', x = '', y = ''] = (a.p_edge_id ?? '').split(':')
  if (!/^[0-9]{1,18}$/.test(x) || (['cm', 'sc', 'li'].includes(kind) && !/^[0-9]{1,18}$/.test(y))) return null
  const one = (sql: string, params: SqlValue[]) => db.all(sql, params)[0] ?? null
  if (kind === 'cs') {
    const s = one(`select * from clinical_statements where statement_id = ?`, [Number(x)])
    if (!s) return null
    const doc = str(s.source_doc_id) ?? ''
    const appl = doc.startsWith('Drugs@FDA appl ') ? doc.slice('Drugs@FDA appl '.length) : null
    const fa = appl ? one(`select * from fda_applications where appl_no = ?`, [appl]) : null
    const key = appl ? 'drugsfda' : s.source_agency === 'FDA' ? 'fda' : s.source_agency === 'Pharmacy Commons' ? 'pharmacycommons' : null
    const ds = key ? one(`select * from data_sources where source_key = ?`, [key]) : null
    const bare = fa ? String(fa.appl_no).replace(/^[A-Za-z]+/, '') : null
    return {
      kind: 'clinical_statement', statement_id: num(s.statement_id), predicate: s.predicate,
      evidence_level: s.evidence_level, source_agency: s.source_agency, source_doc_id: s.source_doc_id,
      source_section: s.source_section, source_quote: s.source_quote, risk_profile: s.risk_profile,
      qualifier_key: s.qualifier_key, qualifier_value: s.qualifier_value, object_label: s.object_label,
      updated_at: s.updated_at,
      source: stripNulls({
        name: ds?.name ?? null, url: ds?.url ?? null, license: ds?.license ?? null,
        record_label: fa ? `${fa.application_type} ${bare}` : null,
        record_sponsor: fa?.sponsor_name ?? null,
        record_url: fa ? `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${bare}` : null,
      }),
    }
  }
  if (kind === 'cm') {
    const r = one(
      `select cm.is_direct, cm.source_system, cm.match_basis, dc.class_type, dc.source_system as class_system, dc.source_code
         from class_members cm join drug_classes dc on dc.pcid = cm.class_pcid where cm.class_pcid = ? and cm.member_pcid = ?`,
      [Number(x), Number(y)],
    )
    return r && {
      kind: 'class_membership', direct: num(r.is_direct) === 1, membership_source: r.source_system, match_basis: r.match_basis,
      class_type: r.class_type, class_system: r.class_system, class_code: r.source_code,
    }
  }
  if (kind === 'li') {
    const r = one(
      `select l.title, l.kind, l.jurisdiction, l.source_citation, l.source_url, l.license, li.rank, l.rank_label, li.value,
              l.measure_label, l.measure_unit, li.legal_status, l.status_label, li.note, li.sources
         from list_items li join lists l on l.pcid = li.list_pcid
        where li.list_pcid = ? and li.member_pcid = ? and l.published = 1 order by li.position limit 1`,
      [Number(x), Number(y)],
    )
    if (!r) return null
    const value = r.value === null ? null : Number(r.value)
    return {
      kind: 'list_membership', list_title: r.title, list_kind: r.kind, jurisdiction: r.jurisdiction,
      source_citation: r.source_citation, source_url: r.source_url, license: r.license, rank: r.rank,
      rank_label: r.rank_label, value: value !== null && Number.isFinite(value) ? value : r.value,
      measure_label: r.measure_label, measure_unit: r.measure_unit, status: r.legal_status,
      status_label: r.status_label, note: r.note, sources: r.sources === null ? null : JSON.parse(String(r.sources)),
    }
  }
  if (kind === 'sc') {
    const r = one(`select class_type, source_system, source_code, level from drug_classes where pcid = ? and parent_pcid = ?`, [Number(x), Number(y)])
    return r && { kind: 'class_hierarchy', class_type: r.class_type, class_system: r.source_system, class_code: r.source_code, level: r.level }
  }
  return null // 'co' (community statements) are not in the static data
}
