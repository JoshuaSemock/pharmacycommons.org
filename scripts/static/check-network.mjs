#!/usr/bin/env node
// Compares src/staticNetwork.ts (Network pages in the static edition, over network.sqlite)
// with the database's own network_* functions, for a sample of concepts: the busiest
// classes, drugs and lists, plus random ones. Prints agreement per function and the first
// differences.
//
// Usage: node --experimental-strip-types scripts/static/check-network.mjs \
//          --sqlite ../static-out/site/data/db/network.sqlite [--db <postgres url>] [--n 150]
// Destination: scripts/static/check-network.mjs

import { DatabaseSync } from 'node:sqlite'
import pg from 'pg'
import {
  networkNeighborhood, networkRelations, networkCompare, networkHierarchy, networkEdgeEvidence,
} from '../../src/staticNetwork.ts'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
)
const DB = args.db ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const N = Number(args.n ?? 150)
pg.types.setTypeParser(20, v => Number(v))

const lite = new DatabaseSync(args.sqlite, { readOnly: true })
const db = { all: (sql, params = []) => lite.prepare(sql).all(...params) }
const client = new pg.Client({ connectionString: DB })
await client.connect()

// Canonical JSON: keys sorted, so key order never counts as a difference.
const canon = v => JSON.stringify(v, (_k, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x)

const { rows: sample } = await client.query(`
  (select class_pcid as p from class_members group by 1 order by count(*) desc limit 10)
  union (select member_pcid from class_members group by 1 order by count(*) desc limit 10)
  union (select subject_pcid from clinical_statements group by 1 order by count(*) desc limit 10)
  union (select pcid from lists where published limit 5)
  union (select pcid from entities where slug in ('metformin','empagliflozin','lisinopril','warfarin','sglt2-inhibitors'))
  union (select pcid from (select pcid from entities order by md5(pcid::text) limit $1) r)`, [N])
const ids = sample.map(r => r.p)

const stats = {}
const diffs = []
// `nodes` is ordered by name; Postgres leaves same-name nodes in any order, so compare those by PCID.
const tie = v => { if (v && Array.isArray(v.nodes)) v.nodes.sort((a, b) => a.pcid - b.pcid); return v }
async function check(name, sql, params, local) {
  const { rows } = await client.query(sql, params)
  const want = canon(tie(rows[0].r))
  const got = canon(tie(local()))
  const s = (stats[name] ??= { same: 0, total: 0 })
  s.total++
  if (want === got) s.same++
  else if (diffs.filter(d => d.name === name).length < 2) {
    let i = 0
    while (i < want.length && want[i] === got[i]) i++
    diffs.push({ name, params, at: i, want: want.slice(Math.max(0, i - 80), i + 120), got: (got ?? '').slice(Math.max(0, i - 80), i + 120) })
  }
}

let t = 0
for (const p of ids) {
  const t0 = performance.now()
  await check('neighborhood', 'select network_neighborhood($1) r', [p], () => networkNeighborhood(db, { p_pcid: p }))
  await check('neighborhood page 2, use+safety', `select network_neighborhood($1, array['classification','safety'], false, 10, 10) r`, [p],
    () => networkNeighborhood(db, { p_pcid: p, p_groups: ['classification', 'safety'], p_limit: 10, p_offset: 10 }))
  await check('relations', 'select network_relations($1) r', [p], () => networkRelations(db, { p_pcid: p }))
  await check('relations query', `select network_relations($1, null, false, 'in', 25, 0) r`, [p],
    () => networkRelations(db, { p_pcid: p, p_query: 'in', p_limit: 25, p_offset: 0 }))
  await check('hierarchy', 'select network_hierarchy(array[$1]::bigint[]) r', [p], () => networkHierarchy(db, { p_pcids: [p] }))
  t += performance.now() - t0
}
for (let i = 0; i + 1 < Math.min(ids.length, 60); i += 2) {
  const pair = [ids[i], ids[i + 1]]
  await check('compare', 'select network_compare($1::bigint[]) r', [pair], () => networkCompare(db, { p_pcids: pair }))
  await check('hierarchy pair', 'select network_hierarchy($1::bigint[]) r', [pair], () => networkHierarchy(db, { p_pcids: pair }))
}
const { rows: edgeIds } = await client.query(`
  (select 'cs:' || statement_id as id from clinical_statements order by md5(statement_id::text) limit 40)
  union all (select 'cm:' || class_pcid || ':' || member_pcid from class_members order by md5(class_pcid::text || member_pcid) limit 40)
  union all (select 'li:' || list_pcid || ':' || member_pcid from list_items where member_pcid is not null order by md5(list_pcid::text || member_pcid) limit 40)
  union all (select 'sc:' || pcid || ':' || parent_pcid from drug_classes where parent_pcid is not null order by md5(pcid::text) limit 40)`)
for (const { id } of edgeIds) await check('edge_evidence', 'select network_edge_evidence($1) r', [id], () => networkEdgeEvidence(db, { p_edge_id: id }))

await client.end()
for (const [k, s] of Object.entries(stats)) console.log(`${k.padEnd(36)} ${s.same}/${s.total}`)
console.log(`${ids.length} concepts`)
for (const d of diffs) console.log(JSON.stringify(d))
