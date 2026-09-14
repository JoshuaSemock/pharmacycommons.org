import PageShell, { Section } from './PageShell'

export default function About() {
  return (
    <PageShell
      kicker="About"
      title="A pharmacology reference held in common"
      lede="Pharmacy Commons restructures public drug data — FDA, WHO, NIH — into pages that are queryable, versioned, and open to correction. It is free to read, free to reuse, and free to argue with."
    >
      <Section heading="Why this exists">
        <p>
          The primary sources for drug information are already public. They are also
          scattered across incompatible formats, built for regulatory workflows rather
          than clinical ones, and effectively unreadable without tooling. The paid
          compendia that solve this problem solve it behind a paywall, which puts basic
          pharmacologic reference material out of reach for the students, prescribers,
          and patients who need it most.
        </p>
        <p>
          This project takes the same public data and gives it structure: one page per
          drug entity, consistent fields, resolvable identifiers, and a citation trail
          back to the source record.
        </p>
      </Section>

      <Section heading="Ecopharmacovigilance">
        <p>
          Every monograph carries an environmental layer alongside the clinical one —
          predicted environmental concentration, measured environmental concentration,
          risk quotient, and defined daily dose per capita where the data supports it.
        </p>
        <p>
          Pharmaceuticals reach surface water through excretion, improper disposal, and
          manufacturing discharge, and the downstream effects on aquatic organisms are
          measurable. When two agents are therapeutically interchangeable, the
          environmental profile is a legitimate tiebreaker. Making that profile visible
          at the point of reference is the only way it can inform a decision.
        </p>
      </Section>

      <Section heading="How pages change">
        <p>
          Monographs are wiki-editable. Edits do not write directly to live tables —
          they enter a revisions queue and are applied after review, with full version
          history retained. Source-derived fields stay traceable to their upstream
          record; interpretive content is attributable to its contributors.
        </p>
      </Section>

      <Section heading="Who maintains it">
        <p>
          Pharmacy Commons is built and maintained by Joshua Semock, PharmD. It is
          currently organized as a single-member LLC, with the intent to convert to a
          non-profit structure once the governance model and contributor base can
          support it.
        </p>
        <p>
          The codebase is licensed <strong className="font-medium text-sage-900">GPL-3.0</strong>.
          Aggregated datasets are released under Creative Commons terms, subject to the
          license conditions of their upstream sources.
        </p>
      </Section>

      <Section heading="What this is not">
        <p>
          Not medical advice, and not a substitute for clinical judgment or a licensed
          prescriber. Content is educational. Verify against the label and the primary
          literature before it touches patient care.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Corrections, data contributions, and licensing questions:{' '}
          <a
            href="mailto:contact@pharmacycommons.org"
            className="text-aqua-700 underline decoration-aqua-300 underline-offset-2 hover:decoration-aqua-600"
          >
            contact@pharmacycommons.org
          </a>
        </p>
      </Section>
    </PageShell>
  )
}
