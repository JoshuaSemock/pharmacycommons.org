import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { PageTitle, RailHeading } from '@/pages/PageShell'
import OnThisPage, { scrollToId, useHeadings } from '@/pages/OnThisPage'
import Markdown from '@/pages/Markdown'

// Order matters: ES imports evaluate in sequence, and crcl-ui.js throws if
// CrClCore is not already on window. These are side-effect imports of plain
// scripts; Vite bundles them into this route's lazy chunk.
import '@/tools/crcl/crcl-core.js'
import '@/tools/crcl/crcl-medications.js'
import '@/tools/crcl/crcl-ui.js'
import '@/tools/crcl/crcl-calculator.css'
import '@/tools/crcl/crcl-theme.css'
import referencesRaw from '@/tools/crcl/REFERENCES.md?raw'

/**
 * /tools/creatinine-clearance
 *
 * Hosts the vanilla-JS calculator in a React page. React renders an empty
 * mount element and never touches its children; the widget owns that subtree.
 * init() is idempotent (it marks the element), so StrictMode's double effect
 * is harmless. Navigating away unmounts the element and its listeners with it.
 *
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │ Title + lede                                                  │
 *   ├───────────────────────────────────────────────┬───────────────┤
 *   │ Calculator (widget caps itself at 62rem)      │ Scope rail    │
 *   ├───────────────────────────────────────────────┼───────────────┤
 *   │ Method and sources (REFERENCES.md, ≤42rem)    │ On this page  │
 *   └───────────────────────────────────────────────┴───────────────┘
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const TITLE = 'Creatinine clearance'

// The page supplies its own h2; drop the file's h1 so it isn't demoted into a
// second, redundant "References" heading.
const REFERENCES = referencesRaw.replace(/^#\s+References\s*\n/, '')

export default function CreatinineClearance() {
  const mountRef = useRef<HTMLDivElement>(null)
  const sourcesRef = useRef<HTMLDivElement>(null)
  const headings = useHeadings(sourcesRef, TITLE)
  const { hash } = useLocation()

  useEffect(() => {
    document.title = `${TITLE} · Pharmacy Commons`
  }, [])

  useEffect(() => {
    const el = mountRef.current
    if (el) window.CrClCalculator?.init(el)
  }, [])

  // Declared after useHeadings so heading ids exist before a deep link resolves.
  useEffect(() => {
    if (hash && scrollToId(decodeURIComponent(hash.slice(1)))) return
    window.scrollTo(0, 0)
  }, [hash])

  return (
    <main className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
      <header className="pt-10 pb-10 sm:pt-14 lg:pb-12">
        <Link
          to="/tools"
          className="mb-4 inline-block font-sans text-[13px] text-sage-600 transition-colors hover:text-sage-900"
        >
          All tools
        </Link>
        <PageTitle
          title={TITLE}
          lede="Cockcroft-Gault against every weight basis side by side, CKD-EPI 2021 eGFR, CKD and AKI staging, and a renal dose check. Every constant is cited below."
        />
      </header>

      {/* Calculator */}
      <div className="border-t border-sage-200 lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-x-12">
        <section aria-labelledby="calculator-heading" className="min-w-0 pt-8" data-toc-skip>
          <h2 id="calculator-heading" className="sr-only">
            Calculator
          </h2>
          {/* React must not render children here — the widget owns this subtree. */}
          <div ref={mountRef} className="pc-crcl" data-crcl-theme="light" />
        </section>

        <aside className="pt-8 lg:pt-10">
          <div className="space-y-7 font-sans text-[13.5px] leading-relaxed text-sage-600">
            <div>
              <RailHeading>Scope</RailHeading>
              <p>
                Adults only, with creatinine at steady state. These are population estimates, not
                measured clearance.
              </p>
            </div>
            <div>
              <RailHeading>Dosing bands</RailHeading>
              <p>
                A starter set of fifteen agents. Confirm every dose against current prescribing
                information.
              </p>
            </div>
            <div>
              <RailHeading>Method</RailHeading>
              <p>
                <a
                  href="#method-and-sources"
                  onClick={e => {
                    if (scrollToId('method-and-sources', 'smooth')) e.preventDefault()
                  }}
                  className="text-aqua-700 underline decoration-aqua-300 underline-offset-2 hover:decoration-aqua-600"
                >
                  Equations, thresholds, and sources
                </a>
                , each with its verification status.
              </p>
            </div>
          </div>
        </aside>
      </div>

      {/* Method and sources */}
      <div className="mt-16 border-t border-sage-200 lg:grid lg:grid-cols-[minmax(0,42rem)_15rem] lg:justify-between lg:gap-x-12">
        <aside className="hidden lg:col-start-2 lg:row-start-1 lg:block lg:self-start lg:sticky lg:top-28 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pt-10 lg:pb-8">
          {headings.length >= 3 && <OnThisPage headings={headings} />}
        </aside>

        <div ref={sourcesRef} className="min-w-0 pt-9 lg:col-start-1 lg:row-start-1">
          <h2
            id="method-and-sources"
            className="scroll-mt-32 font-display text-[30px] font-semibold leading-tight text-sage-900"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Method and sources
          </h2>
          <div className="mt-2">
            <Markdown source={REFERENCES} />
          </div>
        </div>
      </div>
    </main>
  )
}
