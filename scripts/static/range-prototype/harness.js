// Bundled with esbuild into www/harness.js; window.run(cases) opens the database with sql.js-httpvfs and times each query.
import { createDbWorker } from 'sql.js-httpvfs'
window.run = async (cases) => {
  await fetch('/__stats/reset')
  const t0 = performance.now()
  const worker = await createDbWorker([{ from: 'jsonconfig', configUrl: '/db/config.json' }], '/sqlite.worker.js', '/sql-wasm.wasm')
  const s0 = await (await fetch('/__stats')).json()
  const out = [{ name: 'open (worker + wasm + config)', ms: Math.round(performance.now() - t0), requests: s0.requests, kb: Math.round(s0.bytes / 1024) }]
  for (const [name, sql, params] of cases) {
    await fetch('/__stats/reset')
    const t1 = performance.now()
    const rows = await worker.db.query(sql, params)
    const ms = performance.now() - t1
    const s = await (await fetch('/__stats')).json()
    out.push({ name, ms: Math.round(ms), requests: s.requests, kb: Math.round(s.bytes / 1024), rows: rows.length })
  }
  return out
}
