// Usage: node server.mjs <www dir> <port> <latency ms>
// Static server with Range support, per-request latency, and request/byte counters.
import { createServer } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { join, extname } from 'node:path'
const root = process.argv[2], port = Number(process.argv[3]), delay = Number(process.argv[4] ?? 0)
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' }
let requests = 0, bytes = 0
createServer((req, res) => {
  const url = req.url.split('?')[0]
  if (url === '/__stats') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ requests, bytes })) }
  if (url === '/__stats/reset') { requests = 0; bytes = 0; res.writeHead(204); return res.end() }
  setTimeout(() => {
    const f = join(root, decodeURIComponent(url === '/' ? '/index.html' : url))
    let size; try { size = statSync(f).size } catch { res.writeHead(404); return res.end() }
    requests++; if (process.env.LOG) console.log(req.method, url, req.headers.range ?? 'full')
    const h = { 'content-type': types[extname(f)] ?? 'application/octet-stream', 'accept-ranges': 'bytes', 'cache-control': 'no-store' }
    const m = req.headers.range && /bytes=(\d+)-(\d*)/.exec(req.headers.range)
    if (m) {
      const start = Number(m[1]), end = Math.min(m[2] ? Number(m[2]) : size - 1, size - 1)
      bytes += end - start + 1
      res.writeHead(206, { ...h, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 })
      return createReadStream(f, { start, end }).pipe(res)
    }
    if (req.method !== 'HEAD') bytes += size
    res.writeHead(200, { ...h, 'content-length': size }); createReadStream(f).pipe(res)
  }, delay)
}).listen(port)
