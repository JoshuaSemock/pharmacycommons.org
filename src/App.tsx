import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import Nav from './Nav'
import Footer from './Footer'
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
const ClassCompare = lazy(() => import('./pages/ClassCompare'))
const ListIndex = lazy(() => import('./pages/ListIndex'))
const ListDetail = lazy(() => import('./pages/ListDetail'))
const ListCompare = lazy(() => import('./pages/ListCompare'))
// Carries the vanilla calculator bundle; load it only on its own route.
const CreatinineClearance = lazy(() => import('./tools/CreatinineClearance'))
const MedicationReconciliation = lazy(() => import('./tools/MedicationReconciliation'))
const DaysSupply = lazy(() => import('./tools/DaysSupply'))
const Dictionary = lazy(() => import('./tools/Dictionary'))
const Developers = lazy(() => import('./pages/Developers'))
// Legal & governance pages; text comes from docs/*.md (see src/legal.ts).
const Terms = lazy(() => import('./pages/Terms'))
const Disclaimer = lazy(() => import('./pages/Disclaimer'))
const Licensing = lazy(() => import('./pages/Licensing'))
const Privacy = lazy(() => import('./pages/Privacy'))

/** Fills the viewport while a route chunk loads, so the footer stays below the fold and does not jump (layout shift) when the page arrives. */
const routeFallback = <main className="min-h-screen" aria-busy="true" />

/** Client-side redirect for a renamed route, keeping any query and #fragment. */
function Moved({ to }: { to: string }) {
  const { search, hash } = useLocation()
  return <Navigate to={`${to}${search}${hash}`} replace />
}

/** /classes/:slug → /classifications/:slug. */
function MovedClass() {
  const { slug = '' } = useParams<{ slug: string }>()
  return <Moved to={`/classifications/${slug}`} />
}

export default function App() {
  return (
    <div className="min-h-full page-background">
      <div className="page-content flex min-h-screen flex-col">
        {/* The paper face of the page sheet: torn-edged, painted behind everything (see "Background" in index.css). */}
        <div className="paper-sheet" aria-hidden="true" />
        <Nav />
        <Suspense fallback={routeFallback}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/browse" element={<SearchView />} />
          <Route path="/drugs/:slug" element={<DrugDetail />} />
          <Route path="/classifications" element={<ClassIndex />} />
          <Route path="/classifications/compare" element={<ClassCompare />} />
          <Route path="/classifications/:slug" element={<ClassDetail />} />
          {/* "Drug classes" became "Classifications" 2026-10-02; old links and bookmarks keep working. */}
          <Route path="/classes" element={<Moved to="/classifications" />} />
          <Route path="/classes/:slug" element={<MovedClass />} />
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
          <Route
            path="/tools/medication-reconciliation"
            element={<MedicationReconciliation />}
          />
          <Route path="/tools/days-supply" element={<DaysSupply />} />
          <Route path="/tools/dictionary" element={<Dictionary />} />
          <Route path="/developers" element={<Developers />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/references" element={<References />} />
          {/* Renamed 2026-09-25; old links and bookmarks keep working. */}
          <Route path="/citations" element={<Moved to="/references" />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/account" element={<Account />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/disclaimer" element={<Disclaimer />} />
          <Route path="/licensing" element={<Licensing />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<Home />} />
        </Routes>
        </Suspense>
        <Footer />
      </div>
    </div>
  )
}
