import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getDrugBySlug } from './api'
import type { DrugDetail as DrugDetailType } from './api.generated'
import { ECO_RISK_COLORS } from './data'

type Tab = 'overview' | 'clinical' | 'classification' | 'interactions'

export default function DrugDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [drug, setDrug] = useState<DrugDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [expandedTier, setExpandedTier] = useState<'saltForms' | 'formulations' | null>('formulations')

  useEffect(() => {
    async function loadDrug() {
      if (!slug) return
      try {
        setLoading(true)
        const data = await getDrugBySlug(slug)
        if (!data) {
          setError(`Drug "${slug}" not found`)
          setDrug(null)
        } else {
          setDrug(data)
          setError(null)
        }
      } catch (err) {
        setError('Failed to load drug details')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    loadDrug()
  }, [slug])

  if (loading) {
    return <div className="flex justify-center py-32 text-sage-600">Loading...</div>
  }

  if (error || !drug) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <p className="font-display text-xl text-sage-700 mb-2" style={{ fontFamily: 'var(--font-display)' }}>
          {error || 'Drug not found'}
        </p>
        <button onClick={() => navigate('/')} className="font-sans text-[13px] text-aqua-600 hover:underline">
          Return to search
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 pb-24">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 py-4 font-sans text-[12px] text-sage-400">
        <button onClick={() => navigate('/')} className="hover:text-sage-500 transition-colors">
          Browse
        </button>
        <span>/</span>
        <span className="text-sage-900 font-medium">{drug.name}</span>
      </nav>

      {/* Drug header */}
      <header className="mb-8 pb-6 border-b border-sage-200">
        <div className="flex flex-wrap items-start gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-aqua-200 font-mono text-[13px] font-medium text-aqua-800">
            {drug.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="font-display text-3xl sm:text-4xl font-semibold text-sage-900 leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
                {drug.name}
              </h1>
              <span className="mt-1 rounded border border-sage-200 bg-sage-100 px-2 py-0.5 font-mono text-[11px] text-sage-600">
                INN
              </span>
            </div>
            <p className="font-sans text-[14px] text-sage-600">
              {drug.entity_type}
            </p>
          </div>
        </div>

        <p className="max-w-2xl font-sans text-[14px] text-sage-700 leading-relaxed mt-3">
          {drug.description || 'Active pharmaceutical ingredient'}
        </p>
      </header>

      {/* 3-column layout */}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr_260px]">
        {/* Left: Drug info */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-sage-200 bg-white overflow-hidden">
            <div className="border-b border-sage-100 px-4 py-3">
              <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-sage-500">Identifiers</h2>
            </div>
            <div className="p-4 space-y-2.5">
              <IdRow label="PCID" value={drug.pcid_code} />
              <IdRow label="Entity Type" value={drug.entity_type} />
              {drug.fda_ndc_codes && drug.fda_ndc_codes.length > 0 && (
                <IdRow label="NDC Codes" value={drug.fda_ndc_codes.join(', ')} />
              )}
            </div>
          </div>
        </aside>

        {/* Center: Tabbed content */}
        <section>
          {/* Tabs */}
          <div className="mb-5 flex gap-0.5 rounded-xl bg-sage-100 p-1">
            {(['overview', 'clinical', 'classification', 'interactions'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-lg px-3 py-1.5 font-sans text-[12.5px] font-medium capitalize transition-all ${
                  tab === t
                    ? 'bg-white text-sage-900 shadow-sm'
                    : 'text-sage-500 hover:text-sage-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'overview' && <OverviewTab drug={drug} />}
          {tab === 'clinical' && <ClinicalTab drug={drug} />}
          {tab === 'classification' && <ClassificationTab drug={drug} />}
          {tab === 'interactions' && <InteractionsTab drug={drug} navigate={navigate} />}
        </section>

        {/* Right: Eco metrics */}
        <aside className="space-y-4">
          {drug.eco_risk && <EcoPanel eco={drug.eco_risk} />}
        </aside>
      </div>
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function OverviewTab({ drug }: { drug: DrugDetailType }) {
  return (
    <div className="space-y-6">
      <ContentCard title="Description">
        <p className="font-sans text-[13.5px] text-sage-700 leading-relaxed">
          {drug.description || 'No description available'}
        </p>
      </ContentCard>
      {drug.attributes && drug.attributes.length > 0 && (
        <ContentCard title="Attributes">
          <div className="space-y-2">
            {drug.attributes.map((attr, i) => (
              <div key={i} className="rounded-lg bg-sage-50 px-3 py-2">
                <p className="font-sans text-[12.5px] font-medium text-sage-800">{attr.attribute_type}</p>
                <p className="font-mono text-[10px] text-sage-400">
                  {attr.strength_value} {attr.strength_unit}
                </p>
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
      <ContentCard title="Clinical Information">
        <p className="font-sans text-[13.5px] text-sage-700 leading-relaxed">
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
            <p className="font-sans text-[10px] uppercase tracking-[0.08em] text-sage-400 mb-1">Entity Type</p>
            <span className="rounded-lg border border-violet-200 bg-violet-100 px-3 py-1.5 font-sans text-[12.5px] font-medium text-violet-600">
              {drug.entity_type}
            </span>
          </div>
          <div>
            <p className="font-sans text-[10px] uppercase tracking-[0.08em] text-sage-400 mb-1">Status</p>
            <p className="font-sans text-[13px] text-sage-700">{drug.status}</p>
          </div>
        </div>
      </ContentCard>
    </div>
  )
}

function InteractionsTab({ drug, navigate }: { drug: DrugDetailType; navigate: any }) {
  if (!drug.interactions || drug.interactions.length === 0) {
    return (
      <ContentCard title="Interactions">
        <p className="font-sans text-[13px] text-sage-600">No interactions recorded</p>
      </ContentCard>
    )
  }

  return (
    <div className="space-y-5">
      <ContentCard title="Recorded Interactions">
        <div className="space-y-2">
          {drug.interactions.map((interaction, i) => (
            <div key={i} className="rounded-lg border border-sage-200 bg-sage-50 px-4 py-3">
              <p className="font-sans text-[13.5px] font-semibold text-sage-900 mb-1">
                {interaction.interacting_drug_name}
              </p>
              <p className="font-sans text-[12.5px] text-sage-600 leading-relaxed">
                {interaction.mechanism || 'Interaction details not available'}
              </p>
              {interaction.severity && (
                <span className="mt-2 inline-block rounded px-2 py-1 font-mono text-[10px] font-medium text-sage-600 bg-sage-100">
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

// ─── Eco Panel ────────────────────────────────────────────────────────────────

function EcoPanel({ eco }: { eco: any }) {
  const rqFormatted = eco.rq_value >= 10 ? eco.rq_value.toFixed(1) : eco.rq_value.toFixed(2)
  const riskBarWidth = Math.min(100, Math.log10(eco.rq_value + 1) / Math.log10(101) * 100)
  const riskMeta = ECO_RISK_COLORS[eco.rq_category] || { bg: 'bg-sage-100', text: 'text-sage-600', border: 'border-sage-200', label: 'Unknown' }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: eco.rq_category === 'high' ? 'var(--color-coral-300)' : eco.rq_category === 'moderate' ? 'var(--color-amber-400)' : 'var(--color-sage-200)' }}>
      <div className={`px-4 py-3 ${eco.rq_category === 'high' ? 'bg-coral-100' : eco.rq_category === 'moderate' ? 'bg-amber-100' : 'bg-sage-100'}`}>
        <div className="flex items-center justify-between mb-0.5">
          <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-sage-600">
            Environmental Risk
          </h2>
          <span className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${riskMeta.bg} ${riskMeta.text} ${riskMeta.border}`}>
            {riskMeta.label} risk
          </span>
        </div>
      </div>

      <div className="bg-white p-4 space-y-4">
        <div>
          <div className="flex items-end justify-between mb-1.5">
            <span className="font-sans text-[10px] uppercase tracking-[0.08em] text-sage-400">Risk Quotient (RQ)</span>
            <span className={`font-mono text-[18px] font-semibold ${eco.rq_category === 'high' ? 'text-coral-600' : eco.rq_category === 'moderate' ? 'text-sage-700' : 'text-aqua-700'}`}>
              {rqFormatted}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-sage-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${eco.rq_category === 'high' ? 'bg-coral-400' : eco.rq_category === 'moderate' ? 'bg-amber-400' : eco.rq_category === 'low' ? 'bg-aqua-400' : 'bg-sage-300'}`}
              style={{ width: `${riskBarWidth}%` }}
            />
          </div>
        </div>

        {eco.dpd_category && (
          <div className="flex items-center justify-between rounded-lg bg-sage-50 px-3 py-2.5">
            <div>
              <p className="font-sans text-[10px] uppercase tracking-[0.08em] text-sage-400">Drug Persistence</p>
              <p className="font-sans text-[12px] font-medium text-sage-700 mt-0.5">
                {eco.dpd_category.charAt(0).toUpperCase() + eco.dpd_category.slice(1)}
              </p>
            </div>
          </div>
        )}

        {eco.excretion_route && (
          <div>
            <p className="font-sans text-[10px] uppercase tracking-[0.08em] text-sage-400 mb-1">Excretion Route</p>
            <p className="font-sans text-[12.5px] text-sage-700">{eco.excretion_route}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shared components ─────────────────────────────────────────────────────────

function ContentCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-sage-200 bg-white overflow-hidden">
      <div className="border-b border-sage-100 px-5 py-3">
        <h3 className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-sage-500">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function IdRow({ label, value }: { label: string; value: string | string[] }) {
  const displayValue = Array.isArray(value) ? value.join(', ') : value
  return (
    <div>
      <p className="font-sans text-[10px] uppercase tracking-[0.08em] text-sage-400 mb-0.5">{label}</p>
      <p className="font-mono text-[11px] text-sage-800 break-all">{displayValue}</p>
    </div>
  )
}
