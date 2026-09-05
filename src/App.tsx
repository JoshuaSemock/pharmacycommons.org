import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom'
import Nav from './Nav'
import SearchView from './SearchView'
import DrugDetail from './DrugDetail'

export type View = { type: 'search'; query?: string } | { type: 'drug'; id: string }

// Translates a View into an actual URL change, so existing components
// that call onNavigate(view) keep working without modification.
function useViewNavigate() {
  const navigate = useNavigate()
  return (view: View) => {
    if (view.type === 'search') {
      navigate(view.query ? `/?q=${encodeURIComponent(view.query)}` : '/')
    } else {
      navigate(`/drugs/${view.id}`)
    }
  }
}

function SearchRoute() {
  const onNavigate = useViewNavigate()
  const params = new URLSearchParams(window.location.search)
  const query = params.get('q') ?? undefined
  return <SearchView initialQuery={query} onNavigate={onNavigate} />
}

function DrugRoute() {
  const onNavigate = useViewNavigate()
  const { slug } = useParams<{ slug: string }>()
  return <DrugDetail id={slug!} onNavigate={onNavigate} />
}

function Shell() {
  const onNavigate = useViewNavigate()
  // Nav still expects a `view` prop for highlighting active state —
  // derive a minimal one from the current path rather than tracked state.
  const isDrugPage = window.location.pathname.startsWith('/drugs/')
  const view: View = isDrugPage
    ? { type: 'drug', id: window.location.pathname.split('/drugs/')[1] ?? '' }
    : { type: 'search' }

  return (
    <div
      className="min-h-full page-background"
      style={{ backgroundColor: 'oklch(95.5% 0.016 145)', color: 'oklch(20% 0.022 145)' }}
    >
      <div className="page-content">
        <Nav view={view} onNavigate={onNavigate} />
        <Routes>
          <Route path="/" element={<SearchRoute />} />
          <Route path="/drugs/:slug" element={<DrugRoute />} />
        </Routes>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  )
}
