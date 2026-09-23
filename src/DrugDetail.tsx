import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { getDrugBySlug, getEntityClasses } from './api'
import type { BrandName, DrugDetail as DrugDetailType, EntityClass, HierarchyMember } from './api.generated'
import { ECO_RISK_COLORS } from './data'
import type { EcoRisk } from './data'
import { authErrorMessage, isEntitySaved, saveEntity, unsaveEntity, useSession } from './auth'
import LabelSections from './LabelSections'
import { getGuidelines } from './guidelines'
import type { Guideline } from './guidelines'
import { sourcedValue } from './identifiers'
import { formatBrandName, formatDrugName } from './names'

// ─── Page layout (2026-09-22) ─────────────────────────────────────────────────
//
// No tabs. Left rail: Identifiers (with the satellite-table attributes folded
// in), Guidelines, Classes, then forms/combinations/brands and eco risk when
// present. Main column: the FDA prescribing information (LabelSections.tsx).
// The old Overview / Classification / Interactions tabs are gone for now;
// entity type and status still show in the header and Identifiers card.

// ─── Defensive shapes ─────────────────────────────────────────────────────────
//
// api.generated.ts currently types `attributes` as Record<string, unknown> and
// carries no eco_risk field shape, while this component was written against an
// array-of-objects attribute shape and a full EcoMetrics object. Until the ETL
// lands and the generated types can be rebuilt from real RPC output, neither
// side is authoritative — so both are normalized at runtime here rather than
// asserted with a cast that would compile and then break on live data.
//
// When api.generated.ts is regenerated: delete these shapes, type the props
// directly, and let tsc find whatever no longer lines up.

type AttributeRow = { label: string; value: string }

type EcoLike = {
  rq_value?: number | null
  rq_category?: string | null
  pec_value?: number | null
  pec_unit?: string | null
  mec_value?: number | null
  mec_unit?: string | null
  dpd_category?: string | null
  dpd_days?: number | null
  excretion_route?: string | null
  primary_concern?: string | null
}

const ECO_RISK_KEYS: readonly string[] = ['negligible', 'low', 'moderate', 'high']

