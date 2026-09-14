import { Routes, Route } from 'react-router-dom'
import Nav from './Nav'
import SearchView from './SearchView'
import DrugDetail from './DrugDetail'
import About from './pages/About'
import Tools from './pages/Tools'
import Resources from './pages/Resources'
import Citations from './pages/Citations'
import Blog from './pages/Blog'
import BlogPost from './pages/BlogPost'

export default function App() {
  return (
    <div className="min-h-full page-background">
      <div className="page-content">
        <Nav />
        <Routes>
          <Route path="/" element={<SearchView />} />
          <Route path="/drugs/:slug" element={<DrugDetail />} />
          <Route path="/about" element={<About />} />
          <Route path="/tools" element={<Tools />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/citations" element={<Citations />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="*" element={<SearchView />} />
        </Routes>
      </div>
    </div>
  )
}
