import { useState } from 'react'
import { DRUGS, CATEGORIES, ECO_RISK_COLORS, type Drug } from './data'

type View = { type: 'search'; query?: string } | { type: 'drug'; id: string }

interface SearchViewProps {
  initialQuery?: string
  onNavigate: (view: View) => void
}

export default function SearchView({ initialQuery, onNavigate }: SearchViewProps) {
  const [query, setQuery] = useState(initialQuery ?? '')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const filtered = DRUGS.filter(drug => {
    // Substance entries (alcohol, iodinated contrast media, etc.) exist only
    // to support linked drug-interaction records.
    if (drug.entryType === 'substance') return false
    const q = query.toLowerCase()
    const matchesQuery = !query ||
      drug.name.toLowerCase().includes(q) ||
      drug.classification.chemicalClass.some(c => c.toLowerCase().includes(q)) ||
      drug.therapeuticArea.toLowerCase().includes(q) ||
      drug.classification.mechanism.some(m => m.toLowerCase().includes(q))
    const matchesCategory = !activeCategory ||
      (activeCategory === 'eco' && (drug.eco.risk === 'high' || drug.eco.risk === 'moderate'))
    return matchesQuery && matchesCategory
  })

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 pb-24">

      {/* Hero search */}
      <section className="pt-16 pb-12 text-center">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.15em] text-aqua-600">The Pharmacy of the Commons, our open source pharmacy compendium</p>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold text-sage-900 leading-[1.1] mb-4" style={{ fontFamily: 'var(--font-display)' }}>
          //Query drug information 
          //by active ingredient,<br className="hidden sm:block" /> formulations, 
          //or classes
        </h1>
        <p className="mx-auto max-w-xl font-sans text-[15px] text-sage-600 leading-relaxed mb-8">
          Information on this website are for educational purposes, where we have restructed open source information from for example the FDA, WHO, and NIH.
        </p>

        {/* Search bar */}
        <div className="mx-auto max-w-lg">
          <div className="flex items-center gap-2 rounded-xl border border-sage-200 bg-white px-4 py-3 shadow-sm shadow-sage-900/5 focus-within:border-aqua-400 focus-within:ring-3 focus-within:ring-aqua-200 transition-all">
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none" className="shrink-0 text-sage-400">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. metformin, SSRI, ACE inhibitor…"
              className="flex-1 bg-transparent font-sans text-[14px] text-sage-900 placeholder-sage-400 outline-none"
              autoFocus
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-sage-400 hover:text-sage-600">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Category browse */}
      {!query && (
        <section className="mb-10">
          <h2 className="mb-4 font-sans text-[12px] font-medium uppercase tracking-[0.12em] text-sage-500">Browse by</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                className={`group rounded-xl border p-4 text-left transition-all hover:shadow-sm ${
                  activeCategory === cat.id
                    ? cat.color === 'violet' ? 'border-violet-400 bg-violet-100'
                      : cat.color === 'aqua' ? 'border-aqua-400 bg-aqua-100'
                      : cat.color === 'coral' ? 'border-coral-400 bg-coral-100'
                      : 'border-sage-300 bg-sage-200'
                    : 'border-sage-200 bg-white hover:border-sage-300'
                }`}
              >
                <div className={`mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg ${
                  cat.color === 'violet' ? 'bg-violet-200 text-violet-600'
                  : cat.color === 'aqua' ? 'bg-aqua-200 text-aqua-700'
                  : cat.color === 'coral' ? 'bg-coral-200 text-coral-600'
                  : 'bg-sage-200 text-sage-700'
                }`}>
                  <CategoryIcon id={cat.id} />
                </div>
                <p className="font-sans text-[13px] font-medium text-sage-900 leading-tight mb-0.5">{cat.label}</p>
                <p className="font-mono text-[11px] text-sage-500">{cat.count.toLocaleString()} entries</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Results */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-sans text-[12px] font-medium uppercase tracking-[0.12em] text-sage-500">
            {query ? `Results for "${query}"` : activeCategory ? CATEGORIES.find(c => c.id === activeCategory)?.label : 'All drugs'}
            <span className="ml-2 font-mono normal-case tracking-normal text-sage-400">({filtered.length})</span>
          </h2>
          {activeCategory && (
            <button onClick={() => setActiveCategory(null)} className="font-sans text-[12px] text-aqua-600 hover:text-aqua-700">
              Clear filter ×
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-sans text-sage-500">No drugs match <span className="font-medium text-sage-700">"{query}"</span></p>
            <button onClick={() => setQuery('')} className="mt-2 font-sans text-[13px] text-aqua-600 hover:underline">
              Clear search
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(drug => (
              <DrugCard key={drug.id} drug={drug} onSelect={() => onNavigate({ type: 'drug', id: drug.id })} />
            ))}
          </div>
        )}
      </section>

      {/* Data provenance footer */}
      {!query && (
        <footer className="mt-16 border-t border-sage-200 pt-8">
          <div className="grid gap-6 sm:grid-cols-3">
            <DataSource icon="🏛️" label="FDA DailyMed" desc="Structured product labels, NDC directory, drug interactions" />
            <DataSource icon="🌿" label="EMA EMEA PSUR" desc="Environmental risk assessments and ecopharmacovigilance data" />
            <DataSource icon="🧪" label="PubChem / ChEMBL" desc="Chemical structure, CAS numbers, InChIKey identifiers" />
          </div>
        </footer>
      )}
    </main>
  )
}

