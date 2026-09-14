import PageShell from './PageShell'

type Source = {
  name: string
  href: string
  role: string
  license?: string
}

const REGULATORY: Source[] = [
  {
    name: 'openFDA',
    href: 'https://open.fda.gov/',
    role: 'Adverse event reports, NDC directory, and structured product labeling. The primary feed for US product-level data.',
    license: 'US public domain',
  },
  {
    name: 'Drugs@FDA',
    href: 'https://www.accessdata.fda.gov/scripts/cder/daf/',
    role: 'Application numbers, submissions, approval dates, and marketing status for approved products.',
    license: 'US public domain',
  },
  {
    name: 'DailyMed (NLM)',
    href: 'https://dailymed.nlm.nih.gov/dailymed/',
    role: 'Current package inserts and established pharmacologic class assignments.',
    license: 'US public domain',
  },
  {
    name: 'FDA REMS',
    href: 'https://www.accessdata.fda.gov/scripts/cder/rems/',
    role: 'Risk Evaluation and Mitigation Strategy requirements by product.',
    license: 'US public domain',
  },
]

const CLASSIFICATION: Source[] = [
  {
    name: 'WHO ATC/DDD Index',
    href: 'https://atcddd.fhi.no/atc_ddd_index/',
    role: 'Anatomical Therapeutic Chemical hierarchy and defined daily doses — the backbone of both the class pages and the per-capita consumption estimates feeding environmental risk.',
  },
  {
    name: 'ChemOnt / ClassyFire',
    href: 'http://classyfire.wishartlab.com/',
    role: 'Structure-based chemical taxonomy, used for the chemical-class dimension distinct from therapeutic class.',
  },
  {
    name: 'CAS Common Chemistry',
    href: 'https://commonchemistry.cas.org/',
    role: 'CAS registry numbers, molecular formulas, and structure identifiers for the physiochemical layer.',
    license: 'CC BY-NC 4.0',
  },
  {
    name: 'DrugBank',
    href: 'https://go.drugbank.com/',
    role: 'Vocabulary and classification cross-references used to reconcile identifiers across sources.',
    license: 'CC BY-NC 4.0',
  },
]

const SPECIALIZED: Source[] = [
  {
    name: 'LactMed (NIH Bookshelf)',
    href: 'https://www.ncbi.nlm.nih.gov/books/NBK501922/',
    role: 'Drug levels in breast milk and effects on the nursing infant.',
    license: 'US public domain',
  },
  {
    name: 'FDA Table of Pharmacogenomic Associations',
    href: 'https://www.fda.gov/medical-devices/precision-medicine/table-pharmacogenetic-associations',
    role: 'Gene-drug associations with recognized evidence of clinical impact.',
    license: 'US public domain',
  },
  {
    name: 'EPA ECOTOX Knowledgebase',
    href: 'https://cfpub.epa.gov/ecotox/',
    role: 'Aquatic and terrestrial toxicity endpoints. The PNEC denominator in every risk quotient on this site.',
    license: 'US public domain',
  },
  {
    name: 'PubChem',
    href: 'https://pubchem.ncbi.nlm.nih.gov/',
    role: 'Compound records, synonyms, and physicochemical properties.',
    license: 'US public domain',
  },
]

export default function Resources() {
  return (
    <PageShell
      kicker="Resources"
      title="Where the data comes from"
      lede="Pharmacy Commons is a restructuring of public data, not a new source of it. Everything below is upstream of something on this site. Go to the primary record when the stakes are clinical."
    >
      <SourceList heading="Regulatory and product data" sources={REGULATORY} />
      <SourceList heading="Classification and chemistry" sources={CLASSIFICATION} />
      <SourceList heading="Specialized datasets" sources={SPECIALIZED} />

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
          <li key={source.name} className="border-l-2 border-sage-200 pl-4">
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
