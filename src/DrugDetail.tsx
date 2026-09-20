import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getDrugBySlug } from './api'
import type { DrugDetail as DrugDetailType, HierarchyMember } from './api.generated'
import { ECO_RISK_COLORS } from './data'
import type { EcoRisk } from './data'
import { authErrorMessage, isEntitySaved, saveEntity, unsaveEntity, useSession } from './auth'

type Tab = 'overview' | 'clinical' | 'classification' | 'interactions'

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
 * Anything else yields an empty list, so the card simply does not render.
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
  const [tab, setTab] = useState<Tab>('overview')

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

    setTab('overview')
    window.scrollTo(0, 0)
    loadDrug()

    // Guards against a stale response overwriting a newer one when the user
    // navigates between drugs faster than the requests resolve.
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    document.title = drug ? `${drug.name} · Pharmacy Commons` : 'Pharmacy Commons'
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
          className="font-sans text-[13px] text-aqua-700 hover:underline"
        >
          Return to search
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 py-4 font-sans text-[12px] text-sage-600">
        <button onClick={() => navigate('/')} className="transition-colors hover:text-sage-900">
          Browse
        </button>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-sage-900">{drug.name}</span>
      </nav>

      {/* Drug header */}
      <header className="mb-8 border-b border-sage-200 pb-6">
        <div className="mb-2 flex flex-wrap items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-aqua-200 font-mono text-[13px] font-medium text-aqua-700">
            {drug.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1
                className="font-display text-3xl font-semibold leading-tight text-sage-900 sm:text-4xl"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {drug.name}
              </h1>
              <span className="mt-1 rounded border border-sage-200 bg-sage-100 px-2 py-0.5 font-mono text-[11px] text-sage-600">
                INN
              </span>
            </div>
            <p className="font-sans text-[14px] text-sage-600">{drug.entity_type}</p>
          </div>
          <SaveButton
            pcidCode={drug.pcid_code}
            slug={slug ?? ''}
            name={drug.name}
            entityType={drug.entity_type ?? null}
          />
        </div>

        <p className="mt-3 max-w-2xl font-sans text-[14px] leading-relaxed text-sage-700">
          {drug.description || 'Active pharmaceutical ingredient'}
        </p>
      </header>

      {/* 3-column layout */}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr_260px]">
        {/* Left: identifiers */}
        <aside className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-sage-200 bg-white">
            <div className="border-b border-sage-100 px-4 py-3">
              <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-sage-600">
                Identifiers
              </h2>
            </div>
            <div className="space-y-2.5 p-4">
              <IdRow label="PCID" value={drug.pcid_code} />
              <IdRow label="Entity type" value={drug.entity_type} />
              {drug.fda_ndc_codes && drug.fda_ndc_codes.length > 0 && (
                <IdRow label="NDC codes" value={drug.fda_ndc_codes.join(', ')} />
              )}
            </div>
          </div>
        </aside>

        {/* Center: tabbed content */}
        <section>
          <div className="mb-5 flex gap-0.5 rounded-xl bg-sage-100 p-1" role="tablist">
            {(['overview', 'clinical', 'classification', 'interactions'] as Tab[]).map(t => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-lg px-3 py-1.5 font-sans text-[12.5px] font-medium capitalize transition-all ${
                  tab === t
                    ? 'bg-white text-sage-900 shadow-sm'
                    : 'text-sage-600 hover:text-sage-900'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'overview' && <OverviewTab drug={drug} />}
          {tab === 'clinical' && <ClinicalTab drug={drug} />}
          {tab === 'classification' && <ClassificationTab drug={drug} />}
          {tab === 'interactions' && <InteractionsTab drug={drug} />}
        </section>

        {/* Right: eco metrics */}
        <aside className="space-y-4">
          {drug.eco_risk && <EcoPanel eco={drug.eco_risk} />}
        </aside>
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
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-sans text-[12.5px] font-medium transition-colors disabled:opacity-50 ${
          saved
            ? 'border-amber-300 bg-amber-100 text-amber-700 hover:border-amber-400'
            : 'border-sage-200 bg-white/70 text-sage-600 hover:border-sage-300 hover:text-sage-900'
        }`}
      >
        <BookmarkIcon filled={saved} />
        {saved ? 'Saved' : 'Save'}
      </button>
      {error && <p className="max-w-[14rem] text-right font-sans text-[11px] text-coral-600">{error}</p>}
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

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function OverviewTab({ drug }: { drug: DrugDetailType }) {
  const attributes = normalizeAttributes(drug.attributes)

  return (
    <div className="space-y-6">
      <ContentCard title="Description">
        <p className="font-sans text-[13.5px] leading-relaxed text-sage-700">
          {drug.description || 'No description available'}
        </p>
      </ContentCard>

      {drug.hierarchy && <HierarchyCard hierarchy={drug.hierarchy} moietyName={drug.name} />}

      {attributes.length > 0 && (
        <ContentCard title="Attributes">
          <div className="space-y-2">
            {attributes.map((attr, i) => (
              <div key={`${attr.label}-${i}`} className="rounded-lg bg-sage-50 px-3 py-2">
                <p className="font-sans text-[12.5px] font-medium text-sage-800">{attr.label}</p>
                <p className="font-mono text-[10px] text-sage-600">{attr.value}</p>
              </div>
            ))}
          </div>
        </ContentCard>
      )}
    </div>
  )
}

function ClinicalTab({ drug }: { drug: DrugDetailType }) {
  return (
    <div className="space-y-6">
      <ContentCard title="Clinical information">
        <p className="font-sans text-[13.5px] leading-relaxed text-sage-700">
          {drug.description || 'No clinical information available'}
        </p>
      </ContentCard>
    </div>
  )
}

function ClassificationTab({ drug }: { drug: DrugDetailType }) {
  return (
    <div className="space-y-6">
      <ContentCard title="Classification">
        <div className="space-y-3">
          <div>
            <p className="mb-1 font-sans text-[10px] uppercase tracking-[0.08em] text-sage-600">
              Entity type
            </p>
            <span className="rounded-lg border border-violet-200 bg-violet-100 px-3 py-1.5 font-sans text-[12.5px] font-medium text-violet-600">
              {drug.entity_type}
            </span>
          </div>
          <div>
            <p className="mb-1 font-sans text-[10px] uppercase tracking-[0.08em] text-sage-600">
              Status
            </p>
            <p className="font-sans text-[13px] text-sage-700">{drug.status}</p>
          </div>
        </div>
      </ContentCard>
    </div>
  )
}

function InteractionsTab({ drug }: { drug: DrugDetailType }) {
  if (!drug.interactions || drug.interactions.length === 0) {
    return (
      <ContentCard title="Interactions">
        <p className="font-sans text-[13px] text-sage-600">No interactions recorded</p>
      </ContentCard>
    )
  }

  return (
    <div className="space-y-5">
      <ContentCard title="Recorded interactions">
        <div className="space-y-2">
          {drug.interactions.map((interaction, i) => (
            <div key={i} className="rounded-lg border border-sage-200 bg-sage-50 px-4 py-3">
              <p className="mb-1 font-sans text-[13.5px] font-semibold text-sage-900">
                {interaction.interacting_drug_name}
              </p>
              <p className="font-sans text-[12.5px] leading-relaxed text-sage-600">
                {interaction.mechanism || 'Interaction details not available'}
              </p>
              {interaction.severity && (
                <span className="mt-2 inline-block rounded bg-sage-100 px-2 py-1 font-mono text-[10px] font-medium text-sage-600">
                  {interaction.severity}
                </span>
              )}
            </div>
          ))}
        </div>
      </ContentCard>
    </div>
  )
}

// ─── Hierarchy card ───────────────────────────────────────────────────────────
//
// Only ever passed a non-null hierarchy (OverviewTab guards on drug.hierarchy),
// and only moieties carry one (see api.ts:getDrugBySlug). Precise forms and
// combination products used to be their own separate search/browse entries;
// now they nest here instead, under their parent moiety.

function HierarchyCard({
  hierarchy,
  moietyName,
}: {
  hierarchy: NonNullable<DrugDetailType['hierarchy']>
  moietyName: string
}) {
  const { precise_forms: preciseForms, combinations, brand_names: brandNames } = hierarchy
  const isEmpty = preciseForms.length === 0 && combinations.length === 0 && brandNames.length === 0
  if (isEmpty) return null

  return (
    <ContentCard title="Precise forms, combinations & brand names">
      <div className="space-y-5">
        {brandNames.length > 0 && (
          <HierarchySection label="Brand names">
            <div className="flex flex-wrap gap-1.5">
              {brandNames.map(b => (
                <span
                  key={b}
                  className="rounded-md border border-sage-200 bg-sage-50 px-2 py-1 font-sans text-[12px] text-sage-700"
                >
                  {b}
                </span>
              ))}
            </div>
          </HierarchySection>
        )}

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
    </ContentCard>
  )
}

function HierarchySection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 font-sans text-[10px] uppercase tracking-[0.08em] text-sage-600">
        {label}
      </p>
      {children}
    </div>
  )
}

function HierarchyList({ members }: { members: HierarchyMember[] }) {
  const navigate = useNavigate()
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {members.map(m => (
        <button
          key={m.pcid_code}
          onClick={() => navigate(`/drugs/${m.slug}`)}
          className="flex items-center justify-between gap-2 rounded-lg border border-sage-200 bg-white px-3 py-2 text-left transition-colors hover:border-aqua-300 hover:bg-aqua-50"
        >
          <span className="truncate font-sans text-[12.5px] font-medium text-sage-800">
            {m.name}
          </span>
          {m.term_type && (
            <span className="shrink-0 font-mono text-[10px] text-sage-500">{m.term_type}</span>
          )}
        </button>
      ))}
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
          <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-sage-600">
            Environmental risk
          </h2>
          <span
            className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${riskMeta.bg} ${riskMeta.text} ${riskMeta.border}`}
          >
            {riskMeta.label} risk
          </span>
        </div>
      </div>

      <div className="space-y-4 bg-white p-4">
        <div>
          <div className="mb-1.5 flex items-end justify-between gap-2">
            <span className="font-sans text-[10px] uppercase tracking-[0.08em] text-sage-600">
              Risk quotient (RQ)
            </span>
            <span className={`font-mono text-[18px] font-semibold ${rqTextColor}`}>
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
            <p className="mt-1.5 font-sans text-[11px] text-sage-600">
              No risk quotient calculated for this entry.
            </p>
          )}
        </div>

        {typeof metrics.dpd_category === 'string' && metrics.dpd_category && (
          <div className="flex items-center justify-between rounded-lg bg-sage-50 px-3 py-2.5">
            <div>
              <p className="font-sans text-[10px] uppercase tracking-[0.08em] text-sage-600">
                Drug persistence
              </p>
              <p className="mt-0.5 font-sans text-[12px] font-medium text-sage-700">
                {titleCase(metrics.dpd_category)}
                {typeof metrics.dpd_days === 'number' && ` · ${metrics.dpd_days} days`}
              </p>
            </div>
          </div>
        )}

        {typeof metrics.excretion_route === 'string' && metrics.excretion_route && (
          <div>
            <p className="mb-1 font-sans text-[10px] uppercase tracking-[0.08em] text-sage-600">
              Excretion route
            </p>
            <p className="font-sans text-[12.5px] text-sage-700">
              {titleCase(metrics.excretion_route)}
            </p>
          </div>
        )}

        {typeof metrics.primary_concern === 'string' && metrics.primary_concern && (
          <div>
            <p className="mb-1 font-sans text-[10px] uppercase tracking-[0.08em] text-sage-600">
              Primary concern
            </p>
            <p className="font-sans text-[12.5px] leading-relaxed text-sage-700">
              {metrics.primary_concern}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shared components ────────────────────────────────────────────────────────

function ContentCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-sage-200 bg-white">
      <div className="border-b border-sage-100 px-5 py-3">
        <h3 className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-sage-600">
          {title}
        </h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function IdRow({ label, value }: { label: string; value: string | string[] }) {
  const displayValue = Array.isArray(value) ? value.join(', ') : value
  return (
    <div>
      <p className="mb-0.5 font-sans text-[10px] uppercase tracking-[0.08em] text-sage-600">
        {label}
      </p>
      <p className="break-all font-mono text-[11px] text-sage-800">{displayValue}</p>
    </div>
  )
}
