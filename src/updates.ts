/**
 * "What's new" — one entry per thing we ship, shown on the home page beside
 * blog posts in a single dated feed.
 *
 * Adding a feature: add one object to UPDATES (newest first is tidy, but the
 * feed sorts by date anyway). Blog posts join the feed automatically from
 * src/content/posts/, so don't add them here.
 *
 * `to` is the page the entry opens. Keep `summary` to one or two sentences,
 * written for someone who has never used the feature.
 */

import { listPosts } from './blog'

export type UpdateKind = 'Tool' | 'Feature' | 'Blog post'

export type Update = {
  id: string
  /** ISO yyyy-mm-dd — the day it went live. */
  date: string
  kind: UpdateKind
  title: string
  summary: string
  to: string
  /** Link text; defaults by kind ("Open the tool", "Take a look", "Read the post"). */
  cta?: string
  /** Shown when there is no summary (blog posts without a `summary:` line). */
  detail?: string
}

export const UPDATES: Update[] = [
  {
    id: 'medication-reconciliation',
    date: '2026-09-27',
    kind: 'Tool',
    title: 'Medication reconciliation',
    summary:
      'Build one complete list of prescriptions, over-the-counter products, supplements and herbals, with allergies and substance use. Directions are written out in full, doses are calculated, and the list never leaves your browser.',
    to: '/tools/medication-reconciliation',
  },
  {
    id: 'lists',
    date: '2026-09-25',
    kind: 'Feature',
    title: 'Drug lists',
    summary:
      'Sortable lists such as the most-used drugs in the US and the Georgia MPJE lists, each linked to its drug pages, with a side-by-side compare view and a CSV download.',
    to: '/lists',
  },
  {
    id: 'creatinine-clearance',
    date: '2026-09-16',
    kind: 'Tool',
    title: 'Creatinine clearance',
    summary:
      'Cockcroft-Gault with actual, ideal and adjusted body weight side by side, plus CKD-EPI 2021 eGFR and a renal dose check. Every constant is cited.',
    to: '/tools/creatinine-clearance',
  },
]

const DEFAULT_CTA: Record<UpdateKind, string> = {
  Tool: 'Open the tool',
  Feature: 'Take a look',
  'Blog post': 'Read the post',
}

export const ctaFor = (u: Update): string => u.cta ?? DEFAULT_CTA[u.kind]

/** Features and published blog posts together, newest first. */
export function whatsNew(limit?: number): Update[] {
  const posts: Update[] = listPosts().map(p => ({
    id: `post:${p.slug}`,
    date: p.date,
    kind: 'Blog post',
    title: p.title,
    summary: p.summary,
    detail: `${p.readingMinutes} minute read`,
    to: `/blog/${p.slug}`,
  }))
  const all = [...UPDATES, ...posts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return limit == null ? all : all.slice(0, limit)
}
