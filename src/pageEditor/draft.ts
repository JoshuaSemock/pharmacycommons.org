/**
 * Local drafts (docs/page-editor.md §4a): the editor saves what you type to
 * this browser on every change, so a closed tab or a failed publish never loses
 * work. One draft per page and section, kept for 7 days. Storage can be
 * unavailable (private windows, blocked site data); then drafts are skipped
 * silently and the editor works as normal.
 */

import type { FragmentTarget } from '../pageSource'

const PREFIX = 'pc:draft:'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export type Draft = { source: string; summary: string; baseRevisionId: number | null; savedAt: number }

export function draftKey(pcid: number, target?: FragmentTarget): string {
  const part = !target ? 'page' : target.kind === 'lead' ? 'lead' : target.kind === 'rail' ? target.name : `section:${target.heading.toLowerCase()}`
  return `${PREFIX}${pcid}:${part}`
}

export function loadDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const d = JSON.parse(raw) as Draft
    if (typeof d.source !== 'string' || typeof d.savedAt !== 'number' || Date.now() - d.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(key)
      return null
    }
    return d
  } catch {
    return null
  }
}

export function saveDraft(key: string, draft: Omit<Draft, 'savedAt'>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify({ ...draft, savedAt: Date.now() }))
  } catch {
    // Storage full or blocked: the editor still works, just without a local copy.
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/** Removes drafts older than 7 days, on any page. */
export function pruneDrafts(): void {
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i)
      if (k?.startsWith(PREFIX)) loadDraft(k)
    }
  } catch {
    // ignore
  }
}
