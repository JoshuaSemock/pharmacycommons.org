// Copies the page-source code the publish-page Edge Function needs from src/ into
// supabase/functions/_shared/pageSource/, rewritten for Deno (explicit .ts
// extensions, npm: specifiers). Run after changing anything in src/pageSource:
//
//   node scripts/sync-page-source.mjs
//
// src/pageSource/edgeSync.test.ts fails when the copies are out of date.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const OUT_DIR = 'supabase/functions/_shared/pageSource'

/** [source path, copied name] — everything except the browser-only parts (index.ts, assist.ts, tests, fixtures). */
export const FILES = [
  ...['types', 'citations', 'prose', 'blocks', 'parse', 'serialize', 'suggest', 'merge', 'legacy', 'publish', 'resolve'].map(n => [
    `src/pageSource/${n}.ts`,
    `${n}.ts`,
  ]),
  ['src/wiki.ts', 'wiki.ts'],
  ['src/names.ts', 'names.ts'],
]

const NPM = { 'mdast-util-from-markdown': 'npm:mdast-util-from-markdown@2.0.3' }

export function transform(source, from) {
  const header = `// GENERATED from ${from} by scripts/sync-page-source.mjs — do not edit here.\n`
  const body = source.replace(/(from\s+')([^']+)(')/g, (m, a, spec, b) => {
    if (NPM[spec]) return `${a}${NPM[spec]}${b}`
    if (spec === '../wiki') return `${a}./wiki.ts${b}`
    if (spec === '../names') return `${a}./names.ts${b}`
    if (spec.startsWith('./')) return `${a}${spec}.ts${b}`
    return m
  })
  return header + body
}

export function expected() {
  return FILES.map(([from, to]) => [join(OUT_DIR, to), transform(readFileSync(join(root, from), 'utf8'), from)])
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(join(root, OUT_DIR), { recursive: true })
  for (const [to, text] of expected()) writeFileSync(join(root, to), text)
  console.log(`synced ${FILES.length} files to ${OUT_DIR}`)
}
