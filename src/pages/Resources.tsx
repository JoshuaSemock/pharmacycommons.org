import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import PageShell from './PageShell'
import { groupBy, resourcesOnly, useReferences } from '../references'
import type { ReferenceResource } from '../references'

/**
 * Resources: outside sites worth knowing about. Rows come from
 * public.references_resources, grouped by `headers`; the datasets the Commons
 * is built from (`headers = 'Source datasets'`) are left to References.
 */

/** Short intro per group. Presentation only; a header without one just shows its links. */
const INTROS: Record<string, string> = {
  'Guideline recommendations':
    'Who recommends what, and when to use it. Check the edition year: most of these are revised every one to three years.',
  'Clinical trials and evidence':
    'Registries for ongoing and completed studies, and places to find the reviews that summarize them.',
  'Drug lists kept elsewhere':
    'Authority lists we have not imported into Lists yet. The source keeps the current edition.',
  'Specialty references': 'Useful references that are not upstream of anything on this site.',
  'Report and dispose': 'Where to report a problem with a medicine, and how to get rid of one safely.',
}

export default function Resources() {
  const { rows, failed } = useReferences()
  const groups = useMemo(() => (rows ? groupBy(resourcesOnly(rows), r => r.headers) : []), [rows])

  return (
    <PageShell
      kicker="Resources"
      title="Resources beyond the Commons"
      lede="Guidelines, trial registries, drug lists and safety tools kept by other organizations. None of it feeds a Pharmacy Commons record. They are here because they are worth knowing."
      contentKey={`resources:${groups.length}`}
    >
      <section className="border-t border-ink/15 py-8">
        <p className="font-sans text-[14.5px] leading-relaxed text-ink">
          These sites are run by others and change without notice. Our own sources and how to cite them are on{' '}
          <Link to="/references" className={linkClass}>
            References
          </Link>
          .
        </p>
      </section>

      {failed && (
        <p role="alert" className="border-t border-ink/15 py-8 font-sans text-[14.5px] text-ink">
          The resource list could not be loaded. Refresh the page to try again.
        </p>
      )}

      {!rows && !failed && (
        <p className="border-t border-ink/15 py-8 font-sans text-[14.5px] text-ink" aria-live="polite">
          Loading resources…
        </p>
      )}

      {groups.map(group => (
        <section key={group.id} className="border-t border-ink/15 py-8">
          <h2
            id={group.id}
            className="mb-2 font-display text-[21px] font-semibold text-ink"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {group.heading}
          </h2>
          {INTROS[group.heading] && (
            <p className="mb-5 font-sans text-[14.5px] leading-relaxed text-ink">{INTROS[group.heading]}</p>
          )}
          <ul className="space-y-5">
            {group.items.map(link => (
              <LinkItem key={link.id} link={link} />
            ))}
          </ul>
        </section>
      ))}

      <section className="border-t border-ink/15 py-8">
        <h2
          id="suggest-a-link"
          className="mb-3 font-display text-[21px] font-semibold text-ink"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Suggest a link
        </h2>
        <p className="font-sans text-[14.5px] leading-relaxed text-ink">
          Know a free, well-maintained resource that belongs here, or a link that has moved? Write to{' '}
          <a
            href="mailto:contact@pharmacycommons.org?subject=Resources%20suggestion"
            className={linkClass}
          >
            contact@pharmacycommons.org
          </a>
          .
        </p>
      </section>
    </PageShell>
  )
}

function LinkItem({ link }: { link: ReferenceResource }) {
  const badges = [link.typeBadge, link.licenseBadge, ...link.badges].filter((b): b is string => Boolean(b))
  return (
    <li className="min-w-0 border-l-2 border-ink/15 pl-4">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <a
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 break-words font-sans text-[14.5px] font-medium text-ink underline decoration-mint-300 underline-offset-2 hover:decoration-hepatica-600"
        >
          {link.name}
        </a>
        {badges.map(badge => (
          <span
            key={badge}
            className="lp-raised rounded px-1.5 py-0.5 font-mono text-[10px] text-ink"
          >
            {badge}
          </span>
        ))}
      </div>
      {link.organization && (
        <p className="mt-0.5 break-words font-sans text-[12.5px] text-ink">{link.organization}</p>
      )}
      {link.description && (
        <p className="mt-1 break-words font-sans text-[14px] leading-relaxed text-ink">{link.description}</p>
      )}
    </li>
  )
}

const linkClass =
  'text-ink underline decoration-hepatica-300 underline-offset-2 hover:decoration-hepatica-600'
