#!/usr/bin/env node
/**
 * Regenerate public/drug-catalog.json from the PCID spine.
 *
 *   node scripts/build-catalog.mjs data/ID_Supabase_migrated.xlsx
 *
 * Reads the spine workbook (headers on row 3, columns A–B blank) and emits the
 * compact manifest consumed by src/catalog.ts. Run this whenever the spine
 * changes; commit the output. Once Supabase is the system of record, point the
 * input at a `\copy` export of `drugs` instead — the output shape is unchanged.
 */

import XLSX from 'xlsx'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const IN = process.argv[2] ?? 'data/ID_Supabase_migrated.xlsx'
const OUT = process.argv[3] ?? 'public/drug-catalog.json'

const SCHEDULES = ['', 'CS-1', 'CS-2', 'CS-3', 'CS-4', 'CS-5', 'CS-5 non-Rx']
const TYPES = { ingredient: 0, combination: 1 }

const wb = XLSX.readFile(IN)
const ws = wb.Sheets[wb.SheetNames[0]]

// Headers sit on row 3 in these workbooks, not row 1.
const raw = XLSX.utils.sheet_to_json(ws, { range: 2, defval: null })

const seenSlug = new Set()
const seenPcid = new Set()
const problems = []
const rows = []

for (const r of raw) {
  const pcid = str(r.pcid ?? r.PCID_number)
  const slug = str(r.slug)
  if (!pcid || !slug) continue

  if (!/^PCID-[1-3]\d{6}$/.test(pcid)) { problems.push(`bad pcid: ${pcid}`); continue }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) { problems.push(`bad slug: ${slug}`); continue }
  if (seenSlug.has(slug)) { problems.push(`duplicate slug: ${slug}`); continue }
  if (seenPcid.has(pcid)) { problems.push(`duplicate pcid: ${pcid}`); continue }
  seenSlug.add(slug); seenPcid.add(pcid)

  const n = Number(pcid.slice(5))
  const type = TYPES[str(r.entry_type)] ?? 0

  // Block discipline mirrors the DB CHECK constraint; catching it here keeps a
  // miscoded row out of the shipped bundle.
  const block = Math.floor(n / 1_000_000)
  if ((type === 0 && block !== 1) || (type === 1 && block !== 2)) {
    problems.push(`block/type mismatch: ${pcid} is block ${block} but type ${str(r.entry_type)}`)
    continue
  }

  const schedIx = SCHEDULES.indexOf(str(r.controlled_schedule) ?? '')
  rows.push([
    n,
    slug,
    str(r.generic_name) ?? slug,
    str(r.primary_brand),
    type,
    schedIx < 0 ? 0 : schedIx,
    String(r.is_stub).toLowerCase() === 'true' ? 1 : 0,
  ])
}

rows.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))

const manifest = {
  v: 1,
  generated: new Date().toISOString().slice(0, 10),
  source: IN,
  cols: ['n', 'slug', 'name', 'brand', 'type', 'sched', 'stub'],
  schedules: SCHEDULES,
  rows,
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(manifest))

console.log(`${rows.length} entries -> ${OUT}`)
if (problems.length) {
  console.warn(`\n${problems.length} row(s) skipped:`)
  for (const p of problems.slice(0, 20)) console.warn('  ' + p)
  if (problems.length > 20) console.warn(`  …and ${problems.length - 20} more`)
  process.exitCode = 1   // fail CI on spine corruption
}

function str(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
