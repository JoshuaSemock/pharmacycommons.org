#!/usr/bin/env node
// Permalink recordings (/id/PCID-n) for the static edition, written straight from the
// local stack instead of opening 32,000 pages in the browser. Each holds the one lookup
// src/pages/Permalink.tsx makes before redirecting:
//   GET /rest/v1/entities?select=slug%2Centity_type&pcid=eq.<n>  →  [{ slug, entity_type }]
// Checked against a browser recording of /id/PCID-1001923 (same key and body).
// If Permalink.tsx changes its query, re-record one permalink with record.mjs and compare.
//
// Usage: node scripts/static/permalinks.mjs --out ../static-out   (writes <out>/raw/, skips existing)
// Destination: scripts/static/permalinks.mjs

import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { requestKey, routeFile } from './key.mjs'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
)
if (!args.out) { console.error('Need --out <dir>.'); process.exit(2) }
const STACK = 'http://127.0.0.1:54321'
const KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' // CLI local default (.env.localdb)
mkdirSync(join(args.out, 'raw'), { recursive: true })

const rows = []
for (let from = 0; ; from += 1000) {
  const r = await fetch(`${STACK}/rest/v1/entities?select=pcid,slug,entity_type&slug=not.is.null&order=pcid`, {
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, range: `${from}-${from + 999}` },
  })
  const page = await r.json()
  rows.push(...page)
  if (page.length < 1000) break
}

let written = 0
for (const { pcid, slug, entity_type } of rows) {
  const route = `/id/PCID-${pcid}`
  const file = join(args.out, 'raw', routeFile(route).split('/').pop())
  if (existsSync(file)) continue
  const key = requestKey('GET', `/rest/v1/entities?select=slug%2Centity_type&pcid=eq.${pcid}`, '')
  const body = JSON.stringify([{ slug, entity_type }])
  const headers = { 'content-type': 'application/json; charset=utf-8', 'content-range': '0-0/*' }
  writeFileSync(file, JSON.stringify({ route, requested: route, errors: 0, synthetic: true, r: { [key]: [200, headers, body] } }))
  written++
}
console.log(`${rows.length} entities, ${written} permalink recordings written`)
