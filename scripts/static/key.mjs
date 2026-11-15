// Request key and route file name for the static edition. Must match
// requestKey() / routeFile() in src/staticData.ts exactly.
// Destination: scripts/static/key.mjs
import { createHash } from 'node:crypto'

const sha = text => createHash('sha256').update(text).digest('hex').slice(0, 20)

export const requestKey = (method, path, body) => sha(`${method.toUpperCase()}\n${path}\n${body}`)

export const routeOf = pathname => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : '/')

/** Path under the site root, e.g. data/p/3f/3f2a....json */
export const routeFile = route => {
  const h = sha(route)
  return `data/p/${h.slice(0, 2)}/${h}.json`
}
