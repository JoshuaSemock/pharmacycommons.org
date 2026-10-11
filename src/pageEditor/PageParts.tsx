import type { CSSProperties, ReactNode } from 'react'
import WikiMarkdown from '../components/WikiMarkdown'
import { CiteMark } from '../components/WikiMarkdown'
import type { PageContent } from '../pageContent'
import type { MainItem, ThresholdBlock, ThresholdLine } from '../pageSource'
import type { Reference } from './usePageModel'

/**
 * How the community parts of a page read (docs/page-editor.md §2–§6): the lead,
 * contributor and template sections, structured blocks as tables, and the
 * numbered References list. The locked, ingested sections are rendered by the
 * page itself (DrugDetail); these sit between them in the page's saved order.
 */

const SECTION_HEADING = { fontSize: 'var(--text-xl)', fontFamily: 'var(--font-sans)', lineHeight: 1.25 } as const
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const LINK = `text-ink underline decoration-hepatica-300 underline-offset-2 hover:decoration-hepatica-600 ${FOCUS}`
const ANCHOR_OFFSET = 'scroll-mt-[calc(var(--nav-h,3.5rem)_+_1rem)]'

/** The small [edit] button beside a heading. */
export function EditLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className={`lp-press inline-flex items-center rounded-md px-2 py-0.5 font-sans text-sm text-ink ${FOCUS}`}>
      edit
    </button>
  )
}

