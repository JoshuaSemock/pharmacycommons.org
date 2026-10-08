/**
 * The drug's FDA prescribing information, split into readable sections.
 *
 * Layout, top to bottom:
 *   - Source strip: which label this is, who makes it, when it was revised,
 *     and a DailyMed link. Lets the reader switch to another manufacturer's label.
 *   - Section index (jump links) and a prominent Expand all / Collapse all.
 *   - Boxed warning, if any: a callout whose header (with the warning's own
 *     titles) is always visible; its text expands like any other section.
 *   - Core sections (uses, dosing, contraindications, warnings, side effects,
 *     interactions), then special populations, then reference material.
 *
 * Every section starts collapsed (2026-10-02) so the page doesn't open onto
 * screens of label text; the Quick Facts box on the drug page links straight
 * into the sections that matter most.
 *
 * Data and open/closed state live on the drug page (src/drugPageData.ts,
 * DrugDetail.tsx) because Quick Facts reads the same label and opens
 * sections here. Text is verbatim label language, split on the label's own
 * subsection titles; nothing is paraphrased.
 */

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { formatApplication, formatLabelDate, sanitizeTableHtml } from './labels'
import type { LabelBlock, LabelSection, LabelTable, LabelText } from './labels'
import type { LabelState } from './drugPageData'
import PaperSelect from './components/PaperSelect'

// index.css sizes bare h3/h4 outside Tailwind's layers, which beats utility
// classes — so headings here set size/family inline instead.
const GROUP_HEADING = { fontSize: 'var(--text-base)', fontFamily: 'var(--font-sans)', lineHeight: 1.4 } as const
const BOXED_HEADING = { fontSize: 'var(--text-base)', fontFamily: 'var(--font-sans)', lineHeight: 1.4 } as const
const SUBHEADING = { fontSize: 'var(--text-base)', fontFamily: 'var(--font-sans)', lineHeight: 1.35 } as const

const GROUP_LABELS: Record<'populations' | 'reference', string> = {
  populations: 'Special populations',
  reference: 'Reference',
}

/** DOM id of a section, for jump links from elsewhere on the page. */
export function labelSectionId(key: string): string {
  return `label-${key}`
}

export default function LabelSections({
  slug,
  label,
  open,
  onOpenChange,
}: {
  slug: string
  label: LabelState
  open: ReadonlySet<string>
  onOpenChange: (next: Set<string>) => void
}) {
  const { data, loading, error, pick } = label

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
      <SourceStrip data={data} onPick={pick} />
      <LabelBody sections={data.sections} open={open} onOpenChange={onOpenChange} />
      <p className="px-1 font-sans text-sm leading-relaxed text-ink">
        Text is reproduced from the FDA-approved prescribing information and split into sections for
        reading; it is not a substitute for the full label or for clinical judgment. Always check the
        current label on DailyMed before making prescribing decisions.
      </p>
    </div>
  )
}

// ─── Source strip ─────────────────────────────────────────────────────────────

function SourceStrip({ data, onPick }: { data: LabelText; onPick: (setid: string) => void }) {
  const label = data.label!
  const revised = formatLabelDate(label.effective_time)
  const appl = formatApplication(label.application_number)

  return (
    <div className="border-b border-ink/15 px-1 pb-4">
      <p className="font-sans text-lg font-medium leading-snug text-ink">
        {toTitleCase(label.title ?? label.brand_name ?? 'Prescription drug label')}
      </p>
      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-sans text-sm text-ink">
        {label.labeler && <Meta term="Labeler">{label.labeler.replace(/\s+/g, ' ')}</Meta>}
        {revised && <Meta term="Revised">{revised}</Meta>}
        {appl && <Meta term="Application">{appl}</Meta>}
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <ExternalLink href={label.dailymed_url}>Full label on DailyMed</ExternalLink>
        {data.other_labels.length > 0 && (
          <label className="flex min-w-0 max-w-full flex-wrap items-center gap-2 font-sans text-sm text-ink sm:flex-nowrap">
            <span>
              {data.n_labels > 1 ? `${data.n_labels.toLocaleString()} labels on file ·` : ''} View another
            </span>
            <PaperSelect
              value=""
              onChange={v => v && onPick(v)}
              placeholder="Choose a manufacturer…"
              searchPlaceholder="Search manufacturers"
              menuMinWidth={280}
              options={data.other_labels.map(o => ({
                value: o.setid,
                label: (o.labeler ?? 'Unknown labeler').replace(/\s+/g, ' '),
                sublabel: o.effective_time ? (formatLabelDate(o.effective_time) ?? undefined) : undefined,
              }))}
              className="max-w-[16rem] px-2 py-1 text-sm"
            />
          </label>
        )}
      </div>
    </div>
  )
}

