import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import PageShell from './PageShell'
import { toolsIn } from '../tools'
import type { Tool, ToolStatus } from '../tools'

export default function Tools() {
  return (
    <PageShell
      kicker="Tools"
      title="Calculators and query aids"
      lede="Small, auditable tools. Every result shows its inputs, its formula, and the source of its constants — a number you cannot check is a number you should not use."
    >
      {/* Pharmacopoe Ai — lead item, not a grid cell */}
      <section className="border-t border-sage-200 py-8">
        <div className="rounded-xl border border-aqua-200 bg-aqua-100/40 p-6">
          <div className="mb-2 flex items-center gap-3">
            <h2
              className="font-display text-[22px] font-semibold text-sage-900"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Pharmacopoe Ai
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

      <ToolList heading="Clinical" tools={toolsIn('clinical')} />
      <ToolList heading="Environmental" tools={toolsIn('environmental')} />

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
          <li key={tool.id} className="border-l-2 border-sage-200 pl-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="font-sans text-[14.5px] font-medium text-sage-900">
                {tool.to ? (
                  <Link
                    to={tool.to}
                    className="underline decoration-sage-300 underline-offset-2 hover:decoration-aqua-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-500"
                  >
                    {tool.name}
                  </Link>
                ) : (
                  tool.name
                )}
              </h3>
              <StatusTag status={tool.status} />
            </div>
            <p className="mt-1 font-sans text-[14px] text-sage-600 leading-relaxed">{tool.blurb}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function StatusTag({ status }: { status: ToolStatus }): ReactNode {
  const styles: Record<ToolStatus, string> = {
    live: 'border-aqua-300 bg-aqua-100 text-aqua-700',
    building: 'border-violet-200 bg-violet-100 text-violet-600',
    planned: 'border-sage-200 bg-sage-100 text-sage-600',
  }
  const labels: Record<ToolStatus, string> = {
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
