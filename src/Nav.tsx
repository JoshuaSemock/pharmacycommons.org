import { useState } from 'react'
import { DRUGS } from './data'

type View = { type: 'search'; query?: string } | { type: 'drug'; id: string }

interface NavProps {
  view: View
  onNavigate: (view: View) => void
}

export default function Nav({ view, onNavigate }: NavProps) {
  const [searchFocused, setSearchFocused] = useState(false)
  const [query, setQuery] = useState('')

  const suggestions = query.length > 1
    ? DRUGS.filter(d =>
        d.entryType !== 'substance' && (
          d.name.toLowerCase().includes(query.toLowerCase()) ||
          d.therapeuticArea.toLowerCase().includes(query.toLowerCase()) ||
          d.classification.chemicalClass.some(c => c.toLowerCase().includes(query.toLowerCase()))
        )
      ).slice(0, 5)
    : []

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim()) {
      onNavigate({ type: 'search', query: query.trim() })
      setQuery('')
      setSearchFocused(false)
    }
  }

  function handleSuggestion(id: string) {
    onNavigate({ type: 'drug', id })
    setQuery('')
    setSearchFocused(false)
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-sage-200 bg-sage-50/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">

        {/* Wordmark */}
        <button
          onClick={() => onNavigate({ type: 'search' })}
          className="flex shrink-0 items-center gap-2.5 group"
          aria-label="Pharmacy Commons home"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-aqua-400 text-sage-900 transition-colors group-hover:bg-aqua-500">
            <RxGlyph />
          </span>
          <span className="hidden font-sans text-[15px] font-medium tracking-[-0.01em] text-sage-900 sm:block">
            Pharmacy Commons
          </span>
        </button>

        {/* Search */}
        <div className="relative flex-1 max-w-lg">
          <form onSubmit={handleSubmit}>
            <div className={`flex items-center gap-2 rounded-lg border bg-white/70 px-3 py-1.5 transition-all ${searchFocused ? 'border-aqua-400 ring-2 ring-aqua-200 bg-white' : 'border-sage-200 hover:border-sage-300'}`}>
              <SearchIcon />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                placeholder="...query the Commons"
                className="flex-1 bg-transparent font-sans text-[13.5px] text-sage-900 placeholder-sage-400 outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-sage-400 hover:text-sage-600"
                >
                  <XIcon />
                </button>
              )}
            </div>
          </form>

          {/* Suggestions dropdown */}
          {searchFocused && suggestions.length > 0 && (
            <div className="absolute top-full mt-1.5 w-full rounded-lg border border-sage-200 bg-white shadow-lg shadow-sage-900/5 overflow-hidden">
              {suggestions.map(drug => (
                <button
                  key={drug.id}
                  onMouseDown={() => handleSuggestion(drug.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-sage-50 transition-colors"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-aqua-100 font-mono text-[10px] font-medium text-aqua-700">
                    {drug.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="flex-1">
                    <span className="block font-sans text-[11px] text-sage-500">{drug.classification.chemicalClass.join(' / ')} · {drug.therapeuticArea}</span>
                    <span className="block font-sans text-[11px] text-sage-500">{drug.classification.chemicalClass} · {drug.therapeuticArea}</span>
                  </span>
                  <EcoRiskDot risk={drug.eco.risk} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <NavLink label="Browse" onClick={() => onNavigate({ type: 'search' })} active={view.type === 'search'} />
          <button className="ml-1 rounded-lg border border-aqua-400 bg-aqua-400/10 px-3 py-1.5 font-sans text-[12.5px] font-medium text-aqua-700 transition-all hover:bg-aqua-400/20 hover:border-aqua-500">
            Contribute
          </button>
        </div>
      </div>
    </nav>
  )
}

function NavLink({ label, onClick, active }: { label: string; onClick: () => void; active: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 font-sans text-[13px] transition-colors ${active ? 'bg-sage-200 text-sage-900 font-medium' : 'text-sage-600 hover:bg-sage-100 hover:text-sage-900'}`}
    >
      {label}
    </button>
  )
}

function EcoRiskDot({ risk }: { risk: string }) {
  const colors: Record<string, string> = {
    negligible: 'bg-sage-300',
    low: 'bg-aqua-400',
    moderate: 'bg-amber-400',
    high: 'bg-coral-400',
  }
  return (
    <span
      className={`h-2 w-2 rounded-full ${colors[risk] ?? 'bg-sage-300'}`}
      title={`Eco risk: ${risk}`}
    />
  )
}

function RxGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <text x="1" y="12" fontFamily="Fraunces, Georgia, serif" fontSize="13" fontWeight="500" fill="currentColor">R</text>
      <text x="9" y="14" fontFamily="Fraunces, Georgia, serif" fontSize="8" fontWeight="400" fill="currentColor">x</text>
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-sage-400">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}
