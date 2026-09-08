import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DRUGS } from './data'

export default function Nav() {
  const navigate = useNavigate()
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
      navigate(`/?q=${encodeURIComponent(query.trim())}`)
      setQuery('')
      setSearchFocused(false)
    }
  }

  function handleSuggestion(slug: string) {
    navigate(`/drugs/${slug}`)
    setQuery('')
    setSearchFocused(false)
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-sage-200 bg-sage-50/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">

        {/* Wordmark */}
        <button
          onClick={() => navigate('/')}
          className="flex shrink-0 items-center gap-2.5 group"
          aria-label="Pharmacy Commons home"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-sage-100">
            <img src="/logo.png" alt="" className="h-5 w-5 object-contain" />
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
                placeholder="...query the commons"
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
                  onMouseDown={() => handleSuggestion(drug.slug || drug.name.toLowerCase())}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-sage-50 transition-colors"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-aqua-100 font-mono text-[10px] font-medium text-aqua-700">
                    {drug.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="flex-1">
                    <span className="block font-sans text-[11px] text-sage-900 font-medium">{drug.name}</span>
                    <span className="block font-sans text-[10px] text-sage-500">{drug.classification.chemicalClass.join(' / ')} · {drug.therapeuticArea}</span>
                  </span>
                  <EcoRiskDot risk={drug.eco.risk} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <NavLink label="Browse" onClick={() => navigate('/')} />
          <button className="ml-1 rounded-lg border border-aqua-400 bg-aqua-400/10 px-3 py-1.5 font-sans text-[12.5px] font-medium text-aqua-700 transition-all hover:bg-aqua-400/20 hover:border-aqua-500">
            Contribute
          </button>
        </div>
      </div>
    </nav>
  )
}

function NavLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md px-3 py-1.5 font-sans text-[13px] text-sage-600 hover:bg-sage-100 hover:text-sage-900 transition-colors"
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
