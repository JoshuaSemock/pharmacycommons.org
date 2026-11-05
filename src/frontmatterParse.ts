/**
 * YAML front matter parser for markdown files (blog posts, legal documents).
 *
 * Runs in Node only: the Vite plugin in scripts/viteFrontmatter.ts parses each
 * `*.md?fm` import at build time, and scripts/postbuild.mjs, scripts/legal-hash.mjs
 * and the tests call it directly. The browser never loads this file or the
 * `yaml` library (importing it from app code would add ~30 kB gzip to the
 * main bundle). App code reads parsed results with src/frontmatter.ts.
 * One parser for everything, so the site, the sitemap and the tests can never
 * read a file differently. (Before 2026-11-05 the blog had two hand-written copies.)
 *
 * A file has front matter when its very first line is `---`. The block runs to
 * the next line that is exactly `---`. Everything after it is the body. A `---`
 * anywhere else is an ordinary markdown rule.
 *
 * The parser is deliberately strict about what YAML it accepts:
 * - the YAML 1.2 "core" schema, so `date: 2026-10-27` stays the string it looks
 *   like (never a Date) and there are no custom tags;
 * - no anchors or aliases (closes the "billion laughs" expansion attack);
 * - duplicate keys are an error;
 * - the block is capped at MAX_FRONTMATTER_LENGTH characters.
 *
 * `parseFrontmatter` never throws. A file with broken YAML gets `meta: {}` and
 * an `error` message, and its body is still returned without the block, so a
 * typo cannot put raw YAML on a public page. Tests assert `error === null` for
 * every committed file, so the mistake shows up in CI instead.
 *
 * Plain Node can import this file (`node --experimental-strip-types`), so keep
 * it free of enums and other TypeScript-only syntax.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { parse } from 'yaml'
import type { Frontmatter, FrontmatterResult } from './frontmatter.ts'

export const MAX_FRONTMATTER_LENGTH = 16_000

const BLOCK = /^---[ \t]*\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/

export function parseFrontmatter(raw: string): FrontmatterResult {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const match = BLOCK.exec(text)
  if (!match) return { meta: {}, body: text.trim(), error: null }

  const body = text.slice(match[0].length).trim()
  const yaml = match[1] ?? ''
  if (yaml.length > MAX_FRONTMATTER_LENGTH) {
    return { meta: {}, body, error: `Front matter is ${yaml.length} characters; the limit is ${MAX_FRONTMATTER_LENGTH}.` }
  }

  let value: unknown
  try {
    value = parse(yaml, { schema: 'core', maxAliasCount: 0, uniqueKeys: true, logLevel: 'error' })
  } catch (e) {
    return { meta: {}, body, error: e instanceof Error ? e.message : String(e) }
  }
  if (value === null || value === undefined) return { meta: {}, body, error: null }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { meta: {}, body, error: 'Front matter must be a set of key: value pairs.' }
  }
  return { meta: value as Frontmatter, body, error: null }
}
