/**
 * The About page's content: docs/about.md, front matter parsed at build time.
 *
 * Front matter keys: title, lede. The body is markdown; each `##` heading is a
 * section (the "On this page" rail is built from them).
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readText } from './frontmatter'
import type { FrontmatterResult } from './frontmatter'

export type AboutDoc = {
  title: string
  lede: string | undefined
  body: string
}

export const ABOUT_FALLBACK_TITLE = 'About Pharmacy Commons'

/** Reads the About document; a missing title falls back to the page's usual one. */
export function parseAbout({ meta, body }: FrontmatterResult): AboutDoc {
  return {
    title: readText(meta, 'title') ?? ABOUT_FALLBACK_TITLE,
    lede: readText(meta, 'lede'),
    body,
  }
}
