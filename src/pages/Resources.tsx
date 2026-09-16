import PageShell from './PageShell'
import { SOURCE_GROUPS } from '../sources'
import type { Source } from '../sources'

export default function Resources() {
  return (
    <PageShell
      kicker="Resources"
      title="Where the data comes from"
      lede="Pharmacy Commons is a restructuring of public data, not a new source of it. Everything below is upstream of something on this site. Go to the primary record when the stakes are clinical."
    >
      {SOURCE_GROUPS.map(group => (
        <SourceList key={group.id} heading={group.heading} sources={group.sources} />
      ))}

      <section className="border-t border-sage-200 py-8">
        <h2
          className="mb-3 font-display text-[21px] font-semibold text-sage-900"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Reuse
        </h2>
        <div className="font-sans text-[14.5px] text-sage-700 leading-relaxed space-y-3">
          <p>
            The application code is GPL-3.0. Aggregated datasets are published under
            Creative Commons terms, but downstream license conditions travel with the
            data — sources marked CC BY-NC 4.0 above restrict commercial reuse of any
            derivative containing them.
          </p>
          <p>
            If you need a dataset export for research, write to{' '}
            <a
              href="mailto:contact@pharmacycommons.org?subject=Dataset%20request"
              className="text-aqua-700 underline decoration-aqua-300 underline-offset-2 hover:decoration-aqua-600"
            >
              contact@pharmacycommons.org
            </a>{' '}
            and say what you intend to do with it.
          </p>
        </div>
      </section>
    </PageShell>
  )
}

function SourceList({ heading, sources }: { heading: string; sources: Source[] }) {
  return (
    <section className="border-t border-sage-200 py-8">
      <h2
        className="mb-5 font-display text-[21px] font-semibold text-sage-900"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {heading}
      </h2>
      <ul className="space-y-5">
        {sources.map(source => (
          <li key={source.id} className="border-l-2 border-sage-200 pl-4">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <a
                href={source.href}
                target="_blank"
                rel="noreferrer"
                className="font-sans text-[14.5px] font-medium text-sage-900 underline decoration-sage-300 underline-offset-2 hover:decoration-aqua-600"
              >
                {source.name}
              </a>
              {source.license && (
                <span className="rounded border border-sage-200 bg-sage-100 px-1.5 py-0.5 font-mono text-[10px] text-sage-600">
                  {source.license}
                </span>
              )}
            </div>
            <p className="mt-1 font-sans text-[14px] text-sage-600 leading-relaxed">{source.role}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
