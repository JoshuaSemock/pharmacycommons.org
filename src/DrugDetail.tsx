import { useState } from 'react'
import { DRUGS, ECO_RISK_COLORS, type Drug, type DrugInteraction } from './data'

type View = { type: 'search'; query?: string } | { type: 'drug'; id: string }
type Tab = 'overview' | 'clinical' | 'classification' | 'interactions'

interface DrugDetailProps {
  id: string
  onNavigate: (view: View) => void
}

export default function DrugDetail({ id, onNavigate }: DrugDetailProps) {
  const drug = DRUGS.find(d => d.id === id)
  const [tab, setTab] = useState<Tab>('overview')
  const [expandedTier, setExpandedTier] = useState<'saltForms' | 'formulations' | null>('formulations')

  if (!drug) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <p className="font-display text-xl text-sage-700 mb-2" style={{ fontFamily: 'var(--font-display)' }}>Drug not found</p>
        <button onClick={() => onNavigate({ type: 'search' })} className="font-sans text-[13px] text-aqua-600 hover:underline">
          Return to search
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 pb-24">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 py-4 font-sans text-[12px] text-sage-500">
        <button onClick={() => onNavigate({ type: 'search' })} className="hover:text-aqua-600 transition-colors">
          Browse
        </button>
        <span>/</span>
        <button
          onClick={() => onNavigate({ type: 'search', query: drug.classification.chemicalClass[0] })}
          className="hover:text-aqua-600 transition-colors"
        >
          {drug.classification.chemicalClass[0]}
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
              <ScheduleBadge schedule={drug.schedule} />
            </div>
            <p className="font-sans text-[14px] text-sage-600">
              {drug.classification.chemicalClass.join(' / ')} · {drug.therapeuticArea}
            </p>
          </div>
        </div>

        <p className="max-w-2xl font-sans text-[14px] text-sage-700 leading-relaxed mt-3">
          {drug.description}
        </p>

        {/* Quick stat pills */}
        <div className="flex flex-wrap gap-2 mt-4">
          <StatPill label="Half-life" value={drug.clinical.halfLife} />
          <StatPill label="Protein binding" value={drug.clinical.proteinBinding} />
          <StatPill label="Bioavailability" value={drug.clinical.bioavailability} />
          <StatPill label="Metabolism" value={drug.clinical.metabolism.split('.')[0]} />
        </div>
      </header>

      {/* 3-column layout */}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr_260px]">

        {/* Left: Drug hierarchy */}
        <aside className="space-y-4">
          <HierarchyPanel
            drug={drug}
            expandedTier={expandedTier}
            onToggle={tier => setExpandedTier(expandedTier === tier ? null : tier)}
            onNavigate={onNavigate}
          />
          <CASPanel drug={drug} />
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
          {tab === 'interactions' && <InteractionsTab drug={drug} onNavigate={onNavigate} />}
        </section>

        {/* Right: Eco metrics */}
        <aside className="space-y-4">
          <EcoPanel drug={drug} />
          <RelatedDrugs currentId={drug.id} area={drug.therapeuticArea} onNavigate={onNavigate} />
        </aside>
      </div>
    </div>
  )
}

// ─── Hierarchy Panel ─────────────────────────────────────────────────────────