function DrugCard({ drug, onSelect }: { drug: Drug; onSelect: () => void }) {
  const eco = ECO_RISK_COLORS[drug.eco.risk]

  return (
    <button
      onClick={onSelect}
      className="group rounded-xl border border-sage-200 bg-white p-4 text-left transition-all hover:border-sage-300 hover:shadow-md hover:shadow-sage-900/5 hover:-translate-y-0.5"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sage-100 font-mono text-[11px] font-medium text-sage-600">
            {drug.name.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <h3 className="font-display text-[16px] font-semibold text-sage-900 leading-tight group-hover:text-aqua-700 transition-colors" style={{ fontFamily: 'var(--font-display)' }}>
              {drug.name}
            </h3>
            <p className="font-sans text-[11px] text-sage-500">{drug.classification.chemicalClass.join(' / ')}</p>
          </div>
        </div>
        <ScheduleBadge schedule={drug.schedule} />
      </div>

      <p className="mb-3 font-sans text-[12.5px] text-sage-600 leading-relaxed line-clamp-2">
        {drug.description}
      </p>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {drug.classification.mechanism.slice(0, 2).map(m => (
          <span key={m} className="rounded-md bg-violet-100 px-2 py-0.5 font-sans text-[10.5px] font-medium text-violet-600">
            {m.length > 28 ? m.slice(0, 26) + '…' : m}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-sage-100 pt-2.5">
        <span className="font-sans text-[11px] text-sage-500">{drug.therapeuticArea}</span>
        <span className={`flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] font-medium ${eco.bg} ${eco.text} ${eco.border}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70"></span>
          Eco: {eco.label}
        </span>
      </div>
    </button>
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
    <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium ${styles[schedule] ?? 'bg-sage-100 text-sage-600'}`}>
      {schedule}
    </span>
  )
}

function DataSource({ icon, label, desc }: { icon: string; label: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-xl leading-none mt-0.5">{icon}</span>
      <div>
        <p className="font-sans text-[13px] font-medium text-sage-800">{label}</p>
        <p className="font-sans text-[12px] text-sage-500 leading-relaxed">{desc}</p>
      </div>
    </div>
  )
}

function CategoryIcon({ id }: { id: string }) {
  if (id === 'mechanism') return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 2V4M8 12V14M2 8H4M12 8H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
  if (id === 'effect') return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 12C4 12 4 4 6 4C8 4 8 10 10 10C12 10 12 6 14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
  if (id === 'chemical') return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="4" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M6 8H10M10 4.5L6.5 7.5M10 11.5L6.5 8.5" stroke="currentColor" strokeWidth="1.25"/>
    </svg>
  )
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2C5.5 2 3 4 3 7C3 10 5 12 5 14H11C11 12 13 10 13 7C13 4 10.5 2 8 2Z" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M6 14H10M7 12H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}
