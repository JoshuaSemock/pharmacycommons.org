/**
 * Pharmacy Commons — FDA label text
 *
 * Readable prescribing-information sections for a drug page's Clinical tab,
 * served by the `label-text` Supabase edge function
 * (supabase/functions/label-text/index.ts).
 *
 * How it works, end to end:
 *   1. `entity_label_rank` (materialized view) ranks every SPL label linked to
 *      an entity: single-ingredient over multi-ingredient, current PLR format
 *      over old format, manufacturer over repackager, newest first.
 *   2. The edge function walks that ranking, pulls the best label's text from
 *      openFDA by set ID, splits each section on the label's own subsection
 *      titles (from `label_sections`), and caches the result in
 *      `label_section_text`. After the first view it is served from the cache.
 *   3. This module calls the function and hands the typed result to
 *      LabelSections.tsx.
 *
 * Label text is public domain (21 CFR 201; FDA SPL). Every rendered section
 * carries the labeler, revision date and a DailyMed link back to the source.
 */

import { supabase } from './supabaseClient'

export type LabelSectionGroup = 'safety' | 'core' | 'populations' | 'reference'

/** One subsection: "Lactic Acidosis" + its text. `heading` is absent for untitled lead-in text. */
export interface LabelBlock {
  heading?: string
  text: string
}

export interface LabelSection {
  /** openFDA field name, e.g. `indications_and_usage` */
  key: string
  /** Plain-language title, e.g. "What it's used for" */
  title: string
  loinc: string | null
  group: LabelSectionGroup
  blocks: LabelBlock[]
  /**
   * The section's tables as raw openFDA HTML — sanitize before rendering.
   * `inline` tables are referenced from block text by a `[[TABLE:i]]` line
   * (i = index in this array) and render at that spot; the rest render after
   * the section text.
   */
  tables_html: LabelTable[] | null
}

export interface LabelTable {
  inline: boolean
  html: string
}

export interface LabelMeta {
  setid: string
  title: string | null
  labeler: string | null
  /** YYYYMMDD */
  effective_time: string | null
  version: string | null
  /** e.g. NDA020357, ANDA202202 */
  application_number: string | null
  brand_name: string | null
  dailymed_url: string
  fetched_at: string | null
}

export interface LabelCandidate {
  setid: string
  labeler: string | null
  effective_time: string | null
}

export interface LabelText {
  label: LabelMeta | null
  sections: LabelSection[]
  /** How many SPL labels are linked to this entity in total. */
  n_labels: number
  /** The next-best ranked labels (up to 4), for "view another manufacturer's label". */
  other_labels: LabelCandidate[]
  note?: string
}

/**
 * Fetch readable label sections.
 * Pass `setid` to show a specific label (e.g. the user picked another
 * manufacturer); otherwise the entity's best-ranked label is used.
 */
export async function getLabelText(slug: string, setid?: string): Promise<LabelText> {
  const { data, error } = await supabase.functions.invoke<LabelText>('label-text', {
    body: setid ? { setid } : { slug },
  })
  if (error) throw new Error(`Failed to load label text for '${slug}': ${error.message}`)
  if (!data) throw new Error(`Empty label response for '${slug}'`)
  return data
}

/** "20260916" → "September 16, 2026" */
export function formatLabelDate(yyyymmdd: string | null | undefined): string | null {
  if (!yyyymmdd || !/^\d{8}$/.test(yyyymmdd)) return null
  const d = new Date(
    Number(yyyymmdd.slice(0, 4)),
    Number(yyyymmdd.slice(4, 6)) - 1,
    Number(yyyymmdd.slice(6, 8)),
  )
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** "NDA020357" → "NDA 020357"; "ANDA202202" → "ANDA 202202 (generic)" */
export function formatApplication(appl: string | null | undefined): string | null {
  if (!appl) return null
  const m = /^(NDA|ANDA|BLA)(\d+)$/i.exec(appl)
  if (!m) return appl
  const kind = m[1].toUpperCase()
  return `${kind} ${m[2]}${kind === 'ANDA' ? ' (generic)' : ''}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Table sanitizer
// ─────────────────────────────────────────────────────────────────────────────
//
// openFDA's *_table fields are HTML fragments from the SPL. They're
// FDA-sourced, but nothing is rendered as HTML without an allowlist pass:
// only table structure and inline emphasis survive, and only colspan/rowspan
// attributes are kept. No dependency needed — the browser's DOMParser does
// the parsing and the allowlist does the rest.

const ALLOWED_TAGS = new Set([
  'TABLE', 'CAPTION', 'COLGROUP', 'COL', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD',
  'P', 'BR', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'SUB', 'SUP', 'UL', 'OL', 'LI',
])
const ALLOWED_ATTRS = new Set(['colspan', 'rowspan'])

export function sanitizeTableHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return ''
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) return ''

  const walk = (el: Element) => {
    for (const original of Array.from(el.children)) {
      let child = original
      // SPL marks emphasis as <content styleCode="bold|italics">; keep it as <strong>/<em>.
      if (child.tagName === 'CONTENT') {
        const style = (child.getAttribute('stylecode') ?? '').toLowerCase()
        const tag = style.includes('bold') ? 'strong' : style.includes('italic') ? 'em' : null
        if (tag) {
          const replacement = doc.createElement(tag)
          replacement.append(...Array.from(child.childNodes))
          child.replaceWith(replacement)
          child = replacement
        }
      }
      if (!ALLOWED_TAGS.has(child.tagName)) {
        // Unwrap unknown elements but keep their text; drop scripts/styles outright.
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META'].includes(child.tagName)) {
          child.remove()
        } else {
          walk(child)
          child.replaceWith(...Array.from(child.childNodes))
        }
        continue
      }
      for (const attr of Array.from(child.attributes)) {
        if (!ALLOWED_ATTRS.has(attr.name.toLowerCase())) child.removeAttribute(attr.name)
      }
      walk(child)
    }
  }
  walk(root)
  return root.innerHTML
}
