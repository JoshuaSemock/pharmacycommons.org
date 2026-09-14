import type { ReactNode } from 'react'
import PageShell from './PageShell'

type Tool = {
  name: string
  blurb: string
  status: 'live' | 'building' | 'planned'
  to?: string
}

const CLINICAL: Tool[] = [
  {
    name: 'Creatinine clearance',
    blurb: 'Cockcroft-Gault with actual, ideal, and adjusted body weight side by side, so the weight choice is explicit rather than buried.',
    status: 'planned',
  },
  {
    name: 'Body surface area',
    blurb: 'Mosteller and Du Bois, with the divergence between them shown — it matters at the extremes of size.',
    status: 'planned',
  },
  {
    name: 'Morphine milligram equivalents',
    blurb: 'Opioid conversion with the conversion factor and its source shown for every step, not just the total.',
    status: 'planned',
  },
  {
    name: 'Corrected calcium, anion gap, osmolal gap',
    blurb: 'The short arithmetic that gets done wrong under time pressure.',
    status: 'planned',
  },
]

const ENVIRONMENTAL: Tool[] = [
  {
    name: 'Risk quotient calculator',
    blurb: 'PEC ÷ PNEC from consumption data, excretion fraction, and wastewater removal rate — the same computation that drives the eco-risk field on each monograph.',
    status: 'planned',
  },
  {
    name: 'PEC estimator',
    blurb: 'Predicted environmental concentration from defined daily dose, population served, and per-capita wastewater volume.',
    status: 'planned',
  },
]

export default function Tools() {
  return (
    <PageShell
      kicker="Tools"
      title="Calculators and query aids"
      lede="Small, auditable tools. Every result shows its inputs, its formula, and the source of its constants — a number you cannot check is a number you should not use."
    >
      {/* Pharmacopoe AI — lead item, not a grid cell */}
      <section className="border-t border-sage-200 py-8">
        <div className="rounded-xl border border-aqua-200 bg-aqua-100/40 p-6">
          <div className="mb-2 flex items-center gap-3">
            <h2
              className="font-display text-[22px] font-semibold text-sage-900"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Pharmacopoe AI
            </h2>
            <StatusTag status="building" />
          </div>
          <p className="font-sans text-[14.5px] text-sage-700 leading-relaxed">
            A retrieval-grounded assistant answering from the Commons itself — monograph
            fields, label text, and environmental data — with every claim linked back to
            the record it came from. Scoped deliberately: it will decline questions the
            underlying data cannot support rather than generate a plausible answer.
          </p>
          <p className="mt-3 font-sans text-[13px] text-sage-600">
            Not a diagnostic tool, and not a prescribing aid.
          </p>
        </div>
      </section>

      <ToolList heading="Clinical" tools={CLINICAL} />
      <ToolList heading="Environmental" tools={ENVIRONMENTAL} />

      <section className="border-t border-sage-200 py-8">
        <p className="font-sans text-[14px] text-sage-600 leading-relaxed">
          Missing a calculator you reach for daily?{' '}
          <a
            href="mailto:contact@pharmacycommons.org?subject=Tool%20request"
            className="text-aqua-700 underline decoration-aqua-300 underline-offset-2 hover:decoration-aqua-600"
          >
            Ask for it
          </a>
          .
        </p>
      </section>
    </PageShell>
  )
}

function ToolList({ heading, tools }: { heading: string; tools: Tool[] }) {
  return (
    <section className="border-t border-sage-200 py-8">
      <h2
        className="mb-5 font-display text-[21px] font-semibold text-sage-900"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {heading}
      </h2>
      <ul className="space-y-5">
        {tools.map(tool => (
          <li key={tool.name} className="border-l-2 border-sage-200 pl-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="font-sans text-[14.5px] font-medium text-sage-900">{tool.name}</h3>
              <StatusTag status={tool.status} />
            </div>
            <p className="mt-1 font-sans text-[14px] text-sage-600 leading-relaxed">{tool.blurb}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function StatusTag({ status }: { status: Tool['status'] }): ReactNode {
  const styles: Record<Tool['status'], string> = {
    live: 'border-aqua-300 bg-aqua-100 text-aqua-700',
    building: 'border-violet-200 bg-violet-100 text-violet-600',
    planned: 'border-sage-200 bg-sage-100 text-sage-600',
  }
  const labels: Record<Tool['status'], string> = {
    live: 'live',
    building: 'in progress',
    planned: 'planned',
  }
  return (
    <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}
