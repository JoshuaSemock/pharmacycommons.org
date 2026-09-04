import { useState } from 'react'
import Nav from './Nav'
import SearchView from './SearchView'
import DrugDetail from './DrugDetail'

export type View = { type: 'search'; query?: string } | { type: 'drug'; id: string }

export default function App() {
  const [view, setView] = useState<View>({ type: 'search' })

  return (
    <div className="min-h-full" style={{ backgroundColor: 'oklch(95.5% 0.016 145)', color: 'oklch(20% 0.022 145)' }}>
      <Nav view={view} onNavigate={setView} />
      {view.type === 'search' && (
        <SearchView initialQuery={view.query} onNavigate={setView} />
      )}
      {view.type === 'drug' && (
        <DrugDetail id={view.id} onNavigate={setView} />
      )}
    </div>
  )
}
