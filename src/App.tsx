import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import Nav from './Nav'
import Footer from './Footer'
import SearchView from './SearchView'
import DrugDetail from './DrugDetail'
import { ViewProvider } from './views'
import Home from './pages/Home'
import About from './pages/About'
import Tools from './pages/Tools'
import Resources from './pages/Resources'
import Citations from './pages/Citations'
import Blog from './pages/Blog'
import BlogPost from './pages/BlogPost'
import Account from './pages/Account'

// Carries the vanilla calculator bundle; load it only on its own route.
const CreatinineClearance = lazy(() => import('./tools/CreatinineClearance'))

export default function App() {
  return (
    <ViewProvider>
      <div className="min-h-full page-background">
        <div className="page-content flex min-h-screen flex-col">
          <Nav />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/browse" element={<SearchView />} />
            <Route path="/drugs/:slug" element={<DrugDetail />} />
            <Route path="/about" element={<About />} />
            <Route path="/tools" element={<Tools />} />
            <Route
              path="/tools/creatinine-clearance"
              element={
                <Suspense fallback={<main className="min-h-[60vh]" aria-busy="true" />}>
                  <CreatinineClearance />
                </Suspense>
              }
            />
            <Route path="/resources" element={<Resources />} />
            <Route path="/citations" element={<Citations />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/account" element={<Account />} />
            <Route path="*" element={<Home />} />
          </Routes>
          <Footer />
        </div>
      </div>
    </ViewProvider>
  )
}
