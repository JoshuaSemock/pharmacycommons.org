import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { PageTitle } from './PageShell'

// Vanilla calculator, unchanged from its standalone build. Import order
// matters: crcl-ui.js reads window.CrClCore when it evaluates. The route is
// lazy-loaded, so none of this ships with the other pages.
import '../vendor/crcl/crcl-core.js'
import '../vendor/crcl/crcl-medications.js'
import '../vendor/crcl/crcl-ui.js'
import '../vendor/crcl/crcl-calculator.css'
import '../vendor/crcl/crcl-site.css'

declare global {
  interface Window {
    CrClCalculator?: { init: (root: HTMLElement) => void }
  }
}

const TITLE = 'Creatinine clearance'
const REFERENCES_URL =
  'https://github.com/JoshuaSemock/pharmacycommons.org/blob/main/docs/crcl-references.md'

export default function CreatinineClearance() {
  const calculatorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.title = `${TITLE} · Pharmacy Commons`
    window.scrollTo(0, 0)
  }, [])

  // React renders an empty div and never touches its children; the calculator
  // owns that subtree. Cleanup resets it so a remount (or StrictMode's double
  // effect) builds a fresh form rather than hitting the ready guard.
  useEffect(() => {
    const root = calculatorRef.current
    const calculator = window.CrClCalculator
    if (!root || !calculator) return
    calculator.init(root)
    return () => {
      root.replaceChildren()
      delete root.dataset.crclReady
    }
  }, [])

  return (
    <main className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
      <header className="pt-10 pb-10 sm:pt-14 lg:pb-12">
        <PageTitle
          title={TITLE}
          lede="Cockcroft-Gault on actual, ideal, and adjusted body weight side by side, with CKD-EPI 2021 alongside. Each result names the weight it used and why."
        />
      </header>

      <div className="border-t border-sage-200 pt-8">
        <p className="mb-6 max-w-[42rem] border-l-2 border-coral-300 pl-3 font-sans text-[13.5px] leading-relaxed text-sage-700">
          The renal dosing thresholds in the medication list are a starter set. Confirm
          any dose against current prescribing information before acting on it.
        </p>

        {/* The site has no dark palette yet, so pin the calculator to light. */}
        <div ref={calculatorRef} className="pc-crcl" data-crcl-theme="light" />
      </div>

      <section className="mt-14 max-w-[42rem] border-t border-sage-200 pt-9">
        <h2
          className="mb-4 font-display text-[22px] font-semibold leading-snug text-sage-900"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Method and sources
        </h2>
        <div className="space-y-4 font-sans text-[15.5px] leading-[1.7] text-sage-700">
          <p>
            Creatinine clearance uses Cockcroft and Gault (1976). The paper derived the
            equation on actual body weight and did not settle how to handle obesity, so the
            calculator shows each weight basis rather than choosing one silently. eGFR uses
            the race-free CKD-EPI 2021 creatinine equation.
          </p>
          <p>
            Every equation, coefficient, and threshold is mapped to its source, with a
            verification status, in the{' '}
            <a
              href={REFERENCES_URL}
              target="_blank"
              rel="noreferrer"
              className="text-aqua-700 underline decoration-aqua-300 underline-offset-2 hover:decoration-aqua-600"
            >
              calculator references
            </a>
            . Other calculators are listed on the{' '}
            <Link
              to="/tools"
              className="text-aqua-700 underline decoration-aqua-300 underline-offset-2 hover:decoration-aqua-600"
            >
              Tools
            </Link>{' '}
            page.
          </p>
        </div>
      </section>
    </main>
  )
}