/** Returns a valid ECO_RISK_COLORS key, or null when the value is absent/unrecognized. */
function toRiskKey(value: unknown): EcoRisk | null {
  return typeof value === 'string' && ECO_RISK_KEYS.includes(value) ? (value as EcoRisk) : null
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** Turns an underscored key into a readable label: salt_form → Salt form. */
function humanizeKey(key: string): string {
  return titleCase(key.replace(/_/g, ' '))
}

/**
 * Accepts either shape:
 *   A) [{ attribute_type, strength_value, strength_unit }, ...]
 *   B) { salt_form: ['hydrochloride'], strength: ['500 mg', '850 mg'], ... }
 * Anything else yields an empty list, so nothing renders.
 */
function normalizeAttributes(raw: unknown): AttributeRow[] {
  if (!raw || typeof raw !== 'object') return []

  if (Array.isArray(raw)) {
    return raw
      .map(entry => {
        if (!entry || typeof entry !== 'object') return null
        const item = entry as Record<string, unknown>
        const label = typeof item.attribute_type === 'string' ? humanizeKey(item.attribute_type) : ''
        const parts = [item.strength_value, item.strength_unit, item.value]
          .filter(v => v !== null && v !== undefined && v !== '')
          .map(String)
        if (!label && parts.length === 0) return null
        return { label: label || 'Attribute', value: parts.join(' ') || '—' }
      })
      .filter((row): row is AttributeRow => row !== null)
  }

  return Object.entries(raw as Record<string, unknown>)
    .map(([key, value]) => {
      const text = Array.isArray(value)
        ? value.map(String).join(', ')
        : value === null || value === undefined
          ? ''
          : String(value)
      return text ? { label: humanizeKey(key), value: text } : null
    })
    .filter((row): row is AttributeRow => row !== null)
}

// ─── Route component ──────────────────────────────────────────────────────────

export default function DrugDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [drug, setDrug] = useState<DrugDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadDrug() {
      if (!slug) return
      try {
        setLoading(true)
        const data = await getDrugBySlug(slug)
        if (cancelled) return
        if (!data) {
          setError(`Drug "${slug}" not found`)
          setDrug(null)
        } else {
          setDrug(data)
          setError(null)
        }
      } catch (err) {
        if (cancelled) return
        setError('Failed to load drug details')
        console.error(err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    window.scrollTo(0, 0)
    loadDrug()

    // Guards against a stale response overwriting a newer one when the user
    // navigates between drugs faster than the requests resolve.
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    document.title = drug ? `${formatDrugName(drug.name)} · Pharmacy Commons` : 'Pharmacy Commons'
  }, [drug])

  if (loading) {
    return <div className="flex justify-center py-32 font-sans text-sage-600">Loading…</div>
  }

  if (error || !drug) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <p
          className="mb-2 font-display text-xl text-sage-700"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {error || 'Drug not found'}
        </p>
        <button
          onClick={() => navigate('/')}
          className="font-sans text-sm text-aqua-700 hover:underline"
        >
          Return to search
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 py-4 font-sans text-sm text-sage-600">
        <button onClick={() => navigate('/')} className="transition-colors hover:text-sage-900">
          Browse
        </button>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-sage-900">{formatDrugName(drug.name)}</span>
      </nav>

      {/* Drug header */}
      <header className="mb-8 border-b border-sage-200 pb-6">
        <div className="mb-2 flex flex-wrap items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-aqua-200 font-mono text-sm font-medium text-aqua-700">
            {drug.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1
                className="font-display text-3xl font-semibold leading-tight text-sage-900 sm:text-4xl"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {formatDrugName(drug.name)}
              </h1>
              <span className="mt-1 rounded border border-sage-200 bg-sage-100 px-2 py-0.5 font-mono text-2xs text-sage-600">
                INN
              </span>
            </div>
            <p className="font-sans text-md text-sage-600">{drug.entity_type}</p>
            <BrandLine brands={drug.brands ?? []} />
          </div>
          <SaveButton
            pcidCode={drug.pcid_code}
            slug={slug ?? ''}
            name={drug.name}
            entityType={drug.entity_type ?? null}
          />
        </div>

        <p className="mt-3 max-w-2xl font-sans text-md leading-relaxed text-sage-700">
          {drug.description || 'Active pharmaceutical ingredient'}
        </p>
      </header>

      {/* Reference rail on the left, prescribing information in the main column */}
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-4">
          <IdentifiersCard drug={drug} />
          <GuidelinesCard pcidCode={drug.pcid_code} />
          <ClassesCard pcidCode={drug.pcid_code} />
          {drug.hierarchy && <HierarchyCard hierarchy={drug.hierarchy} moietyName={formatDrugName(drug.name)} />}
          {drug.eco_risk && <EcoPanel eco={drug.eco_risk} />}
        </aside>

        <section aria-label="FDA prescribing information" className="min-w-0">
          <LabelSections key={drug.slug} slug={drug.slug} />
        </section>
      </div>
    </div>
  )
}

// ─── Save button ──────────────────────────────────────────────────────────────
//
// Signed-out users see nothing (bookmarking needs an account; there's no
// value in showing a disabled control that just says "sign in" on every
// drug page). Signed-in users get a toggle that upserts/deletes a row in
// saved_entities (src/auth.ts, db/phase5_saved_entities.sql). Not gated on
// NPI verification — saving is reading, not contributing.

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
    let cancelled = false
    setChecking(true)
    isEntitySaved(pcidCode)
      .then(result => {
        if (!cancelled) setSaved(result)
      })
      .catch(() => {
        // Silent — a failed status check just leaves the button in its
        // default (unsaved) state rather than blocking the page.
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, pcidCode])

  if (!user || checking) return null

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
    <div className="mt-1 flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={saved}
        title={saved ? 'Remove from saved pages' : 'Save this page to your account'}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-sans text-sm font-medium transition-colors disabled:opacity-50 ${
          saved
            ? 'border-amber-300 bg-amber-100 text-amber-700 hover:border-amber-400'
            : 'border-sage-200 bg-white/70 text-sage-600 hover:border-sage-300 hover:text-sage-900'
        }`}
      >
        <BookmarkIcon filled={saved} />
        {saved ? 'Saved' : 'Save'}
      </button>
      {error && <p className="max-w-[14rem] text-right font-sans text-2xs text-coral-600">{error}</p>}
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

// ─── Left rail ────────────────────────────────────────────────────────────────

/** Identifiers (PCID, type, NDCs) followed by the satellite-table attributes (CAS, UNII, legal status…). */
function IdentifiersCard({ drug }: { drug: DrugDetailType }) {
  const attributes = normalizeAttributes(drug.attributes)

  return (
    <SideCard title="Identifiers">
      <div className="space-y-2.5">
        <IdRow label="PCID" value={drug.pcid_code} name={drug.name} />
        <IdRow label="Entity type" value={drug.entity_type} name={drug.name} />
        {drug.fda_ndc_codes && drug.fda_ndc_codes.length > 0 && (
          <IdRow label="NDC codes" value={drug.fda_ndc_codes.join(', ')} name={drug.name} />
        )}
      </div>
      {attributes.length > 0 && (
        <div className="mt-4 space-y-2.5 border-t border-sage-100 pt-4">
          {attributes.map((attr, i) => (
            <IdRow key={`${attr.label}-${i}`} label={attr.label} value={attr.value} name={drug.name} />
          ))}
        </div>
      )}
    </SideCard>
  )
}

/**
 * Clinical practice guidelines linked to this drug (entity_guidelines → guidelines,
 * see src/guidelines.ts). Each entry links out to the issuing body or journal;
 * the context line says why it applies to this drug.
 */
function GuidelinesCard({ pcidCode }: { pcidCode: string }) {
  const [guidelines, setGuidelines] = useState<Guideline[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setGuidelines(null)
    setFailed(false)
    getGuidelines(pcidCode)
      .then(result => {
        if (!cancelled) setGuidelines(result)
      })
      .catch(err => {
        console.error(err)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [pcidCode])

  return (
    <SideCard title="Guidelines">
      {failed ? (
        <p className="font-sans text-sm text-sage-600">Guidelines couldn’t be loaded right now.</p>
      ) : guidelines === null ? (
        <div className="space-y-2" aria-busy="true">
          <div className="h-4 w-4/5 animate-pulse rounded bg-sage-100" />
          <div className="h-4 w-3/5 animate-pulse rounded bg-sage-100" />
        </div>
      ) : guidelines.length === 0 ? (
        <p className="font-sans text-sm leading-relaxed text-sage-600">
          No guidelines linked to this drug yet.
        </p>
      ) : (
        <ul className="space-y-3.5">
          {guidelines.map(g => (
            <li key={g.guideline_id}>
              <a
                href={g.url}
                target="_blank"
                rel="noopener noreferrer"
                title={g.title}
                className="group font-sans text-md font-medium leading-snug text-aqua-700 underline-offset-2 hover:underline"
              >
                {g.short_title}
                <span aria-hidden="true" className="ml-0.5 text-sage-400 group-hover:text-aqua-700">
                  ↗
                </span>
              </a>
              <p className="mt-0.5 font-sans text-sm text-sage-600">
                {g.organization} · {g.pub_year}
              </p>
              {g.context && (
                <p className="mt-1 font-sans text-sm leading-relaxed text-sage-700">{g.context}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </SideCard>
  )
}

// ─── Classes card ─────────────────────────────────────────────────────────────
//
// Every class the drug belongs to (get_entity_classes), grouped by system in
// the order the RPC returns them (ATC, VA, EPC, MOA, PE, CHEM, ChemOnt), each
// chip linking to its /classes/:slug page. Inherited classes are included —
// sertraline sits directly in ATC N06AB and only through it in N06A — and drawn
// with a dashed border. Loaded in its own request like GuidelinesCard, so a
// slow class lookup never holds up the page. The card is hidden when the drug
// has no classes or the lookup fails (logged, not shown: the card is optional).

/** Chips shown per group before "Show all"; ChemOnt runs long, so it starts shorter. */
const CLASS_PREVIEW = 6
const CHEMONT_PREVIEW = 3

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

function ClassesCard({ pcidCode }: { pcidCode: string }) {
  const [classes, setClasses] = useState<EntityClass[] | null>(null)

  useEffect(() => {
    const m = /^PCID-(\d+)$/.exec(pcidCode)
    if (!m) return
    let cancelled = false
    setClasses(null)
    getEntityClasses(Number(m[1]), true)
      .then(rows => {
        if (!cancelled) setClasses(rows)
      })
      .catch(err => {
        console.error(err)
        if (!cancelled) setClasses([])
      })
    return () => {
      cancelled = true
    }
  }, [pcidCode])

  if (!classes || classes.length === 0) return null

  const groups = groupClasses(classes)
  const hasInherited = classes.some(c => !c.is_direct)

  return (
    <SideCard title="Classes">
      <div className="space-y-4">
        {groups.map(g => (
          <ClassGroupRow key={g.label} group={g} />
        ))}
      </div>
      {hasInherited && (
        <p className="mt-4 border-t border-sage-100 pt-3 font-sans text-2xs leading-snug text-sage-600">
          Dashed: a broader class this drug belongs to through one of its sub-classes.
        </p>
      )}
    </SideCard>
  )
}

function ClassGroupRow({ group }: { group: ClassGroup }) {
  const [showAll, setShowAll] = useState(false)
  const preview = group.type === 'chemont' ? CHEMONT_PREVIEW : CLASS_PREVIEW
  const visible = showAll ? group.classes : group.classes.slice(0, preview)

  return (
    <div>
      <p className="mb-2 font-sans text-xs uppercase tracking-[0.08em] text-sage-600">{group.label}</p>
      <ul className="flex flex-wrap gap-1.5">
        {visible.map(c => (
          <li key={c.slug} className="min-w-0 max-w-full">
            <Link
              to={`/classes/${c.slug}`}
              title={[c.source_code, c.name, c.is_direct ? null : '(via a sub-class)'].filter(Boolean).join(' · ')}
              className={`inline-flex max-w-full items-baseline gap-1.5 rounded-md border px-2 py-0.5 font-sans text-sm leading-snug transition-colors hover:border-aqua-300 hover:text-aqua-700 ${
                c.is_direct
                  ? 'border-sage-200 bg-white text-sage-800'
                  : 'border-dashed border-sage-300 text-sage-600'
              }`}
            >
              {c.source_code && group.type === 'atc' && (
                <span className="shrink-0 font-mono text-2xs text-sage-600">{c.source_code}</span>
              )}
              <span className="break-words">{c.name}</span>
            </Link>
          </li>
        ))}
      </ul>
      {group.classes.length > preview && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="mt-1.5 font-sans text-sm font-medium text-aqua-700 hover:underline"
        >
          {showAll ? 'Show fewer' : `Show all ${group.classes.length}`}
        </button>
      )}
    </div>
  )
}

// ─── Brand names ──────────────────────────────────────────────────────────────
//
// Under the drug name in the header. Current brands first; brands whose every
// FDA product is discontinued are listed after them, muted. A brand approved
// under an NDA/BLA links to that application on Drugs@FDA.

const BRAND_PREVIEW = 8

function brandHref(b: BrandName): string | null {
  const appl = b.appl_nos[0]?.replace(/^(NDA|BLA)/i, '')
  return appl && /^\d{6}$/.test(appl)
    ? `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${appl}`
    : null
}

function BrandLine({ brands }: { brands: BrandName[] }) {
  const [showAll, setShowAll] = useState(false)
  if (brands.length === 0) return null

  const current = brands.filter(b => b.marketed !== false)
  const discontinued = brands.filter(b => b.marketed === false)
  const visibleCurrent = showAll ? current : current.slice(0, BRAND_PREVIEW)
  const visibleDisc = showAll ? discontinued : discontinued.slice(0, Math.max(0, BRAND_PREVIEW - visibleCurrent.length))
  const hidden = brands.length - visibleCurrent.length - visibleDisc.length

  return (
    <div className="mt-3 space-y-1.5">
      {visibleCurrent.length > 0 && (
        <BrandRow label="Brand names" brands={visibleCurrent} />
      )}
      {visibleDisc.length > 0 && (
        <BrandRow label={visibleCurrent.length > 0 ? 'Discontinued' : 'Brand names (discontinued)'} brands={visibleDisc} muted />
      )}
      {(hidden > 0 || showAll) && brands.length > BRAND_PREVIEW && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="font-sans text-sm font-medium text-aqua-700 hover:underline"
        >
          {showAll ? 'Show fewer' : `Show all ${brands.length} brand names`}
        </button>
      )}
    </div>
  )
}

function BrandRow({ label, brands, muted = false }: { label: string; brands: BrandName[]; muted?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
      <span className="font-sans text-xs uppercase tracking-[0.08em] text-sage-600">{label}</span>
      {brands.map(b => {
        const href = brandHref(b)
        const text = formatBrandName(b.name)
        const cls = `rounded-md border px-2 py-0.5 font-sans text-sm ${
          muted ? 'border-dashed border-sage-300 text-sage-600' : 'border-sage-200 bg-white text-sage-800'
        }`
        return href ? (
          <a
            key={b.name}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={`${text} on Drugs@FDA${muted ? ' (discontinued)' : ''}`}
            className={`${cls} transition-colors hover:border-aqua-300 hover:text-aqua-700`}
          >
            {text}
          </a>
        ) : (
          <span key={b.name} className={cls} title={muted ? `${text} (discontinued)` : undefined}>
            {text}
          </span>
        )
      })}
    </div>
  )
}

// ─── Hierarchy card ───────────────────────────────────────────────────────────
//
// Only moieties carry a hierarchy (see api.ts:getDrugBySlug). Precise forms and
// combination products nest here under their parent moiety instead of being
// their own search/browse entries. Moved from the old Overview tab into the rail.

function HierarchyCard({
  hierarchy,
  moietyName,
}: {
  hierarchy: NonNullable<DrugDetailType['hierarchy']>
  moietyName: string
}) {
  const { precise_forms: preciseForms, combinations } = hierarchy
  if (preciseForms.length === 0 && combinations.length === 0) return null

  // The moiety's own brand names are in the page header (BrandLine); combination rows carry theirs.
  return (
    <SideCard title="Forms & combinations">
      <div className="space-y-5">
        {preciseForms.length > 0 && (
          <HierarchySection label={`Precise forms of ${moietyName}`}>
            <HierarchyList members={preciseForms} />
          </HierarchySection>
        )}

        {combinations.length > 0 && (
          <HierarchySection label={`Combination products containing ${moietyName}`}>
            <HierarchyList members={combinations} />
          </HierarchySection>
        )}
      </div>
    </SideCard>
  )
}

function HierarchySection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 font-sans text-xs uppercase tracking-[0.08em] text-sage-600">
        {label}
      </p>
      {children}
    </div>
  )
}

const HIERARCHY_PREVIEW = 5

/**
 * One row per related entity. Names wrap onto as many lines as they need
 * (no truncation) so long combination names stay readable in the narrow rail;
 * the term type sits on its own line underneath. Long lists show the first
 * few with a "Show all" toggle.
 */
function HierarchyList({ members }: { members: HierarchyMember[] }) {
  const navigate = useNavigate()
  const [showAll, setShowAll] = useState(false)
  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  const visible = showAll ? sorted : sorted.slice(0, HIERARCHY_PREVIEW)

  return (
    <div>
      <ul className="space-y-1.5">
        {visible.map(m => (
          <li key={m.pcid_code}>
            <button
              onClick={() => navigate(`/drugs/${m.slug}`)}
              className="block w-full min-w-0 rounded-lg border border-sage-200 bg-white px-3 py-2 text-left transition-colors hover:border-aqua-300 hover:bg-sage-50"
            >
              <span className="block break-words font-sans text-sm font-medium leading-snug text-sage-800">
                {formatDrugName(m.name)}
              </span>
              {m.brands && m.brands.length > 0 && (
                <span className="mt-0.5 block font-sans text-sm leading-snug text-sage-700">
                  {m.brands.map(formatBrandName).join(', ')}
                </span>
              )}
              {m.term_type && (
                <span className="mt-0.5 block font-sans text-2xs text-sage-600">{m.term_type}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {sorted.length > HIERARCHY_PREVIEW && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="mt-2 font-sans text-sm font-medium text-aqua-700 hover:underline"
        >
          {showAll ? 'Show fewer' : `Show all ${sorted.length}`}
        </button>
      )}
    </div>
  )
}

// ─── Eco panel ────────────────────────────────────────────────────────────────

function EcoPanel({ eco }: { eco: unknown }) {
  const metrics = (eco ?? {}) as EcoLike

  const rqValue = typeof metrics.rq_value === 'number' && Number.isFinite(metrics.rq_value)
    ? metrics.rq_value
    : null
  const riskKey = toRiskKey(metrics.rq_category)
  const riskMeta = riskKey
    ? ECO_RISK_COLORS[riskKey]
    : { bg: 'bg-sage-100', text: 'text-sage-600', border: 'border-sage-200', label: 'Unknown' }

  // Log scale so an RQ of 0.01 and an RQ of 50 are visually distinguishable.
  const riskBarWidth =
    rqValue === null ? 0 : Math.min(100, (Math.log10(rqValue + 1) / Math.log10(101)) * 100)

  const rqFormatted =
    rqValue === null ? '—' : rqValue >= 10 ? rqValue.toFixed(1) : rqValue.toFixed(2)

  const borderColor =
    riskKey === 'high'
      ? 'var(--color-coral-300)'
      : riskKey === 'moderate'
        ? 'var(--color-amber-400)'
        : 'var(--color-sage-200)'

  const headerBg =
    riskKey === 'high' ? 'bg-coral-100' : riskKey === 'moderate' ? 'bg-amber-100' : 'bg-sage-100'

  const rqTextColor =
    riskKey === 'high'
      ? 'text-coral-600'
      : riskKey === 'moderate'
        ? 'text-sage-700'
        : 'text-aqua-700'

  const barColor =
    riskKey === 'high'
      ? 'bg-coral-400'
      : riskKey === 'moderate'
        ? 'bg-amber-400'
        : riskKey === 'low'
          ? 'bg-aqua-400'
          : 'bg-sage-300'

  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor }}>
      <div className={`px-4 py-3 ${headerBg}`}>
        <div className="mb-0.5 flex items-center justify-between gap-2">
          <h2 className="font-sans text-2xs font-semibold uppercase tracking-[0.1em] text-sage-600">
            Environmental risk
          </h2>
          <span
            className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-xs font-semibold uppercase ${riskMeta.bg} ${riskMeta.text} ${riskMeta.border}`}
          >
            {riskMeta.label} risk
          </span>
        </div>
      </div>

      <div className="space-y-4 bg-white p-4">
        <div>
          <div className="mb-1.5 flex items-end justify-between gap-2">
            <span className="font-sans text-xs uppercase tracking-[0.08em] text-sage-600">
              Risk quotient (RQ)
            </span>
            <span className={`font-mono text-lg font-semibold ${rqTextColor}`}>
              {rqFormatted}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-sage-100">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${riskBarWidth}%` }}
            />
          </div>
          {rqValue === null && (
            <p className="mt-1.5 font-sans text-2xs text-sage-600">
              No risk quotient calculated for this entry.
            </p>
          )}
        </div>

        {typeof metrics.dpd_category === 'string' && metrics.dpd_category && (
          <div className="flex items-center justify-between rounded-lg bg-sage-50 px-3 py-2.5">
            <div>
              <p className="font-sans text-xs uppercase tracking-[0.08em] text-sage-600">
                Drug persistence
              </p>
              <p className="mt-0.5 font-sans text-sm font-medium text-sage-700">
                {titleCase(metrics.dpd_category)}
                {typeof metrics.dpd_days === 'number' && ` · ${metrics.dpd_days} days`}
              </p>
            </div>
          </div>
        )}

        {typeof metrics.excretion_route === 'string' && metrics.excretion_route && (
          <div>
            <p className="mb-1 font-sans text-xs uppercase tracking-[0.08em] text-sage-600">
              Excretion route
            </p>
            <p className="font-sans text-sm text-sage-700">
              {titleCase(metrics.excretion_route)}
            </p>
          </div>
        )}

        {typeof metrics.primary_concern === 'string' && metrics.primary_concern && (
          <div>
            <p className="mb-1 font-sans text-xs uppercase tracking-[0.08em] text-sage-600">
              Primary concern
            </p>
            <p className="font-sans text-sm leading-relaxed text-sage-700">
              {metrics.primary_concern}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shared components ────────────────────────────────────────────────────────

/** Left-rail card: small-caps header, padded body. Heading size is inline because index.css sizes bare h2. */
function SideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-sage-200 bg-white">
      <div className="border-b border-sage-100 px-4 py-3">
        <h2
          className="font-semibold uppercase tracking-[0.1em] text-sage-600"
          style={{ fontSize: 'var(--text-2xs)', fontFamily: 'var(--font-sans)', lineHeight: 1.4 }}
        >
          {title}
        </h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

/**
 * One identifier. Values with a known source (CAS, UNII, InChIKey, DrugBank,
 * NDC, FDA application, LactMed, Georgia code) link to that record — see
 * src/identifiers.ts — and the source's name sits to the right of the label.
 */
function IdRow({ label, value, name }: { label: string; value: string | string[]; name: string }) {
  const text = Array.isArray(value) ? value.join(', ') : value
  const { source, segments } = sourcedValue(label, text, { name })
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <p className="font-sans text-xs uppercase tracking-[0.08em] text-sage-600">{label}</p>
        {source && <p className="shrink-0 font-sans text-2xs text-sage-600">{source}</p>}
      </div>
      <p className="break-words font-mono text-2xs leading-relaxed text-sage-800">
        {segments.map((seg, i) =>
          seg.href ? (
            <a
              key={i}
              href={seg.href}
              target="_blank"
              rel="noopener noreferrer"
              title={source ? `Open in ${source}` : undefined}
              className="text-aqua-700 underline decoration-aqua-300 underline-offset-2 hover:decoration-aqua-700"
            >
              {seg.text}
            </a>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </p>
    </div>
  )
}
