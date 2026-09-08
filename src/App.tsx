import { Routes, Route, useNavigate } from 'react-router-dom'
import Nav from './Nav'
import SearchView from './SearchView'
import DrugDetail from './DrugDetail'

export default function App() {
  const navigate = useNavigate()

  return (
    <div className="min-h-full page-background">
      <div className="page-content">
        <Nav />
        <Routes>
          <Route path="/" element={<SearchView />} />
          <Route path="/drugs/:slug" element={<DrugDetail />} />
          <Route path="*" element={<SearchView />} />
        </Routes>
      </div>
    </div>
  )
}
