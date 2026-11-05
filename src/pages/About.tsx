import { useMemo } from 'react'
import PageShell from './PageShell'
import Markdown from './Markdown'
import { parseAbout } from '../aboutDoc'
import type { FrontmatterResult } from '../frontmatter'

/**
 * /about. The text lives in docs/about.md (front matter parsed at build time):
 * edit the markdown, not this file.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const DOCS = import.meta.glob<FrontmatterResult>('../../docs/about.md', {
  query: '?fm',
  import: 'default',
  eager: true,
})

export default function About() {
  const source = DOCS['../../docs/about.md']
  const doc = useMemo(() => parseAbout(source ?? { meta: {}, body: '', error: null }), [source])

  return (
    <PageShell title={doc.title} lede={doc.lede}>
      <div className="pt-4">
        <Markdown source={doc.body} />
      </div>
    </PageShell>
  )
}
