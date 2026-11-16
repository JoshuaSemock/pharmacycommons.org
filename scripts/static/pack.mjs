#!/usr/bin/env node
// Turn recorded responses (scripts/static/record.mjs) into the static edition's /data/.
//
//   <out>/site/data/s/<key>.json       one answer each: those recorded on "/" (header
//                                      search loads) and any that --share or more routes need
//   <out>/site/data/p/<xx>/<hash>.json the rest of each route's answers
//
// Prints file counts and sizes (raw and gzip) so the full export can be projected.
//
// Space savers (the site must stay under GitHub Pages' 1 GB):
//  - answers from the public API function (pretty-printed record documents, versions,
//    changes) are dropped: src/staticData.ts reads those from /api-static/ instead;
//  - JSON bodies are stored unescaped as [status, headers, null, json].
//
// Usage: node scripts/static/pack.mjs --out ../static-out [--share 3]
// Destination: scripts/static/pack.mjs

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { routeFile } from './key.mjs'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
)
const out = args.out
const threshold = Number(args.share ?? 3)
if (!out) { console.error('Need --out <dir>.'); process.exit(2) }

const rawDir = join(out, 'raw')
const files = readdirSync(rawDir).filter(f => f.endsWith('.json'))
const isApiDoc = v => typeof v[2] === 'string' && v[2].startsWith('{\n') && v[2].includes('"pcid": "PCID-')
function compact(v) {
  if (typeof v[2] !== 'string' || !(v[1]['content-type'] ?? '').includes('json') || !v[2]) return v
  try { return [v[0], v[1], null, JSON.parse(v[2])] } catch { return v }
}
let dropped = 0
const recs = files.map(f => {
  const rec = JSON.parse(readFileSync(join(rawDir, f), 'utf8'))
  const r = {}
  for (const [k, v] of Object.entries(rec.r)) {
    if (isApiDoc(v)) { dropped++; continue }
    r[k] = compact(v)
  }
  rec.r = r
  return rec
})

// How many routes use each key (with the same answer).
const uses = new Map()
for (const rec of recs) for (const [k, v] of Object.entries(rec.r)) {
  const sig = k + JSON.stringify(v).length
  uses.set(sig, (uses.get(sig) ?? 0) + 1)
}
const shared = {}
for (const rec of recs) for (const [k, v] of Object.entries(rec.r)) {
  if (rec.route === '/' || uses.get(k + JSON.stringify(v).length) >= threshold) shared[k] = v
}
// Compare views (/lists/compare, /classifications/compare) ask for the same answers the
// list and class pages recorded. Copy those into data/s/ too (the pages keep theirs).
const ALSO_SHARED = /^\/(lists|classifications)\/[^/]+$/
const copies = {}
for (const rec of recs) if (ALSO_SHARED.test(rec.route) && !rec.route.endsWith('/compare')) {
  for (const [k, v] of Object.entries(rec.r)) if (!(k in shared)) copies[k] = v
}

const site = join(out, 'site')
rmSync(join(site, 'data'), { recursive: true, force: true })
mkdirSync(join(site, 'data', 'p'), { recursive: true })
const write = (rel, obj) => {
  const text = JSON.stringify(obj)
  const path = join(site, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
  return { raw: Buffer.byteLength(text), gz: gzipSync(text).length }
}

const sharedSize = { raw: 0, gz: 0 }
for (const [k, v] of Object.entries({ ...copies, ...shared })) {
  const s = write(`data/s/${k}.json`, v)
  sharedSize.raw += s.raw; sharedSize.gz += s.gz
}
const byType = new Map()
let pages = { n: 0, raw: 0, gz: 0, keys: 0 }
for (const rec of recs) {
  const r = {}
  for (const [k, v] of Object.entries(rec.r)) if (!(k in shared)) r[k] = v
  const s = write(routeFile(rec.route), { v: 1, r })
  const type = rec.route.split('/')[1] || '(home)'
  const t = byType.get(type) ?? { n: 0, raw: 0, gz: 0 }
  t.n++; t.raw += s.raw; t.gz += s.gz
  byType.set(type, t)
  pages.n++; pages.raw += s.raw; pages.gz += s.gz; pages.keys += Object.keys(r).length
}

const mb = b => (b / 1048576).toFixed(1) + ' MB'
const kb = b => (b / 1024).toFixed(1) + ' KB'
console.log(`routes ${recs.length}; shared threshold ${threshold} routes; ${dropped} API-function answers left to /api-static`)
console.log(`shared files: ${Object.keys(shared).length} + ${Object.keys(copies).length} list/class copies, ${mb(sharedSize.raw)} (${mb(sharedSize.gz)} gzip)`)
console.log(`route files: ${pages.n}, ${mb(pages.raw)} (${mb(pages.gz)} gzip), avg ${(pages.keys / pages.n).toFixed(1)} answers`)
console.log('by first path segment: count, avg raw, avg gzip')
for (const [t, s] of [...byType].sort()) console.log(`  /${t}: ${s.n}, ${kb(s.raw / s.n)}, ${kb(s.gz / s.n)}`)
