#!/usr/bin/env node
// Compares src/staticSearch.ts (the static edition's search) with the database's own
// search_all() on a query set: real names and brands, each with one random typo, plus
// short prefixes. Prints agreement and the first disagreements.
//
// Usage: node --experimental-strip-types scripts/static/check-search.mjs \
//          --index ../static-out/site/data/search-index.json [--db <postgres url>] [--n 300] [--seed 1]
// Destination: scripts/static/check-search.mjs

import { readFileSync } from 'node:fs'
import pg from 'pg'
import { buildIndex, searchAllLocal } from '../../src/staticSearch.ts'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
)
const DB = args.db ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const N = Number(args.n ?? 300)
let seed = Number(args.seed ?? 1)
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const pick = a => a[Math.floor(rand() * a.length)]

const file = JSON.parse(readFileSync(args.index, 'utf8'))
const index = buildIndex(file)
const letters = 'abcdefghijklmnopqrstuvwxyz'
function typo(w) {
  const i = 1 + Math.floor(rand() * Math.max(1, w.length - 2))
  switch (Math.floor(rand() * 4)) {
    case 0: return w.slice(0, i) + w.slice(i + 1) // delete
    case 1: return w.slice(0, i) + pick([...letters]) + w.slice(i) // insert
    case 2: return w.slice(0, i) + pick([...letters]) + w.slice(i + 1) // substitute
    default: return w.slice(0, i - 1) + w[i] + w[i - 1] + w.slice(i + 1) // swap
  }
}
const terms = index.rows.filter(r => r.key.length >= 5).map(r => r.term.toLowerCase())
const queries = []
for (let k = 0; k < N; k++) {
  const t = pick(terms)
  queries.push(k % 5 === 4 ? t.slice(0, 4 + Math.floor(rand() * 3)) : typo(t))
}

const client = new pg.Client({ connectionString: DB })
await client.connect()
let same = 0, sameTop = 0, sameSet = 0
const diffs = []
let msLocal = 0
for (const q of queries) {
  const { rows } = await client.query('select search_all($1, 6) as r', [q])
  const want = rows[0].r
  const t0 = performance.now()
  const got = searchAllLocal(index, q, 6)
  msLocal += performance.now() - t0
  const w = want.results.map(r => r.pcid), g = got.results.map(r => r.pcid)
  const exact = JSON.stringify(w) === JSON.stringify(g) && want.fuzzy === got.fuzzy && want.did_you_mean === got.did_you_mean
  if (exact) same++
  if (w[0] === g[0]) sameTop++
  if (w.length === g.length && w.every(p => g.includes(p))) sameSet++
  if (!exact && diffs.length < 12) diffs.push({ q, want: [want.fuzzy, want.did_you_mean, w], got: [got.fuzzy, got.did_you_mean, g] })
}
await client.end()
const pct = n => `${n}/${queries.length} (${((100 * n) / queries.length).toFixed(1)}%)`
console.log(`identical: ${pct(same)}  same top hit: ${pct(sameTop)}  same set: ${pct(sameSet)}`)
console.log(`local search: ${(msLocal / queries.length).toFixed(1)} ms per query`)
for (const d of diffs) console.log(JSON.stringify(d))
