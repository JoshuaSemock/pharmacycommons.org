import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Nav from './Nav'
import Footer from './Footer'
import { ViewProvider } from './views'
import Home from './pages/Home'

// Home ships in the entry bundle because it is the landing page. Every other
// route is split into its own chunk and fetched when first visited, so the
// homepage no longer downloads and parses the drug detail, account, blog
// markdown and list code up front (Lighthouse "unused JavaScript", ~576 KiB).
const SearchView = lazy(() => import('./SearchView'))
const DrugDetail = lazy(() => import('./DrugDetail'))
const About = lazy(() => import('./pages/About'))
const Tools = lazy(() => import('./pages/Tools'))
const Resources = lazy(() => import('./pages/Resources'))
const References = lazy(() => import('./pages/References'))
const Blog = lazy(() => import('./pages/Blog'))
const BlogPost = lazy(() => import('./pages/BlogPost'))
const Account = lazy(() => import('./pages/Account'))
const Permalink = lazy(() => import('./pages/Permalink'))
const ClassIndex = lazy(() => import('./pages/ClassIndex'))
const ClassDetail = lazy(() => import('./pages/ClassDetail'))
const ListIndex = lazy(() => import('./pages/ListIndex'))
const ListDetail = lazy(() => import('./pages/ListDetail'))
const ListCompare = lazy(() => import('./pages/ListCompare'))
// Carries the vanilla calculator bundle; load it only on its own route.
const CreatinineClearance = lazy(() => import('./tools/CreatinineClearance'))

/** Fills the viewport while a route chunk loads, so the footer stays below the fold and does not jump (layout shift) when the page arrives. */
const routeFallback = <main className="min-h-screen" aria-busy="true" />

/** Client-side redirect for a renamed route, keeping any query and #fragment. */
function Moved({ to }: { to: string }) {
  const { search, hash } = useLocation()
  return <Navigate to={`${to}${search}${hash}`} replace />
}

export default function App() {
  return (
    <ViewProvider>
      <div className="min-h-full page-background">
        <div className="page-content flex min-h-screen flex-col">
          <Nav />
          <Suspense fallback={routeFallback}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/browse" element={<SearchView />} />
            <Route path="/drugs/:slug" element={<DrugDetail />} />
            <Route path="/classes" element={<ClassIndex />} />
            <Route path="/classes/:slug" element={<ClassDetail />} />
            <Route path="/lists" element={<ListIndex />} />
            <Route path="/lists/compare" element={<ListCompare />} />
            <Route path="/lists/:slug" element={<ListDetail />} />
            {/* Permanent PCID address → current record page (also the JSON-LD @id) */}
            <Route path="/id/:pcid" element={<Permalink />} />
            <Route path="/about" element={<About />} />
            <Route path="/tools" element={<Tools />} />
            <Route
              path="/tools/creatinine-clearance"
              element={<CreatinineClearance />}
            />
            <Route path="/resources" element={<Resources />} />
            <Route path="/references" element={<References />} />
            {/* Renamed 2026-09-25; old links and bookmarks keep working. */}
            <Route path="/citations" element={<Moved to="/references" />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/account" element={<Account />} />
            <Route path="*" element={<Home />} />
          </Routes>
          </Suspense>
          <Footer />
        </div>
      </div>
    </ViewProvider>
  )
}
