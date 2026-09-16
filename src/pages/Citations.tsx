import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import PageShell, { RailHeading } from './PageShell'
import { STYLES, formatList, formatPage, formatSource, todayISO } from '../cite'
import type { Style } from '../cite'
import { ALL_SOURCES, SOURCE_GROUPS } from '../sources'
import type { Source } from '../sources'

/**
 * Citations. Style and access date live in the rail and apply to every
 * citation on the page, so a reader picks them once. Below lg the rail stacks
 * above the content, which keeps the style picker ahead of what it controls.
 */
export default function Citations() {
  const [style, setStyle] = useState<Style>('ama')
  const [accessed, setAccessed] = useState(todayISO())
  const { copiedKey, copy } = useCopy()

  const references = useMemo(
    () =>
      ALL_SOURCES.map(source => ({
        source,
        text: formatSource(style, source.id, source.href, source.cite, accessed),
      })),
    [style, accessed],
  )

  const citationFor = useMemo(() => {
    const map = new Map(references.map(r => [r.source.id, r.text]))
    return (id: string) => map.get(id) ?? ''
  }, [references])

  const fullList = useMemo(
    () =>
      formatList(
        style,
        references.map(({ source, text }) => ({
          sortKey: source.cite.kind === 'article' ? source.cite.authors[0] : source.cite.publisher,
          text,
        })),
      ),
    [style, references],
  )

  return (
    <PageShell
      kicker="Citations"
      title="Cite the Commons and its sources"
      lede="Pick a citation style once and every citation on this page follows it. Blank fields are dropped rather than filled with placeholders — check the output against your target journal's instructions before submitting."
      aside={
        <CitationSettings
          style={style}
          onStyle={setStyle}
          accessed={accessed}
          onAccessed={setAccessed}
        />
      }
    >
      <PageCitation style={style} accessed={accessed} copied={copiedKey === 'page'} onCopy={copy} />

      <section className="border-t border-sage-200 py-9">
        <SectionHeading id="references">References</SectionHeading>
        <div className="space-y-3 font-sans text-[14.5px] leading-relaxed text-sage-700">
          <p>
            For anything load-bearing — a dose, a contraindication, an approval date — cite
            the primary record, not this site. These are the datasets the Commons is built
            from. Where a maintainer asks to be cited through a paper, the paper is given
            instead of the website. License terms and what each source feeds are on the{' '}
            <Link to="/resources" className={linkClass}>
              Resources
            </Link>{' '}
            page.
          </p>
          <p>
            Cite Pharmacy Commons itself when you are referencing the aggregation: a derived
            environmental risk quotient, a class grouping, or the structured dataset as a whole.
          </p>
        </div>

        <div className="mt-5">
          <button
            type="button"
            onClick={() => copy('all', fullList)}
            className={buttonClass}
          >
            {copiedKey === 'all' ? 'Copied all references' : `Copy all ${ALL_SOURCES.length} references`}
          </button>
        </div>

        {SOURCE_GROUPS.map(group => (
          <div key={group.id} className="mt-10">
            <h3
              id={group.id}
              className="mb-5 font-display text-[18px] font-semibold leading-snug text-sage-900"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {group.heading}
            </h3>
            <ul className="space-y-7">
              {group.sources.map(source => (
                <ReferenceItem
                  key={source.id}
                  source={source}
                  citation={citationFor(source.id)}
                  copied={copiedKey === source.id}
                  onCopy={copy}
                />
              ))}
            </ul>
          </div>
        ))}
      </section>
    </PageShell>
  )
}

/* ----------------------------------------------------------------- sections */

