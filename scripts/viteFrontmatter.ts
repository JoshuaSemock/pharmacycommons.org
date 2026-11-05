/**
 * Vite plugin: `import fm from './post.md?fm'` gives the file's front matter,
 * already parsed, as `{ meta, body, error }` (see src/frontmatterParse.ts).
 * It works with `import.meta.glob(..., { query: '?fm', import: 'default' })` too.
 *
 * The YAML is read while Vite builds (and in dev and tests), so the browser
 * gets plain JSON and never loads a YAML library. Broken front matter is
 * reported as a build warning; the tests fail on it so it is caught in CI.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'
import { parseFrontmatter } from '../src/frontmatterParse.ts'

export default function markdownFrontmatter(): Plugin {
  return {
    name: 'pc-markdown-frontmatter',
    enforce: 'pre',
    async load(id) {
      const queryAt = id.indexOf('?')
      if (queryAt < 0) return null
      const file = id.slice(0, queryAt)
      const query = new URLSearchParams(id.slice(queryAt + 1))
      if (!file.endsWith('.md') || !query.has('fm')) return null

      this.addWatchFile(file)
      const result = parseFrontmatter(await fs.readFile(file, 'utf8'))
      if (result.error) this.warn(`${path.basename(file)}: front matter could not be read: ${result.error}`)
      return `export default ${JSON.stringify(result)}`
    },
  }
}
