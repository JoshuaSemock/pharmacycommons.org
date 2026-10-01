import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import PageShell from './PageShell'
import { THIRD_PARTY_TOOLS, TOOL_SECTIONS, toolsIn } from '../tools'
import type { Tool, ToolStatus } from '../tools'

const LINK =
  'underline decoration-aqua-300 underline-offset-2 transition-colors hover:decoration-aqua-600'

export default function Tools() {
  return (
    <PageShell
      kicker="Tools"
      title="Calculators, lists and data access"
      lede="Small, auditable tools. Every result shows its inputs, its formula, and the source of its constants — a number you cannot check is a number you should not use."
    >
      <GroupHeading id="pharmacy-commons">Pharmacy Commons</GroupHeading>
      {TOOL_SECTIONS.map(section => (
        <ToolList key={section.id} id={section.id} heading={section.label} tools={toolsIn(section.id)} />
      ))}

      <GroupHeading id="third-party">Third party</GroupHeading>
      <section className="py-8">
        <p className="mb-5 font-sans text-[14px] text-ink leading-relaxed">
          Calculators on other sites that we reach for too. They open in a new tab; Pharmacy Commons does not check or
          maintain them.
        </p>
        <ul className="space-y-3">
          {THIRD_PARTY_TOOLS.map(tool => (
            <li key={tool.url} className="min-w-0 border-l-2 border-ink/15 pl-4">
              <a
                href={tool.url}
                target="_blank"
                rel="noreferrer"
                className={`font-sans text-[14.5px] font-medium text-ink [overflow-wrap:anywhere] ${LINK}`}
              >
                {tool.name}
              </a>
              <span className="ml-2 font-sans text-[13px] text-ink">{tool.publisher}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-ink/15 py-8">
        <p className="font-sans text-[14px] text-ink leading-relaxed">
          Missing a calculator you reach for daily?{' '}
          <a href="mailto:contact@pharmacycommons.org?subject=Tool%20request" className={`text-ink ${LINK}`}>
            Ask for it
          </a>
          .
        </p>
      </section>
    </PageShell>
  )
}

function GroupHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="scroll-mt-28 border-t-2 border-ink/25 pt-8 font-display text-[26px] font-semibold text-ink"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {children}
    </h2>
  )
}

function ToolList({ id, heading, tools }: { id: string; heading: string; tools: Tool[] }) {
  if (tools.length === 0) return null
  return (
    <section id={id} className="scroll-mt-28 border-t border-ink/15 py-8 first-of-type:border-t-0">
      <h3
        className="mb-5 font-display text-[21px] font-semibold text-ink"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {heading}
      </h3>
      <ul className="space-y-5">
        {tools.map(tool => (
          <li key={tool.id} className="min-w-0 border-l-2 border-ink/15 pl-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <h4 className="font-sans text-[14.5px] font-medium text-ink">
                <ToolName tool={tool} />
              </h4>
              <StatusTag status={tool.status} />
            </div>
            <p className="mt-1 font-sans text-[14px] text-ink leading-relaxed">{tool.blurb}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ToolName({ tool }: { tool: Tool }) {
  if (tool.to) {
    return (
      <Link to={tool.to} className={LINK}>
        {tool.name}
      </Link>
    )
  }
  if (tool.href) {
    return (
      <a href={tool.href} target="_blank" rel="noreferrer" className={LINK}>
        {tool.name}
      </a>
    )
  }
  return <>{tool.name}</>
}

function StatusTag({ status }: { status: ToolStatus }) {
  const styles: Record<ToolStatus, string> = {
    live: 'lp-raised',
    building: 'lp-sunken',
    planned: 'border border-dashed border-ink/30',
  }
  const labels: Record<ToolStatus, string> = {
    live: 'live',
    building: 'in progress',
    planned: 'planned',
  }
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] text-ink ${styles[status]}`}>{labels[status]}</span>
  )
}