function PageCitation({
  style,
  accessed,
  copied,
  onCopy,
}: {
  style: Style
  accessed: string
  copied: boolean
  onCopy: (key: string, text: string) => void
}) {
  const [author, setAuthor] = useState('Pharmacy Commons contributors')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [updated, setUpdated] = useState('')

  const citation = useMemo(
    () => formatPage(style, { author, title, url, updated, accessed }),
    [style, author, title, url, updated, accessed],
  )

  return (
    <section className="border-t border-sage-200 py-9">
      <SectionHeading id="cite-a-page">Cite a page from the Commons</SectionHeading>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Author or contributor" hint="Leave the default for community-maintained pages">
          <input type="text" value={author} onChange={e => setAuthor(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Page title">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Metformin hydrochloride"
            className={inputClass}
          />
        </Field>
        <Field label="URL">
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://pharmacycommons.org/drugs/metformin"
            className={inputClass}
          />
        </Field>
        <Field label="Last updated" hint="Shown at the foot of each monograph">
          <input type="date" value={updated} onChange={e => setUpdated(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <div className="mt-7">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="font-sans text-[13px] font-medium text-sage-900">Formatted citation</span>
          <CopyButton copied={copied} disabled={!citation} onClick={() => onCopy('page', citation)} />
        </div>
        <CitationText muted={!citation}>
          {citation || 'Enter a page title or URL to generate a citation.'}
        </CitationText>
      </div>
    </section>
  )
}

function ReferenceItem({
  source,
  citation,
  copied,
  onCopy,
}: {
  source: Source
  citation: string
  copied: boolean
  onCopy: (key: string, text: string) => void
}) {
  return (
    <li className="border-l-2 border-sage-200 pl-4">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <a
          href={source.href}
          target="_blank"
          rel="noreferrer"
          className="font-sans text-[14.5px] font-medium text-sage-900 underline decoration-sage-300 underline-offset-2 hover:decoration-aqua-600"
        >
          {source.name}
        </a>
        {source.license && (
          <span className="rounded border border-sage-200 bg-sage-100 px-1.5 py-0.5 font-mono text-[10px] text-sage-600">
            {source.license}
          </span>
        )}
      </div>
      <p className="mt-1 font-sans text-[14px] leading-relaxed text-sage-600">{source.role}</p>

      <div className="mt-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <CitationText>{citation}</CitationText>
        </div>
        <CopyButton
          copied={copied}
          onClick={() => onCopy(source.id, citation)}
          label={`Copy citation for ${source.name}`}
        />
      </div>
    </li>
  )
}

/* --------------------------------------------------------------------- rail */

function CitationSettings({
  style,
  onStyle,
  accessed,
  onAccessed,
}: {
  style: Style
  onStyle: (style: Style) => void
  accessed: string
  onAccessed: (iso: string) => void
}) {
  return (
    <div className="space-y-7">
      <div>
        <RailHeading>Citation style</RailHeading>
        <div role="radiogroup" aria-label="Citation style" className="flex flex-wrap gap-1.5">
          {STYLES.map(s => {
            const selected = style === s.id
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onStyle(s.id)}
                className={[
                  'rounded-md border px-2.5 py-1 font-sans text-[13px] transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-500',
                  selected
                    ? 'border-aqua-400 bg-aqua-100 text-aqua-700'
                    : 'border-sage-200 bg-white/60 text-sage-600 hover:border-sage-300 hover:text-sage-900',
                ].join(' ')}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="max-w-xs">
        <label htmlFor="citation-accessed" className="mb-3 block font-sans text-[12.5px] font-medium text-sage-900">
          Accessed
        </label>
        <input
          id="citation-accessed"
          type="date"
          value={accessed}
          onChange={e => onAccessed(e.target.value)}
          className={inputClass}
        />
        <span className="mt-1.5 block font-sans text-[11.5px] leading-snug text-sage-600">
          Applies to web citations. Journal articles are cited by DOI and don't take one.
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- pieces */

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="mb-5 font-display text-[22px] font-semibold leading-snug text-sage-900"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {children}
    </h2>
  )
}

function CitationText({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <div className="rounded-lg border border-sage-200 bg-white/70 px-3.5 py-3">
      <p
        className={`whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed ${
          muted ? 'text-sage-600' : 'text-sage-800'
        }`}
      >
        {children}
      </p>
    </div>
  )
}

function CopyButton({
  copied,
  onClick,
  disabled = false,
  label,
}: {
  copied: boolean
  onClick: () => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label && (copied ? label.replace(/^Copy/, 'Copied') : label)}
      className={`${buttonClass} shrink-0`}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-sans text-[12.5px] font-medium text-sage-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block font-sans text-[11.5px] text-sage-600">{hint}</span>}
    </label>
  )
}

/** One "Copied" confirmation at a time, keyed by what was copied. */
function useCopy() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = useCallback(async (key: string, text: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopiedKey(null), 1600)
    } catch {
      setCopiedKey(null)
    }
  }, [])

  return { copiedKey, copy }
}

const inputClass =
  'w-full rounded-lg border border-sage-200 bg-white/70 px-3 py-2 font-sans text-[13.5px] text-sage-900 placeholder-sage-400 outline-none transition-all focus:border-aqua-400 focus:bg-white focus:ring-2 focus:ring-aqua-200'

const buttonClass =
  'rounded-md border border-sage-200 bg-white/60 px-2.5 py-1 font-sans text-[12px] text-sage-600 transition-colors hover:border-sage-300 hover:text-sage-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-500 disabled:opacity-40'

const linkClass =
  'text-aqua-700 underline decoration-aqua-300 underline-offset-2 hover:decoration-aqua-600'
