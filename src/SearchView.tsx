import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchDrugs, listDrugs } from './api'
import type { DrugListItem, DrugListResponse, SearchResponse } from './api.generated'
import { ECO_RISK_COLORS } from './data'

export default function SearchView() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DrugListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    async function fetchDrugs() {
      try {
        setLoading(true)
        if (query.trim()) {
          const result = await searchDrugs({ q: query, limit: 25, offset })
          setResults(result?.results ?? [])
          setHasMore(result?.has_more ?? false)
        } else {
          const result = await listDrugs({ limit: 25, offset })
          setResults(result?.drugs ?? [])
          setHasMore(result?.has_more ?? false)
        }
      } catch (err) {
        console.error('Search error:', err)
        setResults([])
        setHasMore(false)
      } finally {
        setLoading(false)
      }
    }

    fetchDrugs()
  }, [query, offset])

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    setOffset(0)
  }

  const handleDrugSelect = (slug: string) => {
    navigate(`/drugs/${slug}`)
  }

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 pb-24">

      {/* Hero search */}
      <section className="pt-16 pb-12 text-center">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.15em] text-aqua-600">This Pharmacy is our Commons, an open source compendium</p>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold text-sage-900 leading-[1.1] mb-4" style={{ fontFamily: 'var(--font-display)' }}>
          Query drug information by active ingredients,<br className="hidden sm:block" /> formulations, or classes
        </h1>
        <p className="mx-auto max-w-xl font-sans text-[15px] text-sage-600 leading-relaxed mb-8">
          Information on this website is for educational purposes, not medical advice, we have curated here open source information from, for example the FDA, WHO, and NIH.
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
              onChange={handleSearch}
              placeholder="...ibuprofen, Advil, NSAID, analgesic, etc."
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

      {/* Results */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-sans text-[12px] font-medium uppercase tracking-[0.12em] text-sage-500">
            {query ? `Results for "${query}"` : 'Browse all drugs'}
            <span className="ml-2 font-mono normal-case tracking-normal text-sage-400">({results.length})</span>
          </h2>
        </div>

        {loading && !results.length ? (
          <div className="py-16 text-center">
            <p className="font-sans text-sage-500">Loading...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-sans text-sage-500">No drugs match <span className="font-medium text-sage-700">"{query}"</span></p>
            {query && (
              <button onClick={() => setQuery('')} className="mt-2 font-sans text-[13px] text-aqua-600 hover:underline">
                Clear search
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {results.map(drug => (
                <DrugCard 
                  key={drug.pcid_code} 
                  drug={drug} 
                  onSelect={() => handleDrugSelect(drug.slug)} 
                />
              ))}
            </div>

            {hasMore && (
              <div className="mt-8 text-center">
                <button
                  onClick={() => setOffset(offset + 25)}
                  className="rounded-lg bg-aqua-600 px-6 py-2.5 font-sans text-[13px] font-medium text-white hover:bg-aqua-700 transition-colors"
                >
                  Load More
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Data provenance footer */}
      {!query && (
        <footer className="mt-16 border-t border-sage-200 pt-8">
          <div className="grid gap-6 sm:grid-cols-3">
            <DataSource icon="🏛️" label="FDA DailyMed" desc="Structured product labels, NDC directory, drug interactions" />
            <DataSource icon="🧪" label="PubChem / ChEMBL" desc="Chemical structure, CAS numbers, InChIKey identifiers" />
            <DataSource icon="🌿" label="Founded by Dr. Joshua Semock, PharmD" desc="(Aug. 2026) contact@pharmacycommons.org" />
          </div>
        </footer>
      )}
    </main>
  )
}

function DrugCard({ drug, onSelect }: { drug: DrugListItem; onSelect: () => void }) {
  const riskColor = drug.eco_risk?.rq_category || 'low'
  const eco = ECO_RISK_COLORS[riskColor]

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
            <p className="font-sans text-[11px] text-sage-500">{drug.entity_type}</p>
          </div>
        </div>
      </div>

      <p className="mb-3 font-sans text-[12.5px] text-sage-600 leading-relaxed line-clamp-2">
        {drug.description || 'Active pharmaceutical ingredient'}
      </p>

      <div className="flex items-center justify-between border-t border-sage-100 pt-2.5">
        <span className="font-sans text-[11px] text-sage-500">{drug.entity_type}</span>
        {drug.eco_risk && (
          <span className={`flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] font-medium ${eco.bg} ${eco.text} ${eco.border}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70"></span>
            Eco: {eco.label}
          </span>
        )}
      </div>
    </button>
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
