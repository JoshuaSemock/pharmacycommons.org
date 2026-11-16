#!/usr/bin/env node
// Every published Learn item in one file for the static edition's review queue
// (getItemsByIds in src/learn/api.ts reads /data/learn-items.json when VITE_STATIC=1).
// Columns are read from ITEM_COLS in src/learn/api.ts so the two cannot drift.
// Usage: node scripts/static/learn-items.mjs --out ../static-out   (writes <out>/site/data/learn-items.json)
// Destination: scripts/static/learn-items.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
)
if (!args.out) { console.error('Need --out <dir>.'); process.exit(2) }
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'learn', 'api.ts'), 'utf8')
const cols = src.match(/const ITEM_COLS =\s*'([^']+)'/)?.[1]
if (!cols) throw new Error('ITEM_COLS not found in src/learn/api.ts')
const STACK = 'http://127.0.0.1:54321'
const KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' // CLI local default; RLS limits anon to published official items
const rows = []
for (let from = 0; ; from += 1000) {
  const r = await fetch(`${STACK}/rest/v1/learn_items?select=${cols}&order=id`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}`, range: `${from}-${from + 999}` } })
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  const page = await r.json()
  rows.push(...page)
  if (page.length < 1000) break
}
const file = join(args.out, 'site', 'data', 'learn-items.json')
mkdirSync(dirname(file), { recursive: true })
writeFileSync(file, JSON.stringify(rows))
console.log(`${rows.length} published Learn items → ${file}`)
