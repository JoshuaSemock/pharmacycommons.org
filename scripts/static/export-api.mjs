#!/usr/bin/env node
// Static copy of the public API (docs/static-export.md), generated from the local stack's
// `api` Edge Function so every document is byte-for-byte what the function returns.
//
//   <out>/site/api-static/v1.json                         index
//   <out>/site/api-static/v1/schema/entity.json, v1/context.jsonld
//   <out>/site/api-static/v1/entities/PCID-n.json         current document
//   <out>/site/api-static/v1/entities/PCID-n/versions.json, changes.json (first 50)
//   <out>/site/api-static/v1/entities/PCID-n/members.json (classes: first 100, all levels)
//   <out>/site/api-static/v1/slugs.json                   { slug: pcid } for slug lookups
//   <out>/site/api-static/v1/retired.json                 { pcid: replaced_by_pcid | null }
//
// The Cloudflare Worker (workers/api-proxy) maps /api/... onto these files. Links inside
// documents point at https://pharmacycommons.org/api (the local function's own base is rewritten).
//
// Usage: node scripts/static/export-api.mjs --out ../static-out --retired retired.txt [--workers 4]
//        node scripts/static/export-api.mjs --out ../static-out --minify-only   (re-minify saved files)
//   retired.txt: psql -At -F'|' -c "select pcid, replaced_by_pcid from pcid_retired"
// Local only. Re-running skips files that already exist.
// Destination: scripts/static/export-api.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
)
const STACK = 'http://127.0.0.1:54321'
const FN = `${STACK}/functions/v1/api`
const KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' // CLI local default (.env.localdb)
const PUBLIC_BASE = 'https://pharmacycommons.org/api'
const LOCAL_BASES = ['http://kong:8000/functions/v1/api', 'http://127.0.0.1:54321/functions/v1/api']
const workers = Number(args.workers ?? 4)
if (!args.out) { console.error('Need --out <dir>.'); process.exit(2) }
const root = join(args.out, 'site', 'api-static')

// Stored minified to fit GitHub Pages; the Worker pretty-prints JSON when it serves it.
const minify = text => { try { return JSON.stringify(JSON.parse(text)) } catch { return text } }
const fix = text => minify(LOCAL_BASES.reduce((t, b) => t.split(b).join(PUBLIC_BASE), text))
function save(rel, text) {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path + '.part', text)
  renameSync(path + '.part', path)
}

async function get(path) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(FN + path, { headers: { accept: 'application/json' }, redirect: 'manual' })
      return { status: r.status, text: fix(await r.text()) }
    } catch (e) {
      if (attempt >= 4) throw e
      await new Promise(res => setTimeout(res, 1000 * attempt))
    }
  }
}

if ('minify-only' in args) {
  const { readdirSync, statSync } = await import('node:fs')
  let n = 0
  const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else { const t = readFileSync(p, 'utf8'); const m = minify(t); if (m !== t) { writeFileSync(p, m); n++ } } } }
  walk(root)
  console.log(`minified ${n} files`)
  process.exit(0)
}

// Every entity (pcid, slug, type) via PostgREST, 1000 at a time.
const entities = []
for (let from = 0; ; from += 1000) {
  const r = await fetch(`${STACK}/rest/v1/entities?select=pcid,slug,entity_type&order=pcid`, {
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, range: `${from}-${from + 999}` },
  })
  const rows = await r.json()
  entities.push(...rows)
  if (rows.length < 1000) break
}
console.log(`${entities.length} entities`)

save('v1/slugs.json', JSON.stringify(Object.fromEntries(entities.filter(e => e.slug).map(e => [e.slug, e.pcid]))))
if (args.retired) {
  const map = {}
  for (const line of readFileSync(args.retired, 'utf8').split(/\r?\n/)) {
    const [pcid, to] = line.split('|')
    if (pcid) map[pcid] = to ? Number(to) : null
  }
  save('v1/retired.json', JSON.stringify(map))
}
for (const [path, rel] of [['/v1', 'v1.json'], ['/v1/schema/entity.json', 'v1/schema/entity.json'], ['/v1/context.jsonld', 'v1/context.jsonld']]) {
  save(rel, (await get(path)).text)
}

const jobs = []
for (const e of entities) {
  const id = `PCID-${e.pcid}`
  jobs.push([`/v1/entities/${id}`, `v1/entities/${id}.json`])
  jobs.push([`/v1/entities/${id}/versions`, `v1/entities/${id}/versions.json`])
  jobs.push([`/v1/entities/${id}/changes`, `v1/entities/${id}/changes.json`])
  if (e.entity_type === 'class') jobs.push([`/v1/entities/${id}/members`, `v1/entities/${id}/members.json`])
}
const todo = jobs.filter(([, rel]) => !existsSync(join(root, rel)))
console.log(`${jobs.length} documents, ${todo.length} to fetch`)
let done = 0, failed = 0
const started = Date.now()
await Promise.all(Array.from({ length: workers }, async () => {
  for (;;) {
    const job = todo.shift()
    if (!job) return
    const { status, text } = await get(job[0])
    if (status === 200) save(job[1], text)
    else { failed++; console.warn(`${status} ${job[0]}`) }
    if (++done % 2000 === 0) console.log(`${done} (${(done / ((Date.now() - started) / 1000)).toFixed(0)}/s)`)
  }
}))
console.log(`Done: ${done} fetched, ${failed} not 200, ${Math.round((Date.now() - started) / 1000)} s`)
