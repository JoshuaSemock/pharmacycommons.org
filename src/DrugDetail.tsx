import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getDrugBySlug } from './api'
import type {
  BrandName,
  DrugComponent,
  DrugDetail as DrugDetailType,
  EntityClass,
  EntityList,
  HierarchyMember,
} from './api.generated'
import { ECO_RISK_COLORS } from './data'
import type { EcoRisk } from './data'
import { authErrorMessage, isEntitySaved, saveEntity, unsaveEntity, useSession } from './auth'
import LabelSections, { labelSectionId } from './LabelSections'
import { getGuidelines } from './guidelines'
import type { Guideline } from './guidelines'
import { sourcedValue } from './identifiers'
import type { Segment } from './identifiers'
import type { LabelSection } from './labels'
import { formatBrandName, formatDrugName } from './names'
import MachinePanels from './MachinePanels'
import OpenSection from './OpenSection'
import { isAbort, useEntityClasses, useEntityLists, useLabelText } from './drugPageData'
import type { LabelState, Loadable } from './drugPageData'

// ─── Page layout (2026-10-02) ─────────────────────────────────────────────────
//
// Header: name + INN on the left, Save on the right; entity type; brand names.
// (The one-line description moved into the Overview on 2026-10-04.)
//
// Reading order (phones stack exactly this way):
//   1. Jump to FDA prescribing information
//   2. Quick Facts (infobox: indications, dosing, contraindications, boxed
//      warning, FDA pharmacologic class, legal status, four key lists)
//   3. Overview — the open, community-written section (OpenSection.tsx,
//      phase 15): description, markdown body with [[links]] and {{values}},
//      review status, What links here. Everything after it is ingest-owned.
//   4. Drug hierarchy (moiety → precise forms → brand formulations → combinations)
//   5. FDA prescribing information (every section collapsed, Expand all)
//   6. Identifiers (PCID, CAS, UNII, InChIKey, LactMed, Georgia statute, then others)
//   7. Clinical guidelines (collapsed)
//   8. Classifications (FDA MOA, PE and chemical structure first, then the rest)
//   9. Lists
//  10. Additional metadata / machine-readable
//
// Desktop: 1, 2 and 6 sit in a sticky left rail so Quick Facts and the
// identifiers stay on screen while the label scrolls; everything else runs
// down the main column in order. Both columns are `display: contents` below
// lg, which lets the `order-*` classes interleave them into the single
// stacked order above.
//
// Data: the drug record loads first; the label, classes and lists each load
// in their own request (src/drugPageData.ts) and are shared by Quick Facts
// and the full sections, so nothing is fetched twice. Every request is
// cancelled with an AbortController when the reader leaves the drug.

// Headings set size inline: index.css sizes bare h2/h3 outside Tailwind's
// layers, which beats utility classes (docs/design-system.md §4).
const SECTION_HEADING = { fontSize: 'var(--text-xl)', fontFamily: 'var(--font-sans)', lineHeight: 1.25 } as const
const RAIL_HEADING = { fontSize: 'var(--text-lg)', fontFamily: 'var(--font-sans)', lineHeight: 1.3 } as const
const GROUP_HEADING = { fontSize: 'var(--text-base)', fontFamily: 'var(--font-sans)', lineHeight: 1.4 } as const

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const STAMP_LINK = `lp-raised lp-press rounded-md text-ink ${FOCUS}`

/** Clears the sticky nav when the page scrolls to an anchor. */
const ANCHOR_OFFSET = 'scroll-mt-[calc(var(--nav-h,3.5rem)_+_1rem)]'

const LABEL_ANCHOR = 'prescribing-information'

// ─── Defensive shapes ─────────────────────────────────────────────────────────
//
// api.generated.ts types `attributes` as Record<string, unknown> and the eco
// fields loosely; values are normalized here at runtime rather than cast.

type EcoLike = {
  rq_value?: number | null
  rq_category?: string | null
  dpd_category?: string | null
  dpd_days?: number | null
  excretion_route?: string | null
  primary_concern?: string | null
}

const ECO_RISK_KEYS: readonly string[] = ['negligible', 'low', 'moderate', 'high']

