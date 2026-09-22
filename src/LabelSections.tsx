/**
 * Clinical tab body: the drug's FDA prescribing information, rewritten into
 * readable sections instead of a "label applicable" stub.
 *
 * Layout, top to bottom:
 *   - Source strip: which label this is, who makes it, when it was revised,
 *     and a DailyMed link. Lets the reader switch to another manufacturer's label.
 *   - Boxed warning, if any, as a coral callout that is always open.
 *   - Jump links to each section.
 *   - Core sections (uses, dosing, contraindications, warnings, side effects,
 *     interactions) as accordions; "What it's used for" starts open.
 *   - Special populations, then reference material (pharmacology, overdose,
 *     storage…) collapsed under their own group headings.
 *
 * Data: src/labels.ts → `label-text` edge function. Text is verbatim label
 * language, split on the label's own subsection titles; nothing is paraphrased.
 */

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  formatApplication,
  formatLabelDate,
  getLabelText,
  sanitizeTableHtml,
} from './labels'
import type { LabelBlock, LabelSection, LabelTable, LabelText } from './labels'

const DEFAULT_OPEN = new Set(['indications_and_usage'])

// index.css sizes bare h3/h4 outside Tailwind's layers, which beats utility
// classes — so headings here set size/family inline instead.
const SMALL_CAPS_HEADING = { fontSize: 'var(--text-2xs)', fontFamily: 'var(--font-sans)', lineHeight: 1.4 } as const
const BOXED_HEADING = { fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)', lineHeight: 1.4 } as const
const SUBHEADING = { fontSize: 'var(--text-md)', fontFamily: 'var(--font-sans)', lineHeight: 1.35 } as const

const GROUP_LABELS: Record<'populations' | 'reference', string> = {
  populations: 'Special populations',
  reference: 'Reference',
}

