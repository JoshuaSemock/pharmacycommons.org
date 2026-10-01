import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PageFrame, PageTitle } from './PageShell'
import Markdown from './Markdown'
import { LEGAL_CONTACT_EMAIL, LEGAL_PAGES, parseLegalDoc } from '../legal'
import type { LegalPageLink } from '../legal'

/**
 * Shared layout for /terms, /disclaimer, /licensing and /privacy.
 *
 * Renders a canonical docs/*.md file (passed in raw by the route page) inside
 * the standard text-page frame: title and Effective Date in the header, the
 * numbered sections in the reading column with "On this page" in the rail, then
 * a contact callout and links to the other three policies.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

type LegalPageProps = {
  /** Raw markdown of the canonical document. */
  source: string
  /** Which of LEGAL_PAGES this is; the others are listed as related. */
  current: LegalPageLink['to']
  /** One plain-language sentence under the title. */
  lede: string
}

export default function LegalPage({ source, current, lede }: LegalPageProps) {
  const doc = useMemo(() => parseLegalDoc(source), [source])
  const page = LEGAL_PAGES.find(p => p.to === current)
  const title = page?.title ?? doc.title
  const related = LEGAL_PAGES.filter(p => p.to !== current)

  useEffect(() => {
    document.title = `${title} · Pharmacy Commons`
  }, [title])

  return (
    <PageFrame
      contentKey={current}
      tocMin={4}
      header={
        <PageTitle title={title} lede={lede}>
          <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 font-sans text-[13px] leading-snug">
            {doc.effectiveDate && (
              <div>
                <dt className="text-ink">Effective</dt>
                <dd className="mt-0.5 font-mono text-[12.5px] text-ink">
                  <time dateTime={doc.effectiveIso ?? undefined}>{doc.effectiveDate}</time>
                </dd>
              </div>
            )}
            {doc.meta.map(m => (
              <div key={m.label}>
                <dt className="text-ink">{m.label}</dt>
                <dd className="mt-0.5 font-medium text-ink">{m.value}</dd>
              </div>
            ))}
            <div>
              <dt className="text-ink">Source</dt>
              <dd className="mt-0.5">
                <a
                  href={`https://github.com/JoshuaSemock/pharmacycommons.org/blob/main/${page?.file ?? ''}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`font-mono text-[12.5px] ${linkClass}`}
                >
                  {page?.file}
                </a>
              </dd>
            </div>
          </dl>
        </PageTitle>
      }
    >
      <div className="pt-4">
        <Markdown source={doc.body} />
      </div>

      <aside
        aria-label="Contact and related policies"
        className="mt-14 space-y-8 border-t border-mint-200 pt-8"
      >
        <div className="border-l-2 border-hepatica-300 py-1 pl-4 sm:pl-5">
          <p
            className="font-display text-[19px] font-semibold leading-snug text-ink"
            style={{ fontFamily: 'var(--font-display)', fontSize: '19px' }}
          >
            Questions about this policy?
          </p>
          <p className="mt-1.5 font-sans text-[14.5px] leading-relaxed text-ink">
            Write to the maintainers, including for account deletion or a content removal
            request:{' '}
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className={`break-all font-mono text-[13.5px] ${linkClass}`}>
              {LEGAL_CONTACT_EMAIL}
            </a>
          </p>
        </div>

        <nav aria-label="Related policies">
          <p className="mb-3 font-sans text-[12.5px] font-medium text-ink">Related policies</p>
          <ul className="flex flex-col gap-2 font-sans text-[14.5px] sm:flex-row sm:flex-wrap sm:gap-x-6">
            {related.map(p => (
              <li key={p.to}>
                <Link to={p.to} className={linkClass}>
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </PageFrame>
  )
}

const linkClass =
  'text-ink underline decoration-mint-300 underline-offset-2 transition-colors hover:decoration-mint-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
