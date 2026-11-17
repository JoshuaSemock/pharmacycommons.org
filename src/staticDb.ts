/**
 * The static edition's in-browser SQLite (docs/static-export.md, "Live queries without
 * a database"). sql.js (SQLite compiled to WebAssembly, ~0.3 MB gzipped) and the
 * gzipped database file are fetched the first time a page needs them, then kept for
 * the rest of the visit.
 *
 * Files are gzipped at rest (GitHub Pages does not compress .sqlite) and inflated with
 * the browser's DecompressionStream.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Destination: src/staticDb.ts
 */

import type { Db, SqlRow, SqlValue } from './staticNetwork'

const opened = new Map<string, Promise<Db>>()

async function inflate(res: Response): Promise<Uint8Array> {
  if (!res.body) throw new Error('empty response')
  const stream = res.body.pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Opens `/data/db/<name>.sqlite.gz` once per visit. */
export function openStaticDb(name: string, realFetch: typeof fetch): Promise<Db> {
  let p = opened.get(name)
  if (!p) {
    p = (async () => {
      // The file first: when it is missing (data not attached), don't load the engine at all.
      const res = await realFetch(`/data/db/${name}.sqlite.gz`)
      if (!res.ok) throw new Error(`${name}.sqlite.gz: HTTP ${res.status}`)
      const [{ default: initSqlJs }, { default: wasmUrl }, bytes] = await Promise.all([
        import('sql.js'),
        import('sql.js/dist/sql-wasm.wasm?url'),
        inflate(res),
      ])
      const SQL = await initSqlJs({ locateFile: () => wasmUrl })
      const db = new SQL.Database(bytes)
      return {
        all(sql: string, params: SqlValue[] = []): SqlRow[] {
          const stmt = db.prepare(sql)
          try {
            stmt.bind(params)
            const rows: SqlRow[] = []
            while (stmt.step()) rows.push(stmt.getAsObject() as SqlRow)
            return rows
          } finally {
            stmt.free()
          }
        },
      }
    })()
    p.catch(() => opened.delete(name))
    opened.set(name, p)
  }
  return p
}
