#!/usr/bin/env node
// Run the ingest Edge Functions against the LOCAL Supabase stack (docs/local-app.md, phase 5).
//
// `supabase start` already serves every function in supabase/functions/; this script calls them
// batch by batch (instead of their self-chaining `chain: true`), prints each batch's result, and
// stops when the function reports nothing left. It refuses to run against anything but
// 127.0.0.1/localhost, so it can never write to the hosted project.
//
//   node scripts/ingest-local.mjs <job> [options]       (or: pnpm ingest:local <job> [options])
//
// Jobs (function · token name in public.ingest_tokens):
//   drugsfda              drugsfda-ingest · drugsfda      openFDA /drug/drugsfda pages → fda_applications/products
//   rxnorm                rxnorm-brands · rxnorm          RxNorm brand names for moieties without rxnorm_lookup
//   rxclass               rxclass-ingest · rxclass        RxClass memberships (--mode drugs|taxonomy|va_verify)
//   chemont               chemont-terms · rxclass         ChemOnt taxonomy (one call)
//   classyfire            classyfire-ingest · rxclass     ChemOnt links for moieties without any
//   pubchem               pubchem-structures · rxclass    SMILES by InChIKey (structure ladder rung 1)
//   gsrs                  gsrs-structures · rxclass       SMILES by UNII (rung 2)
//   xref                  pubchem-xref · rxclass          rung 3 (--mode drugbank) or 4 (--mode name, review table only)
//
// Options:
//   --limit N        batch size (default: the function's own default)
//   --max-batches N  stop after N batches (default 1000)
//   --once           one batch only
//   --mode M         rxclass / xref mode
//   --search S       drugsfda openFDA search expression
//   --skip N         drugsfda starting offset
//   --pause S        seconds between batches (default 1; PubChem jobs 5)
//   --create-token   if the job's token row is missing in the LOCAL database, create one
//                    (drugsfda and rxnorm were disabled on the hosted project by deleting their rows)
//
// Keys: the CLI's local defaults, read from `supabase status -o env` (SUPABASE_CLI may point at the
// executable), or from LOCAL_SERVICE_ROLE_KEY / LOCAL_SECRET_KEY / LOCAL_API_URL.
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'

const JOBS = {
  drugsfda: { fn: 'drugsfda-ingest', token: 'drugsfda' },
  rxnorm: { fn: 'rxnorm-brands', token: 'rxnorm' },
  rxclass: { fn: 'rxclass-ingest', token: 'rxclass' },
  chemont: { fn: 'chemont-terms', token: 'rxclass' },
  classyfire: { fn: 'classyfire-ingest', token: 'rxclass' },
  pubchem: { fn: 'pubchem-structures', token: 'rxclass', pubchem: true },
  gsrs: { fn: 'gsrs-structures', token: 'rxclass' },
  xref: { fn: 'pubchem-xref', token: 'rxclass', pubchem: true },
}

function parseArgs(argv) {
  const [job, ...rest] = argv
  const opts = {}
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (!a.startsWith('--')) throw new Error(`unexpected argument ${a}`)
    const key = a.slice(2)
    if (key === 'once' || key === 'create-token') opts[key] = true
    else opts[key] = rest[++i]
  }
  return { job, opts }
}

function localKeys() {
  let env = {}
  if (!process.env.LOCAL_SERVICE_ROLE_KEY) {
    const cli = process.env.SUPABASE_CLI || 'supabase'
    // stderr ignored: `status` lists the services config.toml turns off ("Stopped services: …").
    const out = execFileSync(cli, ['status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
    })
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)="?(.*?)"?$/)
      if (m) env[m[1]] = m[2]
    }
  }
  const api = process.env.LOCAL_API_URL || env.API_URL || 'http://127.0.0.1:54321'
  const serviceJwt = process.env.LOCAL_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY
  const secret = process.env.LOCAL_SECRET_KEY || env.SECRET_KEY || serviceJwt
  if (!serviceJwt) throw new Error('no local service role key (is the stack running? try `supabase status`)')
  const host = new URL(api).hostname
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error(`refusing to run against ${api}: local stack only`)
  return { api, serviceJwt, secret }
}

