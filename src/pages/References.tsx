import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import PageShell, { RailHeading } from './PageShell'
import { STYLES, formatList, formatPage, formatSource, todayISO } from '../cite'
import type { Style } from '../cite'
import { groupBy, isSourceDataset, journalReference, useReferences } from '../references'
import type { ReferenceResource } from '../references'

/**
 * References (formerly Citations, /citations still redirects here). Style and
 * access date live in the rail and apply to every
 * citation on the page, so a reader picks them once. Below lg the rail stacks
 * above the content, which keeps the style picker ahead of what it controls.
 *
 * Every row of public.references_resources is listed here, grouped by
 * `reference_section`, with the datasets the Commons is built from first in
 * each group and marked. Citations are formatted from the row's structured
 * `cite`; a row without one falls back to its supplied `citation_text`.
 */
export default function References() {
  const [style, setStyle] = useState<Style>('ama')
  const [accessed, setAccessed] = useState(todayISO())
  const { copiedKey, copy } = useCopy()
  const { rows, failed } = useReferences()

  const references = useMemo(
    () =>
      (rows ?? []).map(source => ({
        source,
        text: source.cite
          ? formatSource(style, source.id, source.href, source.cite, accessed)
          : source.citationText ?? '',
      })),
    [rows, style, accessed],
  )

  const groups = useMemo(
    () => (rows ? groupBy(rows, r => r.referenceSection, isSourceDataset) : []),
    [rows],
  )

  const citationFor = useMemo(() => {
    const map = new Map(references.map(r => [r.source.id, r.text]))
    return (id: string) => map.get(id) ?? ''
  }, [references])

  const fullList = useMemo(
    () =>
      formatList(
        style,
        references
          .filter(({ text }) => text)
          .map(({ source, text }) => ({ sortKey: sortKeyFor(source), text })),
      ),
    [style, references],
  )

  return (
    <PageShell
      kicker="References"
      title="Cite the Commons and its sources"
      lede="Pick a citation style once and every citation on this page follows it. Blank fields are dropped rather than filled with placeholders — check the output against your target journal's instructions before submitting."
      contentKey={`references:${groups.length}`}
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
        <SectionHeading id="source-datasets">Sources and references</SectionHeading>
        <div className="space-y-3 font-sans text-md leading-relaxed text-ink">
          <p>
            For anything load-bearing — a dose, a contraindication, an approval date — cite
            the primary record, not this site. Entries marked{' '}
            <span className={sourceBadgeClass}>Source dataset</span> are the datasets the Commons is
            built from; each says what it feeds on this site. The rest are guidelines,
            registries and references we point readers to, also listed by topic on the{' '}
            <Link to="/resources" className={linkClass}>
              Resources
            </Link>{' '}
            page. Where a maintainer asks to be cited through a paper, the paper is given
            instead of the website.
          </p>
          <p>
            Cite Pharmacy Commons itself when you are referencing the aggregation: a derived
            environmental risk quotient, a class grouping, or the structured dataset as a whole.
          </p>
        </div>

        {failed && (
          <p role="alert" className="mt-5 font-sans text-md text-ink">
            The reference list could not be loaded. Refresh the page to try again.
          </p>
        )}

        {!rows && !failed && (
          <p className="mt-5 font-sans text-md text-ink" aria-live="polite">
            Loading references…
          </p>
        )}

        {rows && (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => copy('all', fullList)}
              disabled={!fullList}
              className={buttonClass}
            >
              {copiedKey === 'all' ? 'Copied all references' : `Copy all ${rows.length} references`}
            </button>
          </div>
        )}

        {groups.map(group => (
          <div key={group.id} className="mt-10">
            <h3
              id={group.id}
              className="mb-5 font-display text-lg font-semibold leading-snug text-ink"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {group.heading}
            </h3>
            <ul className="space-y-7">
              {group.items.map(source => (
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

      <Reuse />
    </PageShell>
  )
}

/* ----------------------------------------------------------------- sections */

/** Licensing of what this site publishes. Moved here from Resources. */
function Reuse() {
  return (
    <section className="border-t border-sage-200 py-9">
      <SectionHeading id="reuse">Reuse</SectionHeading>
      <div className="space-y-3 font-sans text-md leading-relaxed text-ink">
        <p>
          The application code is GPL-3.0. Data original to Pharmacy Commons is dedicated to
          the public domain under{' '}
          <a
            href="https://creativecommons.org/publicdomain/zero/1.0/"
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            CC0 1.0
          </a>
          . Third-party data keeps its source license: anything drawn from a source dataset
          marked CC BY-NC 4.0 above still restricts commercial reuse.
        </p>
        <p>
          If you need a dataset export for research, write to{' '}
          <a href="mailto:contact@pharmacycommons.org?subject=Dataset%20request" className={linkClass}>
            contact@pharmacycommons.org
          </a>{' '}
          and say what you intend to do with it.
        </p>
      </div>
    </section>
  )
}

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <span className="font-sans text-sm font-medium text-ink">Formatted citation</span>
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
  source: ReferenceResource
  citation: string
  copied: boolean
  onCopy: (key: string, text: string) => void
}) {
  const journal = journalReference(source)
  const badges = [source.typeBadge, source.licenseBadge, ...source.badges].filter((b): b is string => Boolean(b))
  return (
    <li className="min-w-0 border-l-2 border-sage-200 pl-4">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <a
          href={source.href}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 break-words font-sans text-md font-medium text-ink underline decoration-sage-300 underline-offset-2 hover:decoration-aqua-600"
        >
          {source.name}
        </a>
        {isSourceDataset(source) && (
          <span className={sourceBadgeClass}>Source dataset</span>
        )}
        {badges.map(badge => (
          <span key={badge} className={badgeClass}>
            {badge}
          </span>
        ))}
      </div>
      {source.organization && (
        <p className="mt-0.5 break-words font-sans text-sm text-ink">{source.organization}</p>
      )}
      {source.description && (
        <p className="mt-1 break-words font-sans text-md leading-relaxed text-ink">{source.description}</p>
      )}
      {source.commonsUse && source.commonsUse !== source.description && (
        <p className="mt-1 break-words font-sans text-md leading-relaxed text-ink">
          <span className="font-medium text-ink">Used here for: </span>
          {source.commonsUse}
        </p>
      )}
      {journal && (
        <p className="mt-1 break-words font-sans text-sm text-ink">Published in {journal}</p>
      )}

      {citation && (
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
      )}
    </li>
  )
}

/** First author for articles, corporate author for web citations; APA sorts on it. */
function sortKeyFor(source: ReferenceResource): string {
  if (source.cite?.kind === 'article') return source.cite.authors[0] ?? source.name
  if (source.cite?.kind === 'web') return source.cite.publisher
  return source.organization ?? source.name
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
                  'rounded-md border px-2.5 py-1 font-sans text-sm transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40',
                  selected
                    ? 'border-aqua-400 bg-aqua-100 text-ink'
                    : 'border-sage-200 bg-white/60 text-ink hover:border-sage-300',
                ].join(' ')}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="max-w-xs">
        <label htmlFor="citation-accessed" className="mb-3 block font-sans text-sm font-medium text-ink">
          Accessed
        </label>
        <input
          id="citation-accessed"
          type="date"
          value={accessed}
          onChange={e => onAccessed(e.target.value)}
          className={inputClass}
        />
        <span className="mt-1.5 block font-sans text-2xs leading-snug text-ink">
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
      className="mb-5 font-display text-lg font-semibold leading-snug text-ink"
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
        className={`whitespace-pre-wrap break-words font-mono text-sm leading-relaxed ${
          muted ? 'text-ink' : 'text-ink'
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
      <span className="mb-1.5 block font-sans text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block font-sans text-2xs text-ink">{hint}</span>}
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
  'w-full rounded-lg border border-sage-200 bg-white/70 px-3 py-2 font-sans text-md text-ink placeholder:text-ink outline-none transition-all focus:border-ink/40 focus:bg-white focus:ring-2 focus:ring-ink/20'

const buttonClass =
  'rounded-md border border-sage-200 bg-white/60 px-2.5 py-1 font-sans text-sm text-ink transition-colors hover:border-sage-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40 disabled:opacity-40'

const sourceBadgeClass =
  'rounded border border-mint-300 bg-mint-100 px-1.5 py-0.5 font-mono text-xs text-ink'

const badgeClass =
  'rounded border border-sage-200 bg-sage-100 px-1.5 py-0.5 font-mono text-xs text-ink'

const linkClass =
  'text-ink underline decoration-aqua-300 underline-offset-2 hover:decoration-aqua-600'