function toRiskKey(value: unknown): EcoRisk | null {
  return typeof value === 'string' && ECO_RISK_KEYS.includes(value) ? (value as EcoRisk) : null
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** An attribute as display text, or null when absent/blank. */
function attr(drug: DrugDetailType, label: string): string | null {
  const v = drug.attributes?.[label]
  if (v === null || v === undefined) return null
  const text = Array.isArray(v) ? v.map(String).join(', ') : String(v)
  return text.trim() ? text.trim() : null
}

// ─── Route component ──────────────────────────────────────────────────────────

export default function DrugDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [drug, setDrug] = useState<DrugDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    window.scrollTo(0, 0)

    getDrugBySlug(slug, { signal: controller.signal })
      .then(data => {
        if (data) {
          setDrug(data)
        } else {
          setDrug(null)
          setError(`Drug "${slug}" not found`)
        }
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbort(err)) return
        console.error(err)
        setDrug(null)
        setError('Failed to load drug details')
        setLoading(false)
      })

    return () => controller.abort()
  }, [slug])

  useEffect(() => {
    document.title = drug ? `${formatDrugName(drug.name)} · Pharmacy Commons` : 'Pharmacy Commons'
  }, [drug])

  if (loading) {
    return <div className="flex justify-center py-32 font-sans text-ink">Loading…</div>
  }

  if (error || !drug) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <p className="mb-2 font-sans text-xl text-ink">{error || 'Drug not found'}</p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className={`font-sans text-base text-ink hover:underline ${FOCUS}`}
        >
          Return to search
        </button>
      </div>
    )
  }

  // Keyed by slug so every per-drug request and the open/closed label state start fresh.
  return <DrugPage key={drug.slug} drug={drug} />
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function DrugPage({ drug }: { drug: DrugDetailType }) {
  const label = useLabelText(drug.slug)
  const classes = useEntityClasses(drug.pcid_code)
  const lists = useEntityLists(drug.pcid_code)
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set())

  /** Open one label section and scroll to it (Quick Facts links). */
  const openLabelSection = useCallback((key: string) => {
    setOpenSections(prev => (prev.has(key) ? prev : new Set(prev).add(key)))
    requestAnimationFrame(() =>
      document.getElementById(labelSectionId(key))?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }, [])

  const name = formatDrugName(drug.name)

  return (
    <div className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 py-4 font-sans text-sm text-ink">
        <Link to="/" className={`hover:underline ${FOCUS}`}>
          Browse
        </Link>
        <span aria-hidden="true">/</span>
        <span className="min-w-0 truncate font-medium text-ink">{name}</span>
      </nav>

      <DrugHeader drug={drug} />

      <div className="flex flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <aside
          aria-label="Quick reference"
          className="contents lg:sticky lg:top-[calc(var(--nav-h,3.5rem)_+_1.5rem)] lg:block lg:max-h-[calc(100vh_-_var(--nav-h,3.5rem)_-_3rem)] lg:space-y-8 lg:overflow-y-auto lg:overscroll-contain lg:pr-2 lg:pb-2"
        >
          <div className="order-1 min-w-0">
            <JumpToLabel />
          </div>
          <div className="order-2 min-w-0">
            <QuickFacts drug={drug} label={label} classes={classes} lists={lists} onOpenSection={openLabelSection} />
          </div>
          <div className="order-6 min-w-0">
            <IdentifiersSection drug={drug} />
          </div>
        </aside>

        <div className="contents lg:block lg:min-w-0 lg:space-y-12">
          <OpenSection
            pcidCode={drug.pcid_code}
            name={name}
            fallbackDescription={drug.description ?? null}
            labelAnchor={LABEL_ANCHOR}
            className="order-3"
          />

          <HierarchySection drug={drug} name={name} className="order-4" />

          <PageSection id={LABEL_ANCHOR} title="FDA prescribing information" className="order-5">
            <LabelSections slug={drug.slug} label={label} open={openSections} onOpenChange={setOpenSections} />
          </PageSection>

          <GuidelinesSection pcidCode={drug.pcid_code} className="order-7" />
          <ClassificationsSection classes={classes} className="order-8" />
          <ListsSection lists={lists} className="order-9" />
          <MetadataSection drug={drug} className="order-10" />
        </div>
      </div>
    </div>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────

function DrugHeader({ drug }: { drug: DrugDetailType }) {
  return (
    <header className="mb-8 border-b border-ink/15 pb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="min-w-0 font-sans font-semibold leading-tight text-ink [overflow-wrap:anywhere]">
            {formatDrugName(drug.name)}
          </h1>
          <span className="lp-raised shrink-0 rounded px-2 py-0.5 font-mono text-sm text-ink">INN</span>
        </div>
        <div className="shrink-0">
          <SaveButton pcidCode={drug.pcid_code} slug={drug.slug} name={drug.name} entityType={drug.entity_type ?? null} />
        </div>
      </div>

      <p className="mt-1 font-sans text-lg text-ink">{drug.entity_type}</p>

      <BrandLine brands={drug.brands ?? []} />
    </header>
  )
}

const BRAND_PREVIEW = 8

function brandHref(b: BrandName): string | null {
  const appl = b.appl_nos[0]?.replace(/^(NDA|BLA)/i, '')
  return appl && /^\d{6}$/.test(appl)
    ? `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${appl}`
    : null
}

/** Every brand name, alphabetical, one style. Brands approved under an NDA/BLA link to Drugs@FDA. */
function BrandLine({ brands }: { brands: BrandName[] }) {
  const [showAll, setShowAll] = useState(false)
  if (brands.length === 0) return null
  const visible = showAll ? brands : brands.slice(0, BRAND_PREVIEW)

  return (
    <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
      <span className="font-sans text-sm font-medium text-ink">Brand names</span>
      {visible.map(b => {
        const href = brandHref(b)
        const text = formatBrandName(b.name)
        return href ? (
          <a
            key={b.name}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={`${text} on Drugs@FDA`}
            className={`${STAMP_LINK} px-2 py-0.5 font-sans text-sm`}
          >
            {text}
          </a>
        ) : (
          <span key={b.name} className="lp-raised rounded-md px-2 py-0.5 font-sans text-sm text-ink">
            {text}
          </span>
        )
      })}
      {brands.length > BRAND_PREVIEW && (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className={`font-sans text-sm font-medium text-ink hover:underline ${FOCUS}`}
        >
          {showAll ? 'Show fewer' : `Show all ${brands.length}`}
        </button>
      )}
    </div>
  )
}

// ─── Save button ──────────────────────────────────────────────────────────────
//
// Signed-out users see nothing (bookmarking needs an account). Signed-in users
// get a toggle that upserts/deletes a row in saved_entities (src/auth.ts). While
// the saved state is being checked a same-sized placeholder holds the space.

function SaveButton({
  pcidCode,
  slug,
  name,
  entityType,
}: {
  pcidCode: string
  slug: string
  name: string
  entityType: string | null
}) {
  const { user } = useSession()
  const [saved, setSaved] = useState(false)
  const [checking, setChecking] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setChecking(false)
      return
    }
    // isEntitySaved takes no signal; the controller just marks the answer stale.
    const controller = new AbortController()
    setChecking(true)
    isEntitySaved(pcidCode)
      .then(result => {
        if (!controller.signal.aborted) setSaved(result)
      })
      .catch(() => {
        // A failed status check leaves the button in its unsaved state.
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false)
      })
    return () => controller.abort()
  }, [user, pcidCode])

  if (!user) return null
  if (checking) return <div className="lp-raised h-8 w-20 animate-pulse rounded-md motion-reduce:animate-none" aria-hidden="true" />

  async function toggle() {
    setError(null)
    setPending(true)
    try {
      if (saved) {
        await unsaveEntity(pcidCode)
        setSaved(false)
      } else {
        await saveEntity({ pcid_code: pcidCode, slug, name, entity_type: entityType })
        setSaved(true)
      }
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={saved}
        title={saved ? 'Remove from saved pages' : 'Save this page to your account'}
        className={`lp-toggle flex items-center gap-1.5 rounded-md px-3 py-1.5 font-sans text-sm font-medium text-ink disabled:opacity-50 ${FOCUS}`}
      >
        <BookmarkIcon filled={saved} />
        {saved ? 'Saved' : 'Save'}
      </button>
      {error && <p className="max-w-[14rem] text-right font-sans text-sm text-ink">{error}</p>}
    </div>
  )
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M3.5 2.5C3.5 2.22386 3.72386 2 4 2H10C10.2761 2 10.5 2.22386 10.5 2.5V11.5L7 9.25L3.5 11.5V2.5Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ─── 1. Jump to the label ─────────────────────────────────────────────────────

function JumpToLabel() {
  return (
    <a
      href={`#${LABEL_ANCHOR}`}
      onClick={e => {
        e.preventDefault()
        document.getElementById(LABEL_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }}
      className={`${STAMP_LINK} flex items-center justify-between gap-3 px-4 py-3 font-sans text-base font-medium`}
    >
      Jump to FDA prescribing information
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
        <path d="M7 2.5V11M3 7.25L7 11.25L11 7.25" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  )
}

// ─── 2. Quick Facts ───────────────────────────────────────────────────────────
//
// A wiki-style infobox. Label facts are drawn from the label text itself and
// stay verbatim: the indication's first sentence, the dosing section's own
// subsection titles (never a clipped dose), the first contraindications, and
// the boxed warning's titles. Each opens its full section in the label.

const QUICK_LISTS: { slug: string; term: string }[] = [
  { slug: 'most-used-drugs-us', term: 'Most used' },
  { slug: 'do-not-crush', term: 'Do not crush' },
  { slug: 'anticholinergic-burden', term: 'ACB score' },
  { slug: 'arrhythmia-risk', term: 'QTc risk' },
]

function QuickFacts({
  drug,
  label,
  classes,
  lists,
  onOpenSection,
}: {
  drug: DrugDetailType
  label: LabelState
  classes: Loadable<EntityClass[]>
  lists: Loadable<EntityList[]>
  onOpenSection: (key: string) => void
}) {
  const labelLoading = label.loading && !label.data
  const sections = label.data?.label ? label.data.sections : []
  const noLabel = !labelLoading && sections.length === 0
  const find = (key: string) => sections.find(s => s.key === key)

  const labelFact = (key: string, render: (s: LabelSection) => ReactNode, absent: string) => {
    if (labelLoading) return <FactSkeleton />
    if (noLabel) return <span>No label text on file</span>
    const s = find(key)
    if (!s) return <span>{absent}</span>
    return (
      <>
        {render(s)}
        <MoreButton onClick={() => onOpenSection(key)} />
      </>
    )
  }

  const boxed = find('boxed_warning')
  const legal = [attr(drug, 'Rx status'), attr(drug, 'Legal status'), attr(drug, 'FDA marketing status')]
    .filter((v, i, all): v is string => v !== null && all.indexOf(v) === i)

  return (
    <section aria-labelledby="quick-facts-heading" className="lp-raised rounded-md">
      <h2 id="quick-facts-heading" className="lp-rule-b px-4 py-3 font-semibold text-ink" style={RAIL_HEADING}>
        Quick facts
      </h2>
      <dl className="lp-divide-y">
        <Fact term="Indications">
          {labelFact('indications_and_usage', s => <span>{firstSentence(sectionText(s), 200)}</span>, 'Not in this label')}
        </Fact>
        <Fact term="Dosing">
          {labelFact('dosage_and_administration', s => <span>{topicLine(s)}</span>, 'Not in this label')}
        </Fact>
        <Fact term="Contraindications">
          {labelFact('contraindications', s => <Contraindications section={s} />, 'Not in this label')}
        </Fact>
        <Fact term="Boxed warning">
          {labelLoading ? (
            <FactSkeleton />
          ) : noLabel ? (
            <span>No label text on file</span>
          ) : boxed ? (
            <>
              <span className="font-medium">{boxedTitles(boxed).join(' · ') || 'Yes'}</span>
              <MoreButton onClick={() => onOpenSection('boxed_warning')} />
            </>
          ) : (
            <span>None in this label</span>
          )}
        </Fact>
        <Fact term="Pharmacologic class (FDA)">
          <EpcClasses classes={classes} />
        </Fact>
        <Fact term="Legal status">
          {legal.length === 0 ? (
            <span>Not recorded</span>
          ) : (
            <span className="block space-y-0.5">
              {legal.map(v => (
                <span key={v} className="block">
                  {v}
                </span>
              ))}
            </span>
          )}
        </Fact>
        {QUICK_LISTS.map(q => (
          <Fact key={q.slug} term={q.term}>
            <KeyListFact slug={q.slug} lists={lists} />
          </Fact>
        ))}
      </dl>
    </section>
  )
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 px-4 py-2.5">
      <dt className="font-sans text-sm font-semibold leading-snug text-ink">{term}</dt>
      <dd className="min-w-0 font-sans text-sm leading-snug text-ink [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

function MoreButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-1 block font-sans text-sm font-medium text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink ${FOCUS}`}
    >
      Read in label ↓
    </button>
  )
}

function Contraindications({ section }: { section: LabelSection }) {
  const items = bulletItems(sectionText(section))
  if (items.length === 0) return <span>{firstSentence(sectionText(section), 160)}</span>
  const shown = items.slice(0, 3)
  return (
    <span className="block">
      <ul className="list-disc space-y-0.5 pl-4 marker:text-ink">
        {shown.map((item, i) => (
          <li key={i}>{firstSentence(item, 90)}</li>
        ))}
      </ul>
      {items.length > shown.length && <span className="mt-0.5 block">and {items.length - shown.length} more</span>}
    </span>
  )
}

function EpcClasses({ classes }: { classes: Loadable<EntityClass[]> }) {
  if (classes.failed) return <span>Couldn’t load classes</span>
  if (!classes.data) return <FactSkeleton />
  const epc = classes.data.filter(c => c.class_type === 'epc' && c.is_direct)
  if (epc.length === 0) return <span>None assigned</span>
  return (
    <span className="flex flex-wrap gap-1.5">
      {epc.map(c => (
        <Link key={c.slug} to={`/classifications/${c.slug}`} className={`${STAMP_LINK} px-2 py-0.5 font-sans text-sm leading-snug`}>
          {c.name}
        </Link>
      ))}
    </span>
  )
}

function KeyListFact({ slug, lists }: { slug: string; lists: Loadable<EntityList[]> }) {
  if (lists.failed) return <span>Couldn’t load lists</span>
  if (!lists.data) return <FactSkeleton />
  const entry = lists.data.find(l => l.slug === slug)
  if (!entry) return <span>Not listed</span>

  let main: string
  let detail: string | null = null
  switch (slug) {
    case 'most-used-drugs-us':
      main = entry.rank !== null ? `#${entry.rank}` : 'Listed'
      break
    case 'do-not-crush':
      main = entry.legal_status ?? 'Listed'
      detail = entry.note ?? null
      break
    case 'anticholinergic-burden':
      main = entry.value !== null ? `Score ${entry.value}` : 'Listed'
      break
    default:
      main = entry.legal_status ? entry.legal_status.split(/\s*;\s*/).join(' · ') : 'Listed'
  }

  return (
    <span className="block">
      <Link to={`/lists/${slug}`} className={`${STAMP_LINK} inline-block px-2 py-0.5 font-sans text-sm leading-snug`}>
        {main}
      </Link>
      {detail && <span className="mt-1 block">{detail}</span>}
      {entry.via_name && <span className="mt-1 block">as {formatDrugName(entry.via_name)}</span>}
    </span>
  )
}

function FactSkeleton() {
  return <span className="block h-4 w-3/4 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" aria-hidden="true" />
}

// Label text helpers — the edge function marks bullets "• " and tables "[[TABLE:i]]".

function sectionText(section: LabelSection): string {
  return section.blocks.map(b => b.text).join('\n')
}

function bulletItems(text: string): string[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('• '))
    .map(l => l.slice(2).trim())
    .filter(Boolean)
}

