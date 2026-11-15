#!/usr/bin/env node
// Rows scripts/postbuild.mjs needs for list (and, with PRERENDER_ALL, class and drug) route
// pages, read from the local stack so the static build never calls the live project.
// Usage: node scripts/static/export-route-meta.mjs <out file>   (then PC_ROUTE_META=<file>)
// Destination: scripts/static/export-route-meta.mjs
import { writeFileSync } from 'node:fs'

const STACK = 'http://127.0.0.1:54321'
const KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' // CLI local default (.env.localdb)
// Keep in step with the rest('...') calls in scripts/postbuild.mjs.
const QUERIES = [
  'lists?select=slug,title,description,updated_at&order=slug',
  'rpc/list_classes?select=slug,name,class_type_label,member_count',
  'catalog_entries?select=slug,name,primary_brand&entity_type=eq.moiety&order=pcid',
]
const out = process.argv[2]
if (!out) { console.error('Usage: export-route-meta.mjs <out file>'); process.exit(2) }
const meta = {}
for (const q of QUERIES) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${STACK}/rest/v1/${q}`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}`, range: `${from}-${from + 999}` } })
    if (!r.ok) throw new Error(`${r.status} for ${q}`)
    const page = await r.json()
    rows.push(...page)
    if (page.length < 1000) break
  }
  meta[q] = rows
  console.log(`${rows.length}\t${q}`)
}
writeFileSync(out, JSON.stringify(meta))
