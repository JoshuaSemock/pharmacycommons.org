/**
 * Records each legal document's body hash in its front matter.
 *
 *   node --experimental-strip-types --no-warnings=ExperimentalWarning scripts/legal-hash.mjs          # check
 *   node --experimental-strip-types --no-warnings=ExperimentalWarning scripts/legal-hash.mjs --write  # update
 *
 * The hash covers everything after the front matter (line endings normalised,
 * ends trimmed), the same text src/legal.test.ts hashes. After editing a legal
 * document, run with --write, or copy the value the failing test prints.
 * If the change is material, also set effective_date in the document and bump
 * LEGAL_VERSION in src/legal.ts.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from '../src/frontmatterParse.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FILES = [
  'docs/terms-of-use.md',
  'docs/medical-disclaimer.md',
  'docs/privacy-policy.md',
  'docs/data-provenance-and-licensing.md',
]
const write = process.argv.includes('--write')
let stale = 0

for (const file of FILES) {
  const full = path.join(ROOT, file)
  const raw = fs.readFileSync(full, 'utf8')
  const { meta, body, error } = parseFrontmatter(raw)
  if (error) {
    console.error(`${file}: front matter could not be read: ${error}`)
    process.exitCode = 1
    continue
  }
  const hash = crypto.createHash('sha256').update(body).digest('hex')
  if (meta.body_sha256 === hash) {
    console.log(`ok       ${file}`)
    continue
  }
  stale++
  if (!write) {
    console.log(`changed  ${file}\n         body_sha256: ${hash}`)
    continue
  }
  if (!/^body_sha256:.*$/m.test(raw)) {
    console.error(`${file}: no body_sha256 line to update`)
    process.exitCode = 1
    continue
  }
  fs.writeFileSync(full, raw.replace(/^body_sha256:.*$/m, `body_sha256: ${hash}`))
  console.log(`updated  ${file}`)
}
if (stale && !write) process.exitCode = 1