async function ingestToken(keys, name, create) {
  const headers = { apikey: keys.secret, Authorization: `Bearer ${keys.serviceJwt}` }
  const r = await fetch(`${keys.api}/rest/v1/ingest_tokens?select=token&name=eq.${encodeURIComponent(name)}`, { headers })
  if (!r.ok) throw new Error(`reading ingest_tokens: HTTP ${r.status} ${await r.text()}`)
  const rows = await r.json()
  if (rows.length) return rows[0].token
  if (!create) {
    throw new Error(`no '${name}' row in the local ingest_tokens table (the job is disabled). Re-run with --create-token to enable it locally.`)
  }
  const token = randomBytes(24).toString('hex')
  const ins = await fetch(`${keys.api}/rest/v1/ingest_tokens`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ name, token }),
  })
  if (!ins.ok) throw new Error(`creating local '${name}' token: HTTP ${ins.status} ${await ins.text()}`)
  console.log(`created a local '${name}' ingest token (local database only)`)
  return token
}

async function call(keys, fn, token, body) {
  const r = await fetch(`${keys.api}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.serviceJwt}`, 'x-ingest-token': token },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text.slice(0, 300) } }
  if (!r.ok) throw new Error(`${fn} HTTP ${r.status}: ${JSON.stringify(json).slice(0, 400)}`)
  return json
}

const sleep = s => new Promise(res => setTimeout(res, s * 1000))
const num = v => (v === undefined ? undefined : Number(v))

/** Returns the next request body, or null when the job is finished. */
function next(job, body, res, opts) {
  const limit = body.limit
  switch (job) {
    case 'drugsfda': {
      if (!res.fetched || (limit && res.fetched < limit)) return null
      const skip = (body.skip ?? 0) + res.fetched
      return skip > 25000 ? null : { ...body, skip }
    }
    case 'rxnorm':
      return res.batch > 0 && (!limit || res.batch === limit) ? body : null
    case 'rxclass':
      if (opts.mode === 'taxonomy') return null
      if (opts.mode === 'va_verify') return res.left > 0 ? body : null
      return res.batch > 0 && (!limit || res.batch === limit) ? body : null
    case 'chemont':
      return null
    case 'classyfire':
    case 'pubchem':
    case 'gsrs':
      // Same rule as the functions' own chaining: more to do, and this batch made progress.
      return res.batch > 0 && (res.leftover > 0 || !limit || res.batch === limit) && (res.failed ?? 0) < res.batch ? body : null
    case 'xref':
      if (opts.mode === 'name') return res.batch > 0 && (!limit || res.batch === limit) ? body : null
      return res.leftover > 0 && res.batch > 0 ? { ...body, after: res.last_pcid } : null
    default:
      return null
  }
}

async function main() {
  const { job, opts } = parseArgs(process.argv.slice(2))
  const spec = JOBS[job]
  if (!spec) {
    console.error(`usage: node scripts/ingest-local.mjs <${Object.keys(JOBS).join('|')}> [options]  (see the header of this file)`)
    process.exit(2)
  }
  const keys = localKeys()
  const token = await ingestToken(keys, spec.token, !!opts['create-token'])

  let body = {}
  if (opts.limit) body.limit = num(opts.limit)
  if (opts.mode) body.mode = opts.mode
  if (job === 'drugsfda') {
    body.skip = num(opts.skip) ?? 0
    body.limit ??= 1000
    if (opts.search) body.search = opts.search
  }
  const pause = num(opts.pause) ?? (spec.pubchem ? 5 : 1)
  const maxBatches = opts.once ? 1 : (num(opts['max-batches']) ?? 1000)

  if (spec.pubchem) {
    // PubChem blocked the hosted function once (docs/structure-fetch.md): probe before writing anything.
    const probeBody = job === 'xref' ? { mode: body.mode ?? 'drugbank', probe: true } : { probe: ['XZWYZXLIPXDOLR-UHFFFAOYSA-N'] }
    const p = await call(keys, spec.fn, token, probeBody)
    console.log('probe', JSON.stringify(p))
    const entries = Array.isArray(p.probe) ? p.probe : []
    if (!entries.length || entries.some(e => e.status !== 200)) {
      console.error('PubChem probe did not return 200; not starting. Try again later.')
      process.exit(1)
    }
  }

  console.log(`${job}: ${spec.fn} against ${keys.api} (local)`)
  for (let n = 1; n <= maxBatches && body; n++) {
    const t0 = Date.now()
    const res = await call(keys, spec.fn, token, body)
    console.log(`batch ${n} (${((Date.now() - t0) / 1000).toFixed(1)}s)`, JSON.stringify(res))
    body = next(job, body, res, opts)
    if (body && n < maxBatches) await sleep(pause)
  }
  console.log(body ? `stopped after ${maxBatches} batch(es); more remains` : 'done: the function reports nothing left')
}

main().catch(e => {
  console.error(String(e?.message ?? e))
  process.exit(1)
})
