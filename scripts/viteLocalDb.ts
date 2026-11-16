/**
 * Local Tables feature (docs/local-tables.md): a small database endpoint inside the Vite
 * dev and preview servers, added only in `--mode localdb` (vite.config.ts). It connects
 * straight to the local stack's Postgres, so the Tables page can show every table and save
 * edits, which the browser's publishable key (RLS) cannot.
 *
 *   GET  /__local/db/tables              catalogue of public tables, views, matviews
 *   GET  /__local/db/rows?table=…        a page of rows + the matching count
 *   GET  /__local/db/csv?table=…         the matching rows as CSV (up to 100,000)
 *   POST /__local/db/update              one cell: { table, key, column, oldValue, newValue }
 *
 * Only for this PC: refuses connections that are not from 127.0.0.1/::1, any Host header
 * other than localhost/127.0.0.1 (stops DNS-rebinding pages), POSTs without the
 * `x-pc-local: 1` header (a cross-site form cannot set it), and a database URL that is not
 * local. Never part of a build: the GitHub Pages site has no server.
 *
 * Destination: scripts/viteLocalDb.ts
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import type { Pool as PgPool } from 'pg'
import {
  META_SQL,
  buildCountQuery,
  buildRowsQuery,
  checkUpdate,
  keyCondition,
  parseRowsParams,
  quoteIdent,
  sameValue,
  toCsv,
  toParam,
  type TableMeta,
  type UpdateRequest,
} from './localDb.ts'

const PREFIX = '/__local/db/'
const DEFAULT_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

let pool: PgPool | null = null
async function getPool(): Promise<PgPool> {
  if (pool) return pool
  const url = process.env.LOCAL_DB_URL || DEFAULT_URL
  const host = new URL(url).hostname
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error(`LOCAL_DB_URL must point at this PC, not ${host}`)
  const { default: pg } = await import('pg')
  pool = new pg.Pool({ connectionString: url, max: 3, options: '-c statement_timeout=15000' })
  return pool
}

let metaCache: { at: number; tables: TableMeta[] } | null = null
async function catalogue(fresh = false): Promise<TableMeta[]> {
  if (!fresh && metaCache && Date.now() - metaCache.at < 60_000) return metaCache.tables
  const { rows } = await (await getPool()).query(META_SQL)
  const tables = rows.map(r => ({ ...r, estimate: Number(r.estimate) })) as TableMeta[]
  metaCache = { at: Date.now(), tables }
  return tables
}

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json; charset=utf-8') {
  res.statusCode = status
  res.setHeader('content-type', type)
  res.setHeader('cache-control', 'no-store')
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => {
      data += chunk
      if (data.length > 1_000_000) reject(new Error('Request too large'))
    })
    req.on('end', () => {
      try { resolve(JSON.parse(data || 'null')) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

function allowed(req: IncomingMessage): string | null {
  if (!LOOPBACK.has(req.socket.remoteAddress ?? '')) return 'Only this PC may use the local database endpoint.'
  const host = (req.headers.host ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) return 'Unexpected Host header.'
  if (req.method === 'POST' && req.headers['x-pc-local'] !== '1') return 'Missing x-pc-local header.'
  return null
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const route = url.pathname.slice(PREFIX.length)
  const denied = allowed(req)
  if (denied) return send(res, 403, { error: denied })

  if (req.method === 'GET' && route === 'tables') {
    return send(res, 200, { tables: await catalogue(url.searchParams.has('fresh')) })
  }

  if (req.method === 'GET' && (route === 'rows' || route === 'csv')) {
    const t = (await catalogue()).find(x => x.name === url.searchParams.get('table'))
    if (!t) return send(res, 404, { error: 'Unknown table.' })
    const p = parseRowsParams(url.searchParams, t, route === 'csv')
    const db = await getPool()
    const rowsQ = buildRowsQuery(t, p)
    if (route === 'csv') {
      const { rows } = await db.query(rowsQ)
      res.setHeader('content-disposition', `attachment; filename="${t.name}.csv"`)
      return send(res, 200, toCsv(t.columns.map(c => c.name), rows), 'text/csv; charset=utf-8')
    }
    const [{ rows }, count] = await Promise.all([
      db.query(rowsQ),
      db.query(buildCountQuery(t, p)).then(r => Number(r.rows[0].n), () => null),
    ])
    return send(res, 200, { rows, total: count, estimate: t.estimate, limit: p.limit, offset: p.offset })
  }

  if (req.method === 'POST' && route === 'update') {
    const u = (await readJson(req)) as UpdateRequest
    const t = (await catalogue()).find(x => x.name === u?.table)
    const problem = checkUpdate(t, u)
    if (problem || !t) return send(res, 400, { error: problem })
    const col = t.columns.find(c => c.name === u.column)!
    const client = await (await getPool()).connect()
    try {
      await client.query('begin')
      // Tag the entity_changes rows that triggers write, like any bulk edit (CLAUDE.md).
      await client.query(`select set_config('pc.change_source', 'tables-ui', true)`)
      const key = keyCondition(t, u.key, 1)
      const current = await client.query(
        `select ${quoteIdent(col.name)} as v from public.${quoteIdent(t.name)} where ${key.sql} for update`,
        key.values,
      )
      if (current.rowCount !== 1) {
        await client.query('rollback')
        return send(res, 404, { error: 'That row no longer exists.' })
      }
      if (!sameValue(JSON.parse(JSON.stringify(current.rows[0].v ?? null)), u.oldValue)) {
        await client.query('rollback')
        return send(res, 409, { error: 'Someone or something changed this value since you opened it. Reload the page.', current: current.rows[0].v })
      }
      const upd = keyCondition(t, u.key, 2)
      const result = await client.query(
        `update public.${quoteIdent(t.name)} set ${quoteIdent(col.name)} = $1 where ${upd.sql} returning ${quoteIdent(col.name)} as v`,
        [toParam(col.type, u.newValue), ...upd.values],
      )
      await client.query('commit')
      return send(res, 200, { value: result.rows[0].v })
    } catch (e) {
      await client.query('rollback').catch(() => undefined)
      throw e
    } finally {
      client.release()
    }
  }

  return send(res, 404, { error: 'Unknown endpoint.' })
}

function middleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  if (!req.url?.startsWith(PREFIX)) return next()
  handle(req, res).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e)
    const down = /ECONNREFUSED|connect/i.test(msg)
    send(res, down ? 503 : 400, { error: down ? 'The local database is not running. Start Pharmacy Commons from the desktop icon.' : msg })
  })
}

export default function localDb(): Plugin {
  return {
    name: 'pc-local-db',
    configureServer: server => { server.middlewares.use(middleware) },
    configurePreviewServer: server => { server.middlewares.use(middleware) },
  }
}
