import { Link } from 'react-router-dom'
import PageShell, { Section } from './PageShell'

const linkClass =
  'text-aqua-700 underline decoration-aqua-300 underline-offset-2 hover:decoration-aqua-600'

export default function About() {
  return (
    <PageShell
      kicker="About"
      title="About Pharmacy Commons"
      lede="A free drug reference built from public sources such as the FDA, WHO, and NIH. The project is in early development."
    >
      <Section heading="What it is">
        <p>
          Pharmacy Commons organizes publicly available drug information into
          consistent, searchable pages. Each entry is meant to link back to the source
          it came from, so readers can check it for themselves.
        </p>
      </Section>

      <Section heading="Current status">
        <p>
          Search and browsing currently run on a fixed list of drug identifiers.
          Detailed drug content is being added gradually, so many pages are incomplete
          and features may change. Progress is documented in the{' '}
          <Link to="/blog/a-public-build-log" className={linkClass}>
            build log
          </Link>
          .
        </p>
      </Section>

      <Section heading="Environmental data">
        <p>
          Where reliable data exist, drug pages will include environmental measures
          such as risk quotients. These are estimates based on stated assumptions and
          are provided as supplementary context. The{' '}
          <Link to="/blog/what-a-risk-quotient-tells-you" className={linkClass}>
            risk quotient post
          </Link>{' '}
          explains what they can and cannot show.
        </p>
      </Section>

      <Section heading="Maintenance and licensing">
        <p>
          Pharmacy Commons is maintained by Joshua Semock, PharmD, and operates as a
          single-member LLC.
        </p>
        <p>
          Source code is licensed under GPL-3.0. Compiled datasets are released under
          Creative Commons terms, subject to the licenses of their original sources.
        </p>
      </Section>

      <Section heading="Disclaimer">
        <p>
          This site is for educational and informational purposes only. It is not
          medical advice and does not replace the judgment of a pharmacist, prescriber,
          or other licensed professional. Confirm information against current product
          labeling and primary sources.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Corrections and questions:{' '}
          <a href="mailto:contact@pharmacycommons.org" className={linkClass}>
            contact@pharmacycommons.org
          </a>
        </p>
      </Section>
    </PageShell>
  )
}