function Meta({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-ink">{term}</dt>
      <dd className="font-medium text-ink">{children}</dd>
    </div>
  )
}

// ─── Body ─────────────────────────────────────────────────────────────────────

function LabelBody({
  sections,
  open,
  onOpenChange,
}: {
  sections: LabelSection[]
  open: ReadonlySet<string>
  onOpenChange: (next: Set<string>) => void
}) {
  const boxed = sections.filter(s => s.group === 'safety')
  const core = sections.filter(s => s.group === 'core')
  const populations = sections.filter(s => s.group === 'populations')
  const reference = sections.filter(s => s.group === 'reference')
  const all = [...boxed, ...core, ...populations, ...reference]
  const jumpable = [...core, ...populations, ...reference]

  const toggle = (key: string, next?: boolean) => {
    const s = new Set(open)
    const shouldOpen = next ?? !s.has(key)
    if (shouldOpen) s.add(key)
    else s.delete(key)
    onOpenChange(s)
  }

  const jumpTo = (key: string) => {
    toggle(key, true)
    requestAnimationFrame(() =>
      document.getElementById(labelSectionId(key))?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }

  const allOpen = all.length > 0 && all.every(s => open.has(s.key))

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <nav aria-label="Label sections" className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {jumpable.map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => jumpTo(s.key)}
              className="lp-raised lp-press rounded-md px-2.5 py-1 font-sans text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40"
            >
              {s.title}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => onOpenChange(allOpen ? new Set() : new Set(all.map(s => s.key)))}
          aria-pressed={allOpen}
          className="lp-toggle flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 font-sans text-base font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40"
        >
          <Chevron open={allOpen} />
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      {boxed.map(s => (
        <BoxedWarning key={s.key} section={s} open={open.has(s.key)} onToggle={() => toggle(s.key)} />
      ))}

      <div>
        {core.map(s => (
          <SectionAccordion key={s.key} section={s} open={open.has(s.key)} onToggle={() => toggle(s.key)} />
        ))}
      </div>

      {(['populations', 'reference'] as const).map(group => {
        const list = group === 'populations' ? populations : reference
        if (list.length === 0) return null
        return (
          <div key={group}>
            <h3 className="px-1 pt-2 pb-2.5 font-semibold text-ink" style={GROUP_HEADING}>
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

/**
 * The boxed warning starts collapsed like every other section, but its header
 * always shows the warning's own titles ("Lactic acidosis"), so the warning is
 * never hidden — only its full text is.
 */
function BoxedWarning({ section, open, onToggle }: { section: LabelSection; open: boolean; onToggle: () => void }) {
  const panelId = `label-panel-${section.key}`
  const titles = section.blocks
    .map(b => b.heading)
    .filter((h): h is string => Boolean(h) && h !== 'Summary')
    .map(h => sentenceCase(h).replace(/^warning:\s*/i, ''))

  return (
    <section
      id={labelSectionId(section.key)}
      aria-label="Boxed warning"
      className="scroll-mt-[calc(var(--nav-h,3.5rem)_+_1rem)] overflow-hidden rounded-md border-2 border-ink"
    >
      <h3 className="m-0" style={{ fontSize: 'inherit', lineHeight: 'inherit', fontFamily: 'inherit' }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-start justify-between gap-3 bg-rose-100 px-5 py-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink/40"
        >
          <span className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5 shrink-0">
              <WarningIcon />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-ink" style={BOXED_HEADING}>
                Boxed warning
              </span>
              {titles.length > 0 && (
                <span className="mt-0.5 block font-sans text-sm leading-snug text-ink">{titles.join(' · ')}</span>
              )}
            </span>
          </span>
          <span className="mt-1 shrink-0 text-ink">
            <Chevron open={open} />
          </span>
        </button>
      </h3>
      {open && (
        <div id={panelId} className="space-y-3 p-5">
          {section.blocks.map((b, i) => (
            <div key={i}>
              {b.heading && (
                <p className="mb-1.5 font-sans text-base font-semibold text-ink">{sentenceCase(b.heading)}</p>
              )}
              <BlockText text={b.text} />
            </div>
          ))}
        </div>
      )}
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
    <section
      id={labelSectionId(section.key)}
      className="scroll-mt-[calc(var(--nav-h,3.5rem)_+_1rem)] py-1"
    >
      <h3 className="m-0" style={{ fontSize: 'inherit', lineHeight: 'inherit', fontFamily: 'inherit' }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="lp-toggle flex w-full items-center justify-between gap-3 rounded-md px-3 py-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink/40"
        >
          <span className="font-sans text-lg text-ink">
            {section.title}
          </span>
          <span className="flex shrink-0 items-center gap-2 font-sans text-sm text-ink">
            {subheads > 1 && <span>{subheads} topics</span>}
            <Chevron open={open} />
          </span>
        </button>
      </h3>
      {open && (
        <div id={panelId} className="space-y-4 px-1 pt-4 pb-6">
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
      <div className="rounded-lg bg-mint-50 px-4 py-3">
        <p className="mb-1.5 font-sans text-sm font-semibold text-ink">At a glance</p>
        <BlockText text={block.text} tables={tables} />
      </div>
    )
  }
  return (
    <div>
      {block.heading && (
        <h4 className="mb-1.5 font-semibold text-ink" style={SUBHEADING}>
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
    <div className="space-y-2 font-sans text-base leading-relaxed text-ink">
      {visible.map((p, i) => {
        if (p.kind === 'list') {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-ink">
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
          className="lp-press inline-flex items-center rounded-md px-2.5 py-1 font-sans text-sm text-ink"
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
  'overflow-x-auto border-y border-ink/15 font-sans text-sm leading-snug text-ink ' +
  '[&_caption]:px-3 [&_caption]:py-2 [&_caption]:text-left [&_caption]:font-semibold ' +
  '[&_table]:w-full [&_table]:border-collapse ' +
  '[&_td]:border-t [&_td]:border-ink/10 [&_td]:px-3 [&_td]:py-1.5 [&_td]:align-top ' +
  '[&_th]:bg-mint-50 [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:align-bottom [&_th]:font-semibold ' +
  '[&_tr:first-child_td]:bg-mint-50 [&_tr:first-child_td]:font-semibold'

function LabelTableView({ html }: { html: string }) {
  const clean = useMemo(() => sanitizeTableHtml(html), [html])
  if (!clean) return null
  return <div className={TABLE_CLASSES} dangerouslySetInnerHTML={{ __html: clean }} />
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function LabelSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading label">
      <div className="lp-raised h-24 animate-pulse rounded-md" />
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="lp-raised h-12 animate-pulse rounded-md" />
      ))}
      <p className="px-1 font-sans text-sm text-ink">
        Loading prescribing information… the first view of a label takes a few seconds.
      </p>
    </div>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="border-l-2 border-ink/25 py-1 pl-4 font-sans text-base leading-relaxed text-ink">
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
      className="lp-press inline-flex items-center rounded-md px-2.5 py-1 font-sans text-sm text-ink"
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
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" className="text-ink">
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