/** The first sentence of the first prose line, cut at a word boundary when longer than `max`. */
function firstSentence(text: string, max: number): string {
  const line =
    text
      .split('\n')
      .map(l => l.trim().replace(/^•\s*/, ''))
      .find(l => l && !/^\[\[TABLE:\d+\]\]$/.test(l)) ?? ''
  const sentence = /^(.+?[.;])(\s|$)/.exec(line)?.[1] ?? line
  if (sentence.length <= max) return sentence
  return sentence.slice(0, max).replace(/\s+\S*$/, '') + '…'
}

/** The dosing section's own subsection titles, or a pointer to it when it has none. */
function topicLine(section: LabelSection): string {
  const topics = section.blocks
    .map(b => b.heading)
    .filter((h): h is string => Boolean(h) && h !== 'Summary')
  if (topics.length === 0) return 'See the dosing section of the label.'
  const shown = topics.slice(0, 4)
  return shown.join(' · ') + (topics.length > shown.length ? ` · and ${topics.length - shown.length} more` : '')
}

function boxedTitles(section: LabelSection): string[] {
  return section.blocks
    .map(b => b.heading)
    .filter((h): h is string => Boolean(h) && h !== 'Summary')
    .map(h => {
      const t = h.replace(/^warning(s)?:\s*/i, '').trim()
      return t === t.toUpperCase() ? titleCase(t.toLowerCase()) : t
    })
}