export function sectionAnchor(item: Extract<MainItem, { kind: 'section' }>): string {
  return `section-${(item.id ?? item.heading).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

type Shared = {
  content: PageContent | null
  numbers: Map<string, number>
  labelAnchor?: string
}

export function LeadText({ markdown, content, numbers, labelAnchor }: Shared & { markdown: string }) {
  return (
    <div className="max-w-2xl [&>div>p:first-child]:text-lg">
      <WikiMarkdown
        source={markdown}
        links={content?.links ?? new Map()}
        properties={content?.properties ?? new Map()}
        labelAnchor={labelAnchor}
        citations={numbers}
      />
    </div>
  )
}

/** True when a section has nothing written in it (an empty template section). */
export function isEmptySection(item: Extract<MainItem, { kind: 'section' }>): boolean {
  return item.parts.every(p => (p.kind === 'prose' ? !p.markdown.trim() : p.block.lines.length === 0))
}

export function CommunitySection({
  item,
  content,
  numbers,
  labelAnchor,
  onEdit,
  className = '',
  style,
}: Shared & { item: Extract<MainItem, { kind: 'section' }>; onEdit?: () => void; className?: string; style?: CSSProperties }) {
  const id = sectionAnchor(item)
  const empty = isEmptySection(item)
  // Empty sections are hidden from readers; contributors see where to start (docs/page-editor.md §9 Q4).
  if (empty && !onEdit) return null
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={`${className} ${ANCHOR_OFFSET} min-w-0`} style={style}>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={`${id}-heading`} className="font-semibold text-ink" style={SECTION_HEADING}>
          {item.heading}
        </h2>
        {onEdit && <EditLink onClick={onEdit} label={`Edit ${item.heading}`} />}
      </div>
      {empty ? (
        <p className="font-sans text-base text-ink">Nothing here yet.</p>
      ) : (
        <div className="space-y-4">
          {item.parts.map((p, i) =>
            p.kind === 'prose' ? (
              <WikiMarkdown
                key={i}
                source={p.markdown}
                links={content?.links ?? new Map()}
                properties={content?.properties ?? new Map()}
                labelAnchor={labelAnchor}
                citations={numbers}
              />
            ) : (
              <ThresholdTable key={i} block={p.block} numbers={numbers} />
            ),
          )}
        </div>
      )}
    </section>
  )
}

const UNITS: Record<string, { label: string; unit: string }> = {
  egfr: { label: 'eGFR', unit: 'mL/min/1.73 m²' },
  crcl: { label: 'CrCl', unit: 'mL/min' },
}

/** "eGFR 30 to <45 mL/min/1.73 m²", "CrCl <30 mL/min", "On dialysis". */
export function rangeLabel(l: ThresholdLine): string {
  if (l.measure === 'dialysis') return 'On dialysis'
  const m = UNITS[l.measure] ?? { label: l.measure, unit: '' }
  const unit = m.unit ? ` ${m.unit}` : ''
  switch (l.comparator) {
    case '<':
      return `${m.label} <${l.low}${unit}`
    case '<=':
      return `${m.label} ≤${l.low}${unit}`
    case '>':
      return `${m.label} >${l.low}${unit}`
    case '>=':
      return `${m.label} ≥${l.low}${unit}`
    case 'range':
      return `${m.label} ${l.low} to <${l.high}${unit}`
    default:
      return m.label
  }
}

export function ThresholdTable({ block, numbers }: { block: ThresholdBlock; numbers: Map<string, number> }) {
  if (!block.lines.length) return null
  return (
    <div className="overflow-x-auto border-y border-ink/15">
      <table className="w-full border-collapse font-sans text-sm">
        <thead>
          <tr className="border-b border-ink/15">
            <th scope="col" className="px-3 py-2 text-left font-semibold text-ink">
              Kidney function
            </th>
            <th scope="col" className="px-3 py-2 text-left font-semibold text-ink">
              What to do
            </th>
          </tr>
        </thead>
        <tbody>
          {block.lines.map((l, i) => (
            <tr key={i} className="border-b border-ink/15 last:border-0">
              <td className="whitespace-nowrap px-3 py-2 align-top text-ink">{rangeLabel(l)}</td>
              <td className="px-3 py-2 align-top text-ink">
                {l.action}
                <CiteMark keys={l.citations.map(c => c.key)} numbers={numbers} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** One reference, Vancouver/NLM style, with links to where it lives. */
export function referenceParts(r: Reference): { text: string; links: { href: string; label: string }[] } {
  const bits: string[] = []
  if (r.authors) bits.push(r.authors.replace(/\.?$/, '.'))
  if (r.title) bits.push(r.title.replace(/\.?$/, '.'))
  if (r.kind === 'dailymed') {
    bits.push(`DailyMed${r.year ? `, ${r.year}` : ''}.`)
  } else if (r.container) {
    let loc = r.container
    if (r.year) loc += `. ${r.year}`
    if (r.volume) loc += `;${r.volume}`
    if (r.issue) loc += `(${r.issue})`
    if (r.pages) loc += `:${r.pages}`
    bits.push(`${loc}.`)
  } else if (r.year) bits.push(`${r.year}.`)
  const links: { href: string; label: string }[] = []
  const pmid = r.pmid ?? (r.kind === 'pmid' ? r.key.slice(5) : null)
  const doi = r.doi ?? (r.kind === 'doi' ? r.key.slice(4) : null)
  const setid = r.setid ?? (r.kind === 'dailymed' ? r.key.slice(9) : null)
  if (pmid) links.push({ href: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`, label: `PMID ${pmid}` })
  if (doi) links.push({ href: `https://doi.org/${doi}`, label: `doi:${doi}` })
  if (setid) links.push({ href: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setid}`, label: 'DailyMed label' })
  const url = r.url ?? (r.kind === 'url' ? r.key.slice(4) : null)
  if (url && !setid) links.push({ href: url, label: new URL(url).hostname.replace(/^www\./, '') })
  if (!bits.length) bits.push(r.kind === 'url' ? 'Web page.' : `${r.key}.`)
  return { text: bits.join(' '), links }
}

export function ReferencesList({ references }: { references: Reference[] }) {
  if (!references.length) return <p className="font-sans text-base text-ink">No sources cited yet.</p>
  return (
    <ol className="space-y-2 font-sans text-sm leading-relaxed text-ink">
      {references.map(r => {
        const { text, links } = referenceParts(r)
        return (
          <li key={r.ordinal} id={`ref-${r.ordinal}`} className={`${ANCHOR_OFFSET} grid grid-cols-[2rem_minmax(0,1fr)] gap-x-1 [overflow-wrap:anywhere]`}>
            <span className="text-right font-mono">{r.ordinal}.</span>
            <span>
              {text}{' '}
              {links.map((l, i) => (
                <span key={l.href}>
                  {i > 0 && ' · '}
                  <a href={l.href} target="_blank" rel="noopener noreferrer" className={LINK}>
                    {l.label}
                  </a>
                </span>
              ))}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** Section frame matching DrugDetail's PageSection, with an optional [edit] link. */
export function Frame({ id, title, onEdit, children, className = '', style }: { id: string; title: string; onEdit?: () => void; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={`${className} ${ANCHOR_OFFSET} min-w-0`} style={style}>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={`${id}-heading`} className="font-semibold text-ink" style={SECTION_HEADING}>
          {title}
        </h2>
        {onEdit && <EditLink onClick={onEdit} label={`Edit ${title}`} />}
      </div>
      {children}
    </section>
  )
}