function HierarchyPanel({
  drug,
  expandedTier,
  onToggle,
  onNavigate,
}: {
  drug: Drug
  expandedTier: 'saltForms' | 'formulations' | null
  onToggle: (tier: 'saltForms' | 'formulations') => void
  onNavigate: (view: View) => void
}) {
  return (
    <div className="rounded-xl border border-sage-200 bg-white overflow-hidden">
      <div className="border-b border-sage-100 px-4 py-3">
        <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-sage-500">Drug Hierarchy</h2>
      </div>

      {/* Tier 1: Base ingredient */}
      <div className="p-4">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-aqua-400 bg-aqua-100">
            <span className="font-mono text-[8px] font-bold text-aqua-700">1</span>
          </div>
          <div>
            <p className="font-sans text-[10px] font-medium uppercase tracking-[0.1em] text-sage-400 mb-0.5">Base Ingredient</p>
            <p className="font-display text-[15px] font-semibold text-sage-900 leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
              {drug.hierarchy.ingredient.name}
            </p>
            <p className="font-mono text-[10px] text-sage-400 mt-0.5">CAS {drug.hierarchy.ingredient.cas}</p>
          </div>
        </div>

        {/* Connector */}
        <div className="ml-[9px] my-1 h-4 w-px border-l-2 border-dashed border-sage-200" />

        {/* Tier 2: Salt forms */}
        <TierSection
          tier="saltForms"
          label="Salt / Base Forms"
          count={drug.hierarchy.saltForms.length}
          isExpanded={expandedTier === 'saltForms'}
          onToggle={() => onToggle('saltForms')}
        >
          {drug.hierarchy.saltForms.map(sf => (
            <div key={sf.cas} className="rounded-lg bg-sage-50 px-3 py-2">
              <p className="font-sans text-[12.5px] font-medium text-sage-800">{sf.name}</p>
              <p className="font-mono text-[10px] text-sage-400">CAS {sf.cas}</p>
            </div>
          ))}
        </TierSection>

        <div className="ml-[9px] my-1 h-4 w-px border-l-2 border-dashed border-sage-200" />

        {/* Tier 3: Formulations */}
        <TierSection
          tier="formulations"
          label="Commercial Formulations"
          count={drug.hierarchy.formulations.length}
          isExpanded={expandedTier === 'formulations'}
          onToggle={() => onToggle('formulations')}
        >
          {drug.hierarchy.formulations.map((f, i) => (
            <div key={i} className="rounded-lg bg-sage-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-sans text-[12.5px] font-semibold text-sage-800">{f.brand}</p>
                <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 font-mono text-[9px] text-violet-600">{f.form.split(' ')[0].toUpperCase()}</span>
              </div>
              <p className="font-mono text-[10px] text-sage-500 mt-0.5">{f.strength}</p>
              <p className="font-sans text-[10px] text-sage-400">{f.manufacturer}</p>
              {f.ingredients.length > 1 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {f.ingredients.map(ing => (
                    <button
                      key={ing.apiUid}
                      onClick={() => onNavigate({ type: 'drug', id: ing.slug })}
                      title={ing.roleNote}
                      className="rounded border border-sage-200 bg-white px-1.5 py-0.5 font-sans text-[10px] text-sage-600 hover:border-aqua-400 hover:text-aqua-700 transition-colors"
                    >
                      {ing.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </TierSection>
      </div>
    </div>
  )
}

function TierSection({
  tier,
  label,
  count,
  isExpanded,
  onToggle,
  children,
}: {
  tier: string
  label: string
  count: number
  isExpanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-sage-300 bg-sage-100">
          <span className="font-mono text-[8px] font-bold text-sage-500">{tier === 'saltForms' ? '2' : '3'}</span>
        </div>
        <button
          onClick={onToggle}
          className="flex items-center gap-1.5 group"
        >
          <span className="font-sans text-[10px] font-medium uppercase tracking-[0.1em] text-sage-400">{label}</span>
          <span className="font-mono text-[9px] text-sage-400">({count})</span>
          <span className={`text-sage-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>›</span>
        </button>
      </div>
      {isExpanded && (
        <div className="mt-2 ml-7 space-y-1.5">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── CAS / Identifiers Panel ──────────────────────────────────────────────────

function CASPanel({ drug }: { drug: Drug }) {
  return (
    <div className="rounded-xl border border-sage-200 bg-white overflow-hidden">
      <div className="border-b border-sage-100 px-4 py-3">
        <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-sage-500">Identifiers</h2>
      </div>
      <div className="p-4 space-y-2.5">
        <IdRow label="CAS" value={drug.hierarchy.ingredient.cas} />
        <IdRow label="InChIKey" value={drug.hierarchy.ingredient.inchikey} mono />
        <IdRow label="INN" value={drug.name} />
        <IdRow label="Therapeutic Area" value={drug.therapeuticArea} />
      </div>
    </div>
  )
}

function IdRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="font-sans text-[10px] uppercase tracking-[0.08em] text-sage-400 mb-0.5">{label}</p>
      <p className={`text-sage-800 break-all ${mono ? 'font-mono text-[10.5px]' : 'font-sans text-[12.5px]'}`}>{value}</p>
    </div>
  )
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({ drug }: { drug: Drug }) {
  return (
    <div className="space-y-6">
      <ContentCard title="Indications">
        <ul className="space-y-1.5">
          {drug.clinical.indications.map(ind => (
            <li key={ind} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-aqua-400" />
              <span className="font-sans text-[13.5px] text-sage-700">{ind}</span>
            </li>
          ))}
        </ul>
      </ContentCard>

      <ContentCard title="Dosing">
        <p className="font-sans text-[13.5px] text-sage-700 leading-relaxed">{drug.clinical.dosing}</p>
      </ContentCard>

      <ContentCard title="Pharmacokinetics">
        <div className="grid grid-cols-2 gap-3">
          <PkStat label="Half-life" value={drug.clinical.halfLife} />
          <PkStat label="Protein binding" value={drug.clinical.proteinBinding} />
          <PkStat label="Bioavailability" value={drug.clinical.bioavailability} />
          <PkStat label="Renal excretion" value={drug.clinical.renalExcretion} />
        </div>
        <div className="mt-3 pt-3 border-t border-sage-100">
          <p className="font-sans text-[10px] uppercase tracking-[0.08em] text-sage-400 mb-1">Metabolism</p>
          <p className="font-sans text-[13px] text-sage-700 leading-relaxed">{drug.clinical.metabolism}</p>
        </div>
      </ContentCard>
    </div>
  )
}

// ─── Tab: Clinical ────────────────────────────────────────────────────────────

function ClinicalTab({ drug }: { drug: Drug }) {
  return (
    <div className="space-y-6">
      <ContentCard title="Full Dosing Guidance">
        <p className="font-sans text-[13.5px] text-sage-700 leading-relaxed">{drug.clinical.dosing}</p>
      </ContentCard>

      <ContentCard title="Pharmacokinetic Profile">
        <div className="space-y-3">
          <PkRow label="Elimination half-life" value={drug.clinical.halfLife} />
          <PkRow label="Plasma protein binding" value={drug.clinical.proteinBinding} />
          <PkRow label="Oral bioavailability" value={drug.clinical.bioavailability} />
          <PkRow label="Metabolism pathway" value={drug.clinical.metabolism} />
          <PkRow label="Renal excretion" value={drug.clinical.renalExcretion} />
        </div>
      </ContentCard>
    </div>
  )
}

// ─── Tab: Classification ──────────────────────────────────────────────────────

function ClassificationTab({ drug }: { drug: Drug }) {
  return (
    <div className="space-y-6">
      <ContentCard title="Mechanism of Action">
        <div className="flex flex-wrap gap-2">
          {drug.classification.mechanism.map(m => (
            <span key={m} className="rounded-lg border border-violet-200 bg-violet-100 px-3 py-1.5 font-sans text-[12.5px] font-medium text-violet-600">
              {m}
            </span>
          ))}
        </div>
      </ContentCard>

      <ContentCard title="Physiologic Effects">
        <div className="flex flex-wrap gap-2">
          {drug.classification.physiologicEffect.map(e => (
            <span key={e} className="rounded-lg border border-aqua-200 bg-aqua-100 px-3 py-1.5 font-sans text-[12.5px] font-medium text-aqua-700">
              {e}
            </span>
          ))}
        </div>
      </ContentCard>

      <ContentCard title="Chemical Classification">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sage-100">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" className="text-sage-600">
              <circle cx="4" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M6 8H10M10 4.5L6.5 7.5M10 11.5L6.5 8.5" stroke="currentColor" strokeWidth="1.25"/>
            </svg>
          </div>
          <div>
            <div className="flex flex-wrap gap-1.5">
              {drug.classification.chemicalClass.map(c => (
                <p key={c} className="font-display text-[16px] font-semibold text-sage-900" style={{ fontFamily: 'var(--font-display)' }}>
                  {c}
                </p>
              ))}
            </div>
            <p className="font-sans text-[12px] text-sage-500 mt-0.5">{drug.therapeuticArea}</p>
          </div>
        </div>
      </ContentCard>

      {drug.classification.additionalTags && drug.classification.additionalTags.length > 0 && (
        <ContentCard title="Additional Classification">
          <div className="flex flex-wrap gap-2">
            {drug.classification.additionalTags.map(t => (
              <span key={t} className="rounded-lg border border-sage-200 bg-sage-50 px-3 py-1.5 font-sans text-[12.5px] font-medium text-sage-700">
                {t}
              </span>
            ))}
          </div>
        </ContentCard>
      )}
    </div>
  )
}

// ─── Tab: Interactions ────────────────────────────────────────────────────────

function InteractionsTab({ drug, onNavigate }: { drug: Drug; onNavigate: (view: View) => void }) {
  const majors = drug.clinical.interactions.filter(i => i.severity === 'major')
  const moderates = drug.clinical.interactions.filter(i => i.severity === 'moderate')
  const minors = drug.clinical.interactions.filter(i => i.severity === 'minor')

  return (
    <div className="space-y-5">
      {majors.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-coral-400" />
            <h3 className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-coral-600">Major — Contraindicated / Avoid</h3>
          </div>
          <div className="space-y-2">
            {majors.map(i => <InteractionRow key={i.interactingDrugName} interaction={i} onNavigate={onNavigate} />)}
          </div>
        </div>
      )}
      {moderates.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <h3 className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-sage-600">Moderate — Monitor / Adjust Dose</h3>
          </div>
          <div className="space-y-2">
            {moderates.map(i => <InteractionRow key={i.interactingDrugName} interaction={i} onNavigate={onNavigate} />)}
          </div>
        </div>
      )}
      {minors.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-sage-300" />
            <h3 className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-sage-500">Minor — Be Aware</h3>
          </div>
          <div className="space-y-2">
            {minors.map(i => <InteractionRow key={i.interactingDrugName} interaction={i} onNavigate={onNavigate} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function InteractionRow({ interaction, onNavigate }: { interaction: DrugInteraction; onNavigate: (view: View) => void }) {
  const colors = {
    major: 'border-coral-200 bg-coral-100/50',
    moderate: 'border-amber-400/40 bg-amber-100/40',
    minor: 'border-sage-200 bg-sage-50',
  }
  const isLinked = !!interaction.interactingDrugSlug
  return (
    <div className={`rounded-lg border px-4 py-3 ${colors[interaction.severity]}`}>
      {isLinked ? (
        <button
          onClick={() => onNavigate({ type: 'drug', id: interaction.interactingDrugSlug! })}
          className="font-sans text-[13.5px] font-semibold text-sage-900 mb-1 hover:text-aqua-700 hover:underline transition-colors text-left"
        >
          {interaction.interactingDrugName}
        </button>
      ) : (
        <p className="font-sans text-[13.5px] font-semibold text-sage-900 mb-1">{interaction.interactingDrugName}</p>
      )}
      <p className="font-sans text-[12.5px] text-sage-600 leading-relaxed">{interaction.mechanism}</p>
    </div>
  )
}

// ─── Eco Panel ────────────────────────────────────────────────────────────────

function EcoPanel({ drug }: { drug: Drug }) {
  const eco = drug.eco
  const riskMeta = ECO_RISK_COLORS[eco.risk]
  const rqFormatted = eco.rq >= 10 ? eco.rq.toFixed(1) : eco.rq.toFixed(2)

  const riskBarWidth = Math.min(100, Math.log10(eco.rq + 1) / Math.log10(101) * 100)

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: eco.risk === 'high' ? 'var(--color-coral-300)' : eco.risk === 'moderate' ? 'var(--color-amber-400)' : 'var(--color-sage-200)' }}>
      {/* Header */}
      <div className={`px-4 py-3 ${eco.risk === 'high' ? 'bg-coral-100' : eco.risk === 'moderate' ? 'bg-amber-100' : 'bg-sage-100'}`}>
        <div className="flex items-center justify-between mb-0.5">
          <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-sage-600">
            Ecopharmacovigilance
          </h2>
          <span className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${riskMeta.bg} ${riskMeta.text} ${riskMeta.border}`}>
            {riskMeta.label} risk
          </span>
        </div>
        <p className="font-sans text-[11px] text-sage-500">Environmental impact assessment</p>
      </div>

      <div className="bg-white p-4 space-y-4">
        {/* Risk quotient */}
        <div>
          <div className="flex items-end justify-between mb-1.5">
            <span className="font-sans text-[10px] uppercase tracking-[0.08em] text-sage-400">Risk Quotient (RQ = PEC/MEC)</span>
            <span className={`font-mono text-[18px] font-semibold ${eco.risk === 'high' ? 'text-coral-600' : eco.risk === 'moderate' ? 'text-sage-700' : 'text-aqua-700'}`}>
              {rqFormatted}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-sage-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${eco.risk === 'high' ? 'bg-coral-400' : eco.risk === 'moderate' ? 'bg-amber-400' : eco.risk === 'low' ? 'bg-aqua-400' : 'bg-sage-300'}`}
              style={{ width: `${riskBarWidth}%` }}
            />
          </div>
          <p className="mt-1 font-sans text-[10px] text-sage-400">RQ ≥ 1 indicates potential ecological concern</p>
        </div>

        {/* MEC / PEC */}
        <div className="grid grid-cols-2 gap-2">
          <EcoMetric label="MEC" sublabel="Min. Effect Conc." value={`${eco.mec} μg/L`} color="aqua" />
          <EcoMetric label="PEC" sublabel="Pred. Env. Conc." value={`${eco.pec} μg/L`} color={eco.risk === 'high' ? 'coral' : eco.risk === 'moderate' ? 'amber' : 'sage'} />
        </div>

        {/* DPD */}
        <div className="flex items-center justify-between rounded-lg bg-sage-50 px-3 py-2.5">
          <div>
            <p className="font-sans text-[10px] uppercase tracking-[0.08em] text-sage-400">Drug Persistence (DPD)</p>
            <p className="font-sans text-[12px] font-medium text-sage-700 mt-0.5">
              {eco.dpd.charAt(0).toUpperCase() + eco.dpd.slice(1)} environmental persistence
            </p>
          </div>
          <DPDIcon level={eco.dpd} />
        </div>

        {/* Excretion */}
        <div>
          <p className="font-sans text-[10px] uppercase tracking-[0.08em] text-sage-400 mb-1">Primary Excretion Route</p>
          <p className="font-sans text-[12.5px] text-sage-700 leading-relaxed">{eco.excretionRoute}</p>
        </div>

        {/* Primary concern */}
        <div>
          <p className="font-sans text-[10px] uppercase tracking-[0.08em] text-sage-400 mb-1">Primary Environmental Concern</p>
          <p className="font-sans text-[12.5px] text-sage-700 leading-relaxed">{eco.primaryConcern}</p>
        </div>

        {/* Notes */}
        <details className="group">
          <summary className="cursor-pointer font-sans text-[12px] text-aqua-600 hover:text-aqua-700 transition-colors list-none flex items-center gap-1">
            <span className="transition-transform group-open:rotate-90">›</span>
            Full assessment notes
          </summary>
          <p className="mt-2 font-sans text-[12px] text-sage-600 leading-relaxed border-t border-sage-100 pt-2">
            {eco.notes}
          </p>
        </details>
      </div>
    </div>
  )
}

function EcoMetric({ label, sublabel, value, color }: { label: string; sublabel: string; value: string; color: string }) {
  const bg = color === 'aqua' ? 'bg-aqua-100' : color === 'coral' ? 'bg-coral-100' : color === 'amber' ? 'bg-amber-100' : 'bg-sage-100'
  const text = color === 'aqua' ? 'text-aqua-700' : color === 'coral' ? 'text-coral-600' : color === 'amber' ? 'text-sage-700' : 'text-sage-600'
  return (
    <div className={`rounded-lg p-3 ${bg}`}>
      <p className="font-mono text-[10px] font-semibold text-sage-500 mb-0.5">{label}</p>
      <p className={`font-mono text-[15px] font-semibold ${text}`}>{value}</p>
      <p className="font-sans text-[9.5px] text-sage-400 mt-0.5">{sublabel}</p>
    </div>
  )
}

function DPDIcon({ level }: { level: string }) {
  const count = level === 'high' ? 3 : level === 'moderate' ? 2 : 1
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3].map(i => (
        <div key={i} className={`w-1.5 rounded-sm ${i <= count ? (level === 'high' ? 'bg-coral-400' : level === 'moderate' ? 'bg-amber-400' : 'bg-aqua-400') : 'bg-sage-200'}`}
          style={{ height: `${8 + i * 4}px`, alignSelf: 'flex-end' }}
        />
      ))}
    </div>
  )
}

// ─── Related Drugs ────────────────────────────────────────────────────────────

function RelatedDrugs({ currentId, area, onNavigate }: { currentId: string; area: string; onNavigate: (v: View) => void }) {
  const related = DRUGS.filter(d => d.id !== currentId && d.therapeuticArea === area).slice(0, 3)
  if (related.length === 0) return null

  return (
    <div className="rounded-xl border border-sage-200 bg-white overflow-hidden">
      <div className="border-b border-sage-100 px-4 py-3">
        <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-sage-500">Same Therapeutic Area</h2>
      </div>
      <div className="divide-y divide-sage-100">
        {related.map(drug => (
          <button
            key={drug.id}
            onClick={() => onNavigate({ type: 'drug', id: drug.id })}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sage-50 transition-colors"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sage-100 font-mono text-[10px] text-sage-600">
              {drug.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-sans text-[13px] font-medium text-sage-900 truncate">{drug.name}</p>
              <p className="font-sans text-[11px] text-sage-400 truncate">{drug.classification.chemicalClass.join(' / ')}</p>
            </div>
            <EcoRiskDot risk={drug.eco.risk} />
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Shared components ────────────────────────────────────────────────────────

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

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5 rounded-lg border border-sage-200 bg-white px-3 py-1.5">
      <span className="font-sans text-[10px] uppercase tracking-[0.08em] text-sage-400">{label}</span>
      <span className="font-mono text-[12px] font-medium text-sage-800">{value}</span>
    </div>
  )
}

function PkStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-sage-50 px-3 py-2.5">
      <p className="font-sans text-[10px] uppercase tracking-[0.07em] text-sage-400 mb-1">{label}</p>
      <p className="font-mono text-[12.5px] font-medium text-sage-800 leading-tight">{value}</p>
    </div>
  )
}

function PkRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 py-2 border-b border-sage-100 last:border-0">
      <span className="w-40 shrink-0 font-sans text-[12px] text-sage-500">{label}</span>
      <span className="font-sans text-[13px] font-medium text-sage-800 leading-relaxed">{value}</span>
    </div>
  )
}

function ScheduleBadge({ schedule }: { schedule: string }) {
  const styles: Record<string, string> = {
    'Rx': 'bg-sage-100 text-sage-600 border-sage-200',
    'OTC': 'bg-aqua-100 text-aqua-700 border-aqua-200',
    'Controlled II': 'bg-coral-100 text-coral-600 border-coral-200',
    'Controlled III': 'bg-coral-100 text-coral-600 border-coral-200',
    'Controlled IV': 'bg-amber-100 text-sage-700 border-amber-400',
    'Substance': 'bg-violet-100 text-violet-600 border-violet-200',
  }
  return (
    <span className={`rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${styles[schedule] ?? 'bg-sage-100 text-sage-600'}`}>
      {schedule}
    </span>
  )
}

function EcoRiskDot({ risk }: { risk: string }) {
  const colors: Record<string, string> = {
    negligible: 'bg-sage-300',
    low: 'bg-aqua-400',
    moderate: 'bg-amber-400',
    high: 'bg-coral-400',
  }
  return <span className={`h-2 w-2 rounded-full shrink-0 ${colors[risk] ?? 'bg-sage-300'}`} title={`Eco risk: ${risk}`} />
}