// ─── 3. Drug hierarchy ────────────────────────────────────────────────────────
//
// The moiety and what nests under it: precise salt/base forms (block 3),
// single-ingredient brand formulations (block 4) and combination products
// (block 2), from moiety_hierarchy. A combination's page shows its component
// moieties instead.

const HIERARCHY_PREVIEW = 6

function HierarchySection({ drug, name, className }: { drug: DrugDetailType; name: string; className: string }) {
  const h = drug.hierarchy
  const components = drug.components ?? []

  if (!h) {
    if (components.length === 0) return null
    return (
      <PageSection id="hierarchy" title="Drug hierarchy" className={className}>
        <HierarchyGroup label="Active moieties">
          <TileGrid
            items={components}
            render={(c: DrugComponent) => <MemberTile key={c.pcid_code} slug={c.slug} name={formatDrugName(c.name)} pcid={c.pcid_code} note={c.role_note ?? null} />}
          />
        </HierarchyGroup>
      </PageSection>
    )
  }

  return (
    <PageSection id="hierarchy" title="Drug hierarchy" className={className}>
      <div className="space-y-6">
        <HierarchyGroup label="Base moiety">
          <div className="lp-sunken max-w-sm rounded-md px-3 py-2" aria-current="page">
            <span className="block font-sans text-base font-medium leading-snug text-ink">{name}</span>
            <span className="mt-0.5 block font-mono text-sm text-ink">{drug.pcid_code}</span>
          </div>
        </HierarchyGroup>
        <MemberGroup label="Precise salt and base forms" members={h.precise_forms} />
        <MemberGroup label="Brand formulations" members={h.formulations ?? []} brand />
        <MemberGroup label="Combination products" members={h.combinations} />
      </div>
    </PageSection>
  )
}

function HierarchyGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 font-semibold text-ink" style={GROUP_HEADING}>
        {label}
      </h3>
      {children}
    </div>
  )
}

function MemberGroup({ label, members, brand = false }: { label: string; members: HierarchyMember[]; brand?: boolean }) {
  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  return (
    <HierarchyGroup label={`${label}${sorted.length > 0 ? ` (${sorted.length})` : ''}`}>
      {sorted.length === 0 ? (
        <p className="font-sans text-sm text-ink">None recorded.</p>
      ) : (
        <TileGrid
          items={sorted}
          render={(m: HierarchyMember) => {
            const display = brand ? formatBrandName(m.name) : formatDrugName(m.name)
            const brands = (m.brands ?? []).map(formatBrandName).filter(b => b !== display)
            return (
              <MemberTile
                key={m.pcid_code}
                slug={m.slug}
                name={display}
                pcid={m.pcid_code}
                note={brands.length > 0 ? brands.join(', ') : null}
              />
            )
          }}
        />
      )}
    </HierarchyGroup>
  )
}

function TileGrid<T>({ items, render }: { items: T[]; render: (item: T) => ReactNode }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? items : items.slice(0, HIERARCHY_PREVIEW)
  return (
    <div>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((item, i) => (
          <li key={i} className="min-w-0">
            {render(item)}
          </li>
        ))}
      </ul>
      {items.length > HIERARCHY_PREVIEW && (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className={`mt-2 font-sans text-sm font-medium text-ink hover:underline ${FOCUS}`}
        >
          {showAll ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </div>
  )
}

function MemberTile({ slug, name, pcid, note }: { slug: string; name: string; pcid: string; note: string | null }) {
  return (
    <Link to={`/drugs/${slug}`} className={`${STAMP_LINK} block h-full min-w-0 px-3 py-2`}>
      <span className="block font-sans text-base font-medium leading-snug text-ink [overflow-wrap:anywhere]">{name}</span>
      {note && <span className="mt-0.5 block font-sans text-sm leading-snug text-ink">{note}</span>}
      <span className="mt-0.5 block font-mono text-sm text-ink">{pcid}</span>
    </Link>
  )
}

// ─── 5. Identifiers ───────────────────────────────────────────────────────────
//
// External registry keys in a fixed order, each value an embossed stamp that
// opens the source record (src/identifiers.ts builds the links). Rows with no
// value say so rather than disappearing, so the order never shifts.

const IDENTIFIER_ROWS: { label: string; source: string; attr: string | null }[] = [
  { label: 'PCID', source: 'Pharmacy Commons', attr: null },
  { label: 'CAS', source: 'Common Chemistry', attr: 'CAS number' },
  { label: 'UNII', source: 'FDA', attr: 'UNII' },
  { label: 'InChIKey', source: 'PubChem', attr: 'InChIKey' },
  { label: 'LactMed', source: 'NLM', attr: 'LactMed ID' },
  { label: 'Statute', source: 'Georgia', attr: 'Statute citation' },
]

const EXTRA_IDENTIFIERS: { label: string; source: string; attr: string }[] = [
  { label: 'DrugBank', source: 'DrugBank', attr: 'DrugBank ID' },
  { label: 'FDA applications', source: 'Drugs@FDA', attr: 'FDA applications' },
  { label: 'NDC', source: 'DailyMed', attr: 'NDC codes' },
]

function IdentifiersSection({ drug }: { drug: DrugDetailType }) {
  const ndc = drug.fda_ndc_codes?.length ? drug.fda_ndc_codes.join(', ') : null
  const value = (key: string) => (key === 'NDC codes' ? ndc : attr(drug, key))
  const extras = EXTRA_IDENTIFIERS.filter(r => value(r.attr) !== null)

  return (
    <section aria-labelledby="identifiers-heading" id="identifiers" className={ANCHOR_OFFSET}>
      <h2 id="identifiers-heading" className="mb-3 font-semibold text-ink" style={RAIL_HEADING}>
        Identifiers
      </h2>
      <dl className="space-y-3">
        {IDENTIFIER_ROWS.map(r =>
          r.attr === null ? (
            <IdentifierRow key={r.label} label={r.label} source={r.source}>
              <Link to={`/id/${drug.pcid_code}`} title="Permanent link" className={`${STAMP_LINK} inline-block px-2 py-0.5 font-mono text-sm`}>
                {drug.pcid_code}
              </Link>
            </IdentifierRow>
          ) : (
            <IdentifierRow key={r.label} label={r.label} source={r.source}>
              <IdentifierValue attrKey={r.attr} value={value(r.attr)} name={drug.name} />
            </IdentifierRow>
          ),
        )}
        {extras.map(r => (
          <IdentifierRow key={r.label} label={r.label} source={r.source}>
            <IdentifierValue attrKey={r.attr} value={value(r.attr)} name={drug.name} />
          </IdentifierRow>
        ))}
      </dl>
    </section>
  )
}

function IdentifierRow({ label, source, children }: { label: string; source: string; children: ReactNode }) {
  return (
    <div>
      <dt className="mb-1 flex items-baseline justify-between gap-2 font-sans text-sm text-ink">
        <span className="font-semibold">{label}</span>
        <span className="shrink-0">{source}</span>
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

function IdentifierValue({ attrKey, value, name }: { attrKey: string; value: string | null; name: string }) {
  if (!value) return <span className="font-sans text-sm text-ink">Not recorded</span>
  const { source, segments } = sourcedValue(attrKey, value, { name })
  const parts = segments.filter((s: Segment) => s.href || s.text.replace(/[,;\s]/g, ''))
  return (
    <span className="flex flex-wrap items-baseline gap-1.5 font-mono text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">
      {parts.map((seg, i) =>
        seg.href ? (
          <a
            key={i}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            title={source ? `Open in ${source}` : undefined}
            className={`${STAMP_LINK} inline-block max-w-full px-2 py-0.5`}
          >
            {seg.text}
          </a>
        ) : (
          <span key={i} className="min-w-0">
            {seg.text.trim()}
          </span>
        ),
      )}
    </span>
  )
}

// ─── 6. Clinical guidelines ───────────────────────────────────────────────────

function GuidelinesSection({ pcidCode, className }: { pcidCode: string; className: string }) {
  const [guidelines, setGuidelines] = useState<Guideline[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setGuidelines(null)
    setFailed(false)
    getGuidelines(pcidCode, { signal: controller.signal })
      .then(setGuidelines)
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbort(err)) return
        console.error(err)
        setFailed(true)
      })
    return () => controller.abort()
  }, [pcidCode])

  const count = guidelines?.length ?? null
  const panelId = 'guidelines-panel'

  return (
    <section aria-labelledby="guidelines-heading" id="guidelines" className={`${className} ${ANCHOR_OFFSET} min-w-0 border-y border-ink/15`}>
      <h2 id="guidelines-heading" className="m-0" style={{ fontSize: 'inherit', lineHeight: 'inherit', fontFamily: 'inherit' }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-3 py-3.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink/40"
        >
          <span className="font-semibold text-ink" style={SECTION_HEADING}>
            Clinical guidelines
          </span>
          <span className="flex shrink-0 items-center gap-2 font-sans text-sm text-ink">
            {count === null ? (failed ? null : <span className="inline-block h-3 w-6 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" aria-hidden="true" />) : <span>{count}</span>}
            <Chevron open={open} />
          </span>
        </button>
      </h2>
      {open && (
        <div id={panelId} className="pb-5">
          {failed ? (
            <p className="font-sans text-base text-ink">Guidelines couldn’t be loaded right now.</p>
          ) : guidelines === null ? (
            <SectionSkeleton />
          ) : guidelines.length === 0 ? (
            <p className="font-sans text-base text-ink">No guidelines linked to this drug yet.</p>
          ) : (
            <ul className="space-y-4">
              {guidelines.map(g => (
                <li key={g.guideline_id}>
                  <a
                    href={g.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={g.title}
                    className={`font-sans text-base font-medium leading-snug text-ink underline-offset-2 hover:underline ${FOCUS}`}
                  >
                    {g.short_title}
                    <span aria-hidden="true" className="ml-0.5">
                      ↗
                    </span>
                  </a>
                  <p className="mt-0.5 font-sans text-sm text-ink">
                    {g.organization} · {g.pub_year}
                    {g.superseded && ' · superseded'}
                  </p>
                  {g.context && <p className="mt-1 font-sans text-base leading-relaxed text-ink">{g.context}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

// ─── 7. Classifications ───────────────────────────────────────────────────────
//
// The FDA's three relational axes — mechanism of action, physiologic effect,
// chemical structure — first, each on its own row (and saying so when empty),
// then every other system in the order get_entity_classes returns them.
// Inherited classes (reached through a sub-class) are dashed.

const CLASS_PREVIEW = 6
const CHEMONT_PREVIEW = 3

const FDA_AXES: { type: EntityClass['class_type']; label: string }[] = [
  { type: 'moa', label: 'Mechanism of action (FDA MOA)' },
  { type: 'pe', label: 'Physiologic effect (FDA PE)' },
  { type: 'chem', label: 'Chemical structure (FDA CS)' },
]

type ClassGroup = { label: string; type: EntityClass['class_type']; classes: EntityClass[] }

function groupClasses(rows: EntityClass[]): ClassGroup[] {
  const groups: ClassGroup[] = []
  const byLabel = new Map<string, ClassGroup>()
  for (const row of rows) {
    let group = byLabel.get(row.class_type_label)
    if (!group) {
      group = { label: row.class_type_label, type: row.class_type, classes: [] }
      byLabel.set(row.class_type_label, group)
      groups.push(group)
    }
    group.classes.push(row)
  }
  return groups
}

function ClassificationsSection({ classes, className }: { classes: Loadable<EntityClass[]>; className: string }) {
  let body: ReactNode
  if (classes.failed) {
    body = <p className="font-sans text-base text-ink">Classifications couldn’t be loaded right now.</p>
  } else if (!classes.data) {
    body = <SectionSkeleton />
  } else {
    const rows = classes.data
    const axes = FDA_AXES.map(a => ({
      type: a.type,
      label: a.label,
      classes: rows.filter(c => c.class_type === a.type),
    }))
    const others = groupClasses(rows.filter(c => !FDA_AXES.some(a => a.type === c.class_type)))
    const hasInherited = rows.some(c => !c.is_direct)
    body = (
      <>
        <div className="space-y-4">
          {axes.map(g => (
            <ClassGroupRow key={g.type} group={g} />
          ))}
        </div>
        {others.length > 0 && (
          <div className="mt-6 space-y-4 border-t border-ink/10 pt-5">
            {others.map(g => (
              <ClassGroupRow key={g.label} group={g} />
            ))}
          </div>
        )}
        {hasInherited && (
          <p className="mt-5 border-t border-ink/10 pt-3 font-sans text-sm leading-snug text-ink">
            Dashed: a broader class this drug belongs to through one of its sub-classes.
          </p>
        )}
      </>
    )
  }

  return (
    <PageSection id="classifications" title="Classifications" className={className}>
      {body}
    </PageSection>
  )
}

function ClassGroupRow({ group }: { group: ClassGroup }) {
  const [showAll, setShowAll] = useState(false)
  const preview = group.type === 'chemont' ? CHEMONT_PREVIEW : CLASS_PREVIEW
  const visible = showAll ? group.classes : group.classes.slice(0, preview)

  return (
    <div>
      <h3 className="mb-2 font-semibold text-ink" style={GROUP_HEADING}>
        {group.label}
      </h3>
      {group.classes.length === 0 ? (
        <p className="font-sans text-sm text-ink">None recorded.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {visible.map(c => (
            <li key={c.slug} className="min-w-0 max-w-full">
              <Link
                to={`/classifications/${c.slug}`}
                title={[c.source_code, c.name, c.is_direct ? null : '(via a sub-class)'].filter(Boolean).join(' · ')}
                className={`inline-flex max-w-full items-baseline gap-1.5 rounded-md px-2 py-0.5 font-sans text-sm leading-snug text-ink ${FOCUS} ${
                  c.is_direct ? 'lp-raised lp-press' : 'border border-dashed border-ink/30'
                }`}
              >
                {c.source_code && group.type === 'atc' && <span className="shrink-0 font-mono text-sm">{c.source_code}</span>}
                <span className="[overflow-wrap:anywhere]">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {group.classes.length > preview && (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className={`mt-1.5 font-sans text-sm font-medium text-ink hover:underline ${FOCUS}`}
        >
          {showAll ? 'Show fewer' : `Show all ${group.classes.length}`}
        </button>
      )}
    </div>
  )
}

// ─── 8. Lists ─────────────────────────────────────────────────────────────────

function ListsSection({ lists, className }: { lists: Loadable<EntityList[]>; className: string }) {
  let body: ReactNode
  if (lists.failed) {
    body = <p className="font-sans text-base text-ink">Lists couldn’t be loaded right now.</p>
  } else if (!lists.data) {
    body = <SectionSkeleton />
  } else if (lists.data.length === 0) {
    body = <p className="font-sans text-base text-ink">This drug isn’t on any list yet.</p>
  } else {
    body = (
      <ul className="grid gap-2 sm:grid-cols-2">
        {lists.data.map(l => {
          const detail = l.rank !== null ? `#${l.rank}` : l.legal_status
          return (
            <li key={l.slug} className="min-w-0">
              <Link to={`/lists/${l.slug}`} className={`${STAMP_LINK} flex h-full items-baseline justify-between gap-3 px-3 py-2`}>
                <span className="min-w-0 font-sans text-base leading-snug text-ink [overflow-wrap:anywhere]">
                  {l.title}
                  {l.via_name && <span className="block text-sm">as {formatDrugName(l.via_name)}</span>}
                </span>
                {detail && <span className="shrink-0 font-mono text-sm text-ink">{detail}</span>}
              </Link>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <PageSection id="lists" title="Lists" className={className}>
      {body}
    </PageSection>
  )
}

// ─── 9. Additional metadata / machine-readable ────────────────────────────────

const METADATA_ATTRS = ['Base name', 'Origin', 'MPJE relevance']

function MetadataSection({ drug, className }: { drug: DrugDetailType; className: string }) {
  const rows = METADATA_ATTRS.map(label => ({ label, value: attr(drug, label) })).filter(
    (r): r is { label: string; value: string } => r.value !== null,
  )
  const eco = drug.eco

  return (
    <PageSection id="metadata" title="Additional metadata" className={className}>
      <div className="space-y-6">
        {rows.length > 0 && (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {rows.map(r => (
              <div key={r.label}>
                <dt className="font-sans text-sm font-semibold text-ink">{r.label}</dt>
                <dd className="font-sans text-base text-ink [overflow-wrap:anywhere]">{r.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {eco && <EcoPanel eco={eco} />}
        <MachinePanels pcidCode={drug.pcid_code} slug={drug.slug} />
      </div>
    </PageSection>
  )
}

function EcoPanel({ eco }: { eco: unknown }) {
  const metrics = (typeof eco === 'object' && eco !== null ? eco : {}) as EcoLike

  const rqValue = typeof metrics.rq_value === 'number' && Number.isFinite(metrics.rq_value) ? metrics.rq_value : null
  const riskKey = toRiskKey(metrics.rq_category)
  const riskMeta = riskKey ? ECO_RISK_COLORS[riskKey] : { bg: '', text: 'text-ink', border: '', label: 'Unknown' }

  // Log scale so an RQ of 0.01 and an RQ of 50 are visually distinguishable.
  const riskBarWidth = rqValue === null ? 0 : Math.min(100, (Math.log10(rqValue + 1) / Math.log10(101)) * 100)
  const rqFormatted = rqValue === null ? '—' : rqValue >= 10 ? rqValue.toFixed(1) : rqValue.toFixed(2)

  const barColor =
    riskKey === 'high' ? 'bg-rose-400' : riskKey === 'moderate' ? 'bg-marigold-400' : riskKey === 'low' ? 'bg-sky-400' : 'bg-ink/30'

  return (
    <div className="lp-raised max-w-md overflow-hidden rounded-md">
      <div className="lp-rule-b flex items-center justify-between gap-2 px-4 py-3">
        <h3 className="font-semibold text-ink" style={GROUP_HEADING}>
          Environmental risk
        </h3>
        <span className={`lp-raised shrink-0 rounded px-2 py-0.5 font-sans text-sm font-semibold ${riskMeta.bg} ${riskMeta.text}`}>
          {riskMeta.label} risk
        </span>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <div className="mb-1.5 flex items-end justify-between gap-2">
            <span className="font-sans text-sm font-semibold text-ink">Risk quotient (RQ)</span>
            <span className="font-mono text-lg font-semibold text-ink">{rqFormatted}</span>
          </div>
          <div className="lp-sunken h-2 w-full overflow-hidden rounded-full">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${riskBarWidth}%` }} />
          </div>
          {rqValue === null && <p className="mt-1.5 font-sans text-sm text-ink">No risk quotient calculated for this entry.</p>}
        </div>

        {typeof metrics.dpd_category === 'string' && metrics.dpd_category && (
          <div>
            <p className="font-sans text-sm font-semibold text-ink">Drug persistence</p>
            <p className="mt-0.5 font-sans text-base text-ink">
              {titleCase(metrics.dpd_category)}
              {typeof metrics.dpd_days === 'number' && ` · ${metrics.dpd_days} days`}
            </p>
          </div>
        )}

        {typeof metrics.excretion_route === 'string' && metrics.excretion_route && (
          <div>
            <p className="font-sans text-sm font-semibold text-ink">Excretion route</p>
            <p className="mt-0.5 font-sans text-base text-ink">{titleCase(metrics.excretion_route)}</p>
          </div>
        )}

        {typeof metrics.primary_concern === 'string' && metrics.primary_concern && (
          <div>
            <p className="font-sans text-sm font-semibold text-ink">Primary concern</p>
            <p className="mt-0.5 font-sans text-base leading-relaxed text-ink">{metrics.primary_concern}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shared pieces ────────────────────────────────────────────────────────────

/** A main-column section: a scored rule, a sentence-case heading, then the body. */
function PageSection({ id, title, className = '', children }: { id: string; title: string; className?: string; children: ReactNode }) {
  const headingId = `${id}-heading`
  return (
    <section id={id} aria-labelledby={headingId} className={`${className} ${ANCHOR_OFFSET} min-w-0`}>
      <h2 id={headingId} className="mb-4 font-semibold text-ink" style={SECTION_HEADING}>
        {title}
      </h2>
      {children}
    </section>
  )
}

/** Holds a loading section's space with the same quiet pulse used across the page (no layout jump on resolve). */
function SectionSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-4/5 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
      <div className="h-4 w-3/5 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
      <div className="h-4 w-2/5 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      className={`transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
    >
      <path d="M3 5.25L7 9.25L11 5.25" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