/** Mount with `key={slug}` so a new drug starts fresh on its own best-ranked label. */
export default function LabelSections({ slug }: { slug: string }) {
  const [setid, setSetid] = useState<string | undefined>(undefined)
  const [data, setData] = useState<LabelText | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getLabelText(slug, setid)
      .then(result => {
        if (cancelled) return
        // Picking another manufacturer's label keeps the original ranked list in the picker.
        setData(prev =>
          setid && prev ? { ...result, n_labels: prev.n_labels, other_labels: mergeOthers(prev, result) } : result,
        )
      })
      .catch(err => {
        if (cancelled) return
        console.error(err)
        setError('The label text could not be loaded right now.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug, setid])

  if (loading && !data) return <LabelSkeleton />

  if (error && !data) {
    return (
      <Notice>
        {error} Try again in a moment, or read the full label on{' '}
        <ExternalLink href={`https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${encodeURIComponent(slug)}`}>
          DailyMed
        </ExternalLink>
        .
      </Notice>
    )
  }

  if (!data?.label || data.sections.length === 0) {
    return (
      <Notice>
        {data && data.n_labels > 0
          ? 'This drug has FDA labels on file, but none of them are available as text yet.'
          : 'No FDA prescribing information is linked to this entry.'}{' '}
        {data && data.n_labels > 0 && (
          <>
            You can read them on{' '}
            <ExternalLink href={`https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${encodeURIComponent(slug)}`}>
              DailyMed
            </ExternalLink>
            .
          </>
        )}
      </Notice>
    )
  }

  return (
    <div className={`space-y-5 transition-opacity ${loading ? 'opacity-50' : ''}`} aria-busy={loading}>
      <SourceStrip data={data} onPick={setSetid} />
      <LabelBody sections={data.sections} key={data.label.setid} />
      <p className="px-1 font-sans text-2xs leading-relaxed text-sage-600">
        Text is reproduced from the FDA-approved prescribing information and split into sections for
        reading; it is not a substitute for the full label or for clinical judgment. Always check the
        current label on DailyMed before making prescribing decisions.
      </p>
    </div>
  )
}

/** Keep the original ranked list stable when the user switches labels. */
function mergeOthers(prev: LabelText, next: LabelText) {
  const all = [
    ...(prev.label ? [{ setid: prev.label.setid, labeler: prev.label.labeler, effective_time: prev.label.effective_time }] : []),
    ...prev.other_labels,
  ]
  return all.filter(o => o.setid !== next.label?.setid)
}

// ─── Source strip ─────────────────────────────────────────────────────────────

function SourceStrip({ data, onPick }: { data: LabelText; onPick: (setid: string) => void }) {
  const label = data.label!
  const revised = formatLabelDate(label.effective_time)
  const appl = formatApplication(label.application_number)

  return (
    <div className="rounded-xl border border-sage-200 bg-white px-5 py-4">
      <p className="mb-1 font-sans text-2xs font-semibold uppercase tracking-[0.1em] text-sage-600">
        FDA prescribing information
      </p>
      <p
        className="font-display text-lg leading-snug text-sage-900"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {toTitleCase(label.title ?? label.brand_name ?? 'Prescription drug label')}
      </p>
      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-sans text-sm text-sage-700">
        {label.labeler && <Meta term="Labeler">{label.labeler.replace(/\s+/g, ' ')}</Meta>}
        {revised && <Meta term="Revised">{revised}</Meta>}
        {appl && <Meta term="Application">{appl}</Meta>}
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <ExternalLink href={label.dailymed_url}>Full label on DailyMed</ExternalLink>
        {data.other_labels.length > 0 && (
          <label className="flex items-center gap-2 font-sans text-sm text-sage-600">
            <span>
              {data.n_labels > 1 ? `${data.n_labels.toLocaleString()} labels on file ·` : ''} View another
            </span>
            <select
              className="max-w-[16rem] rounded-md border border-sage-200 bg-sage-50 px-2 py-1 font-sans text-sm text-sage-800"
              value=""
              onChange={e => e.target.value && onPick(e.target.value)}
            >
              <option value="">Choose a manufacturer…</option>
              {data.other_labels.map(o => (
                <option key={o.setid} value={o.setid}>
                  {(o.labeler ?? 'Unknown labeler').replace(/\s+/g, ' ')}
                  {o.effective_time ? ` — ${formatLabelDate(o.effective_time)}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  )
}

function Meta({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-sage-600">{term}</dt>
      <dd className="font-medium text-sage-800">{children}</dd>
    </div>
  )
}

// ─── Body ─────────────────────────────────────────────────────────────────────

function LabelBody({ sections }: { sections: LabelSection[] }) {
  const boxed = sections.filter(s => s.group === 'safety')
  const core = sections.filter(s => s.group === 'core')
  const populations = sections.filter(s => s.group === 'populations')
  const reference = sections.filter(s => s.group === 'reference')
  const jumpable = [...core, ...populations, ...reference]

  const [open, setOpen] = useState<Set<string>>(() => new Set(DEFAULT_OPEN))
  const toggle = (key: string, next?: boolean) =>
    setOpen(prev => {
      const s = new Set(prev)
      const shouldOpen = next ?? !s.has(key)
      if (shouldOpen) s.add(key)
      else s.delete(key)
      return s
    })

  const jumpTo = (key: string) => {
    toggle(key, true)
    requestAnimationFrame(() =>
      document.getElementById(`label-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }

  const allOpen = jumpable.every(s => open.has(s.key))

  return (
    <>
      {boxed.map(s => (
        <BoxedWarning key={s.key} section={s} />
      ))}

      <nav aria-label="Label sections" className="flex flex-wrap items-center gap-1.5">
        {jumpable.map(s => (
          <button
            key={s.key}
            onClick={() => jumpTo(s.key)}
            className="rounded-full border border-sage-200 bg-white px-2.5 py-1 font-sans text-sm text-sage-700 transition-colors hover:border-aqua-300 hover:text-sage-900"
          >
            {s.title}
          </button>
        ))}
        <button
          onClick={() => setOpen(allOpen ? new Set() : new Set(jumpable.map(s => s.key)))}
          className="ml-auto px-1 font-sans text-sm font-medium text-aqua-700 hover:underline"
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </nav>

      <div className="space-y-2.5">
        {core.map(s => (
          <SectionAccordion key={s.key} section={s} open={open.has(s.key)} onToggle={() => toggle(s.key)} />
        ))}
      </div>

      {(['populations', 'reference'] as const).map(group => {
        const list = group === 'populations' ? populations : reference
        if (list.length === 0) return null
        return (
          <div key={group} className="space-y-2.5">
            <h3 className="px-1 pt-2 font-semibold uppercase tracking-[0.1em] text-sage-600" style={SMALL_CAPS_HEADING}>
              {GROUP_LABELS[group]}
            </h3>
            {list.map(s => (
              <SectionAccordion key={s.key} section={s} open={open.has(s.key)} onToggle={() => toggle(s.key)} />
            ))}
          </div>
        )
      })}
    </>
  )
}

function BoxedWarning({ section }: { section: LabelSection }) {
  return (
    <section
      aria-label="Boxed warning"
      className="overflow-hidden rounded-xl border-2 border-coral-400 bg-white"
    >
      <div className="flex items-center gap-2 bg-coral-100 px-5 py-2.5">
        <WarningIcon />
        <h3 className="font-semibold uppercase tracking-[0.08em] text-coral-600" style={BOXED_HEADING}>
          Boxed warning
        </h3>
      </div>
      <div className="space-y-3 p-5">
        {section.blocks.map((b, i) => (
          <div key={i}>
            {b.heading && (
              <p className="mb-1.5 font-sans text-md font-semibold text-sage-900">{sentenceCase(b.heading)}</p>
            )}
            <BlockText text={b.text} />
          </div>
        ))}
      </div>
    </section>
  )
}

function SectionAccordion({
  section,
  open,
  onToggle,
}: {
  section: LabelSection
  open: boolean
  onToggle: () => void
}) {
  const subheads = section.blocks.filter(b => b.heading && b.heading !== 'Summary').length
  const panelId = `label-panel-${section.key}`

  return (
    <section id={`label-${section.key}`} className="scroll-mt-20 overflow-hidden rounded-xl border border-sage-200 bg-white">
      <h3 className="m-0" style={{ fontSize: 'inherit', lineHeight: 'inherit', fontFamily: 'inherit' }}>
        <button
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-sage-50"
        >
          <span className="font-display text-lg text-sage-900" style={{ fontFamily: 'var(--font-display)' }}>
            {section.title}
          </span>
          <span className="flex shrink-0 items-center gap-2 font-sans text-sm text-sage-600">
            {subheads > 1 && <span>{subheads} topics</span>}
            <Chevron open={open} />
          </span>
        </button>
      </h3>
      {open && (
        <div id={panelId} className="space-y-4 border-t border-sage-100 px-5 py-4">
          {section.blocks.map((b, i) => (
            <Block key={i} block={b} tables={section.tables_html} />
          ))}
          <TrailingTables tables={section.tables_html} />
        </div>
      )}
    </section>
  )
}

function Block({ block, tables }: { block: LabelBlock; tables: LabelTable[] | null }) {
  if (block.heading === 'Summary') {
    return (
      <div className="rounded-lg bg-sage-50 px-4 py-3">
        <p className="mb-1.5 font-sans text-2xs font-semibold uppercase tracking-[0.1em] text-sage-600">
          At a glance
        </p>
        <BlockText text={block.text} tables={tables} />
      </div>
    )
  }
  return (
    <div>
      {block.heading && (
        <h4 className="mb-1.5 font-semibold text-sage-900" style={SUBHEADING}>
          {block.heading}
        </h4>
      )}
      <BlockText text={block.text} tables={tables} />
    </div>
  )
}

/**
 * Renders a block's text. The edge function puts each bullet on its own line
 * ("\n• …") and each table on a "[[TABLE:i]]" line; consecutive bullet lines
 * become a list, table lines render the table in place, everything else is a
 * paragraph. Very long blocks are clamped with a "Show more" toggle.
 */
function BlockText({ text, tables = null }: { text: string; tables?: LabelTable[] | null }) {
  const [expanded, setExpanded] = useState(false)
  const parts = useMemo(() => toParts(text), [text])
  const proseLength = parts.reduce((n, p) => n + (p.kind === 'p' ? p.text.length : p.kind === 'list' ? p.items.join('').length : 0), 0)
  const long = proseLength > 1400
  const visible = long && !expanded ? clampParts(parts, 900) : parts

  return (
    <div className="space-y-2 font-sans text-md leading-relaxed text-sage-700">
      {visible.map((p, i) => {
        if (p.kind === 'list') {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-sage-400">
              {p.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          )
        }
        if (p.kind === 'table') {
          const t = tables?.[p.index]
          return t ? <LabelTableView key={i} html={t.html} /> : null
        }
        return <p key={i}>{p.text}</p>
      })}
      {long && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="font-sans text-sm font-medium text-aqua-700 hover:underline"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

type Part =
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; index: number }

function toParts(text: string): Part[] {
  const parts: Part[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const table = /^\[\[TABLE:(\d+)\]\]$/.exec(line)
    if (table) {
      parts.push({ kind: 'table', index: Number(table[1]) })
    } else if (line.startsWith('• ')) {
      const last = parts[parts.length - 1]
      const item = line.slice(2)
      if (last?.kind === 'list') last.items.push(item)
      else parts.push({ kind: 'list', items: [item] })
    } else {
      parts.push({ kind: 'p', text: line })
    }
  }
  return parts
}

/** First ~`budget` characters of prose; tables before the cut stay, tables after it wait for "Show more". */
function clampParts(parts: Part[], budget: number): Part[] {
  const out: Part[] = []
  let used = 0
  for (const p of parts) {
    if (used >= budget) break
    if (p.kind === 'table') {
      out.push(p)
    } else if (p.kind === 'p') {
      const room = budget - used
      out.push(p.text.length > room ? { kind: 'p', text: p.text.slice(0, room).replace(/\s+\S*$/, '') + '…' } : p)
      used += p.text.length
    } else {
      const items: string[] = []
      for (const it of p.items) {
        if (used >= budget) break
        items.push(it)
        used += it.length
      }
      out.push({ kind: 'list', items })
    }
  }
  return out
}

/** Tables the edge function couldn't place inline, shown after the section text. */
function TrailingTables({ tables }: { tables: LabelTable[] | null }) {
  const rest = (tables ?? []).filter(t => !t.inline)
  if (rest.length === 0) return null
  return (
    <div className="space-y-3">
      {rest.map((t, i) => (
        <LabelTableView key={i} html={t.html} />
      ))}
    </div>
  )
}

const TABLE_CLASSES =
  'overflow-x-auto rounded-lg border border-sage-200 bg-white font-sans text-sm leading-snug text-sage-800 ' +
  '[&_caption]:px-3 [&_caption]:py-2 [&_caption]:text-left [&_caption]:font-semibold ' +
  '[&_table]:w-full [&_table]:border-collapse ' +
  '[&_td]:border-t [&_td]:border-sage-100 [&_td]:px-3 [&_td]:py-1.5 [&_td]:align-top ' +
  '[&_th]:bg-sage-50 [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:align-bottom [&_th]:font-semibold ' +
  '[&_tr:first-child_td]:bg-sage-50 [&_tr:first-child_td]:font-semibold'

function LabelTableView({ html }: { html: string }) {
  const clean = useMemo(() => sanitizeTableHtml(html), [html])
  if (!clean) return null
  return <div className={TABLE_CLASSES} dangerouslySetInnerHTML={{ __html: clean }} />
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function LabelSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading label">
      <div className="h-24 animate-pulse rounded-xl bg-sage-100" />
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-sage-100" />
      ))}
      <p className="px-1 font-sans text-sm text-sage-600">
        Loading prescribing information… the first view of a label takes a few seconds.
      </p>
    </div>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-sage-200 bg-white px-5 py-4 font-sans text-md leading-relaxed text-sage-700">
      {children}
    </div>
  )
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-sans text-sm font-medium text-aqua-700 underline-offset-2 hover:underline"
    >
      {children} ↗
    </a>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      className={`transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="M3 5.25L7 9.25L11 5.25" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function WarningIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" className="text-coral-600">
      <path d="M8 1.75L15 14H1L8 1.75Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6.25V9.5M8 11.5V11.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/** "METFORMIN HYDROCHLORIDE TABLETS" → "Metformin Hydrochloride Tablets" (leaves mixed-case titles alone). */
function toTitleCase(s: string): string {
  if (s !== s.toUpperCase()) return s
  return s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\bUsp\b/g, 'USP')
}

/** "WARNING: LACTIC ACIDOSIS" → "Warning: Lactic acidosis" */
function sentenceCase(s: string): string {
  if (s !== s.toUpperCase()) return s
  const lower = s.toLowerCase()
  return lower.replace(/(^|:\s*)([a-z])/g, (_m, pre, c) => pre + c.toUpperCase())
}
