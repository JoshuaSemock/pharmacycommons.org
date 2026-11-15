#!/usr/bin/env node
// Record what each page asks the database, for the static edition (docs/static-export.md).
//
// Opens every route in a headless browser against the local app (`pnpm build:local`
// then `pnpm preview:local`, which proxies /supabase to the local stack) and saves
// every /supabase/... response the page makes, one raw file per route:
//
//   <out>/raw/<routeHash>.json   { route, r: { [requestKey]: [status, headers, body] } }
//
// Re-running skips routes already recorded (delete the file to redo one).
// scripts/static/pack.mjs turns the raw files into the site's /data/ folder.
//
// Usage:
//   node scripts/static/record.mjs --routes routes.txt --out ../static-out
//          [--base http://127.0.0.1:4173] [--workers 4] [--browser <path to msedge/chrome>]
//
// Local only: refuses a base URL that isn't 127.0.0.1/localhost.
// Destination: scripts/static/record.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { requestKey, routeOf, routeFile } from './key.mjs'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
)
const base = (args.base ?? 'http://127.0.0.1:4173').replace(/\/$/, '')
const out = args.out
const workers = Number(args.workers ?? 4)
const browserPath = args.browser ?? (process.platform === 'win32'
  ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  : undefined)
if (!args.routes || !out) { console.error('Need --routes <file> and --out <dir>.'); process.exit(2) }
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) { console.error(`Refusing non-local base ${base}`); process.exit(2) }

const routes = readFileSync(args.routes, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'))
mkdirSync(join(out, 'raw'), { recursive: true })
const KEEP_HEADERS = ['content-type', 'content-range', 'location']

/** Route as the browser will see it in location.pathname. */
const pathOf = route => routeOf(new URL(base + encodeURI(route.split('?')[0])).pathname)
const rawFile = route => join(out, 'raw', routeFile(pathOf(route)).split('/').pop())

async function recordOne(context, route) {
  const page = await context.newPage()
  const r = {}
  const pending = []
  let errors = 0
  page.on('response', res => {
    const url = res.url()
    const at = url.indexOf('/supabase/')
    if (!url.startsWith(base) || at < 0) return
    const req = res.request()
    const method = req.method()
    const path = url.slice(at + '/supabase'.length)
    pending.push((async () => {
      const key = requestKey(method, path, req.postData() ?? '')
      const h = res.headers()
      const headers = Object.fromEntries(KEEP_HEADERS.filter(k => h[k]).map(k => [k, h[k]]))
      let body = ''
      if (method !== 'HEAD' && res.status() !== 204) body = await res.text().catch(() => '')
      if (res.status() >= 500) errors++
      r[key] = [res.status(), headers, body]
    })())
  })
  try {
    await page.goto(base + encodeURI(route), { waitUntil: 'networkidle', timeout: 60000 })
    if (route === '/') {
      // Header search loads the catalog, lists, classes and posts on focus: record them too.
      const box = page.locator('input[aria-label="Search the commons"]:visible').first()
      await box.focus().catch(() => undefined)
      await page.waitForTimeout(1500)
      await page.waitForLoadState('networkidle').catch(() => undefined)
    }
    await page.waitForTimeout(500)
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined)
    await Promise.all(pending)
  } finally {
    await page.close()
  }
  const file = rawFile(route)
  writeFileSync(file + '.part', JSON.stringify({ route: pathOf(route), requested: route, errors, r }))
  renameSync(file + '.part', file)
  return { n: Object.keys(r).length, errors }
}

const browser = await chromium.launch({ executablePath: browserPath, headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const todo = routes.filter(rt => !existsSync(rawFile(rt)))
console.log(`${routes.length} routes, ${routes.length - todo.length} already recorded, ${todo.length} to go; ${workers} workers`)
let done = 0
const started = Date.now()
async function worker() {
  for (;;) {
    const route = todo.shift()
    if (!route) return
    try {
      const { n, errors } = await recordOne(context, route)
      if (errors) appendFileSync(join(out, 'errors.txt'), `${route}\t${errors} responses >= 500\n`)
      done++
      if (done % 25 === 0 || todo.length === 0) {
        const rate = done / ((Date.now() - started) / 1000)
        console.log(`${done} done (${rate.toFixed(2)}/s, ~${Math.round(todo.length / rate / 60)} min left); last ${route}: ${n} requests`)
      }
    } catch (e) {
      appendFileSync(join(out, 'errors.txt'), `${route}\t${String(e).split('\n')[0]}\n`)
    }
  }
}
await Promise.all(Array.from({ length: workers }, worker))
await browser.close()
console.log(`Finished in ${Math.round((Date.now() - started) / 1000)} s`)
