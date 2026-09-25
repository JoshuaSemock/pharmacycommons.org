import { Link } from 'react-router-dom'
import PageShell from './PageShell'
import { LINK_GROUPS, LINKS_CHECKED } from '../resources'
import type { ExternalLink } from '../resources'

/**
 * Resources: outside sites worth knowing about that the Commons does not draw
 * data from. The datasets we do use, with licenses and citations, are on
 * References (src/sources.ts). Links live in src/resources.ts.
 */
export default function Resources() {
  return (
    <PageShell
      kicker="Resources"
      title="Resources beyond the Commons"
      lede="Guidelines, trial registries, drug lists and safety tools kept by other organizations. None of it feeds a Pharmacy Commons record. They are here because they are worth knowing."
    >
      <section className="border-t border-sage-200 py-8">
        <p className="font-sans text-[14.5px] leading-relaxed text-sage-700">
          These sites are run by others and change without notice. Links were last checked{' '}
          <time dateTime={LINKS_CHECKED}>{formatDate(LINKS_CHECKED)}</time>. Our own sources and how to
          cite them are on{' '}
          <Link to="/references" className={linkClass}>
            References
          </Link>
          .
        </p>
      </section>

      {LINK_GROUPS.map(group => (
        <section key={group.id} className="border-t border-sage-200 py-8">
          <h2
            id={group.id}
            className="mb-2 font-display text-[21px] font-semibold text-sage-900"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {group.heading}
          </h2>
          <p className="mb-5 font-sans text-[14.5px] leading-relaxed text-sage-600">{group.intro}</p>
          <ul className="space-y-5">
            {group.links.map(link => (
              <LinkItem key={link.id} link={link} />
            ))}
          </ul>
        </section>
      ))}

      <section className="border-t border-sage-200 py-8">
        <h2
          id="suggest-a-link"
          className="mb-3 font-display text-[21px] font-semibold text-sage-900"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Suggest a link
        </h2>
        <p className="font-sans text-[14.5px] leading-relaxed text-sage-700">
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

function LinkItem({ link }: { link: ExternalLink }) {
  return (
    <li className="min-w-0 border-l-2 border-sage-200 pl-4">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <a
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="break-words font-sans text-[14.5px] font-medium text-sage-900 underline decoration-sage-300 underline-offset-2 hover:decoration-aqua-600"
        >
          {link.name}
        </a>
        {link.badges?.map(badge => (
          <span
            key={badge}
            className="rounded border border-sage-200 bg-sage-100 px-1.5 py-0.5 font-mono text-[10px] text-sage-600"
          >
            {badge}
          </span>
        ))}
      </div>
      <p className="mt-0.5 font-sans text-[12.5px] text-sage-600">{link.publisher}</p>
      <p className="mt-1 font-sans text-[14px] leading-relaxed text-sage-600">{link.note}</p>
    </li>
  )
}

/** "2026-09-25" → "September 25, 2026", without a time-zone shift. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

const linkClass =
  'text-aqua-700 underline decoration-aqua-300 underline-offset-2 hover:decoration-aqua-600'
