import type { SourceCitation } from './cite'

/**
 * Upstream datasets, shared by the Resources and Citations pages.
 *
 * `cite` is what we tell users to cite. Where the maintainer publishes a
 * preferred article (ClassyFire, DrugBank, PubChem, ECOTOX), that article is
 * used; everything else is cited as the resource itself. Article metadata is
 * copied from PubMed — re-check it when a newer update paper comes out.
 */

export type Source = {
  /** Stable key — used for BibTeX keys and React keys. */
  id: string
  name: string
  href: string
  role: string
  license?: string
  cite: SourceCitation
}

export type SourceGroup = {
  id: string
  heading: string
  sources: Source[]
}

const FDA = {
  publisher: 'US Food and Drug Administration',
  place: 'Silver Spring (MD)',
  nlmPublisher: 'Food and Drug Administration (US)',
} as const

const NLM = {
  publisher: 'US National Library of Medicine',
  place: 'Bethesda (MD)',
  nlmPublisher: 'National Library of Medicine (US)',
} as const

const REGULATORY: Source[] = [
  {
    id: 'openfda',
    name: 'openFDA',
    href: 'https://open.fda.gov/',
    role: 'Adverse event reports, NDC directory, and structured product labeling. The primary feed for US product-level data.',
    license: 'US public domain',
    cite: { kind: 'web', title: 'openFDA', ...FDA },
  },
  {
    id: 'drugsatfda',
    name: 'Drugs@FDA',
    href: 'https://www.accessdata.fda.gov/scripts/cder/daf/',
    role: 'Application numbers, submissions, approval dates, and marketing status for approved products.',
    license: 'US public domain',
    cite: { kind: 'web', title: 'Drugs@FDA: FDA-Approved Drugs', ...FDA },
  },
  {
    id: 'dailymed',
    name: 'DailyMed (NLM)',
    href: 'https://dailymed.nlm.nih.gov/dailymed/',
    role: 'Current package inserts and established pharmacologic class assignments.',
    license: 'US public domain',
    cite: { kind: 'web', title: 'DailyMed', ...NLM },
  },
  {
    id: 'fdarems',
    name: 'FDA REMS',
    href: 'https://www.accessdata.fda.gov/scripts/cder/rems/',
    role: 'Risk Evaluation and Mitigation Strategy requirements by product.',
    license: 'US public domain',
    cite: { kind: 'web', title: 'Approved Risk Evaluation and Mitigation Strategies (REMS)', ...FDA },
  },
]

const CLASSIFICATION: Source[] = [
  {
    id: 'whoatcddd',
    name: 'WHO ATC/DDD Index',
    href: 'https://atcddd.fhi.no/atc_ddd_index/',
    role: 'Anatomical Therapeutic Chemical hierarchy and defined daily doses — the backbone of both the class pages and the per-capita consumption estimates feeding environmental risk.',
    cite: {
      kind: 'web',
      title: 'ATC/DDD Index',
      editionYear: true,
      publisher: 'WHO Collaborating Centre for Drug Statistics Methodology',
      place: 'Oslo (Norway)',
      nlmPublisher: 'WHO Collaborating Centre for Drug Statistics Methodology',
    },
  },
  {
    id: 'classyfire',
    name: 'ChemOnt / ClassyFire',
    href: 'http://classyfire.wishartlab.com/',
    role: 'Structure-based chemical taxonomy, used for the chemical-class dimension distinct from therapeutic class.',
    cite: {
      kind: 'article',
      authors: [
        'Djoumbou Feunang Y', 'Eisner R', 'Knox C', 'Chepelev L', 'Hastings J', 'Owen G',
        'Fahy E', 'Steinbeck C', 'Subramanian S', 'Bolton E', 'Greiner R', 'Wishart DS',
      ],
      title: 'ClassyFire: automated chemical classification with a comprehensive, computable taxonomy',
      journal: 'Journal of Cheminformatics',
      journalAbbr: 'J Cheminform',
      year: 2016,
      volume: '8',
      pages: '61',
      doi: '10.1186/s13321-016-0174-y',
      pmid: '27867422',
    },
  },
  {
    id: 'cascommonchemistry',
    name: 'CAS Common Chemistry',
    href: 'https://commonchemistry.cas.org/',
    role: 'CAS registry numbers, molecular formulas, and structure identifiers for the physicochemical layer.',
    license: 'CC BY-NC 4.0',
    cite: {
      kind: 'web',
      title: 'CAS Common Chemistry',
      publisher: 'CAS, a division of the American Chemical Society',
      place: 'Columbus (OH)',
      nlmPublisher: 'CAS, a division of the American Chemical Society',
    },
  },
  {
    id: 'drugbank',
    name: 'DrugBank',
    href: 'https://go.drugbank.com/',
    role: 'Vocabulary and classification cross-references used to reconcile identifiers across sources.',
    license: 'CC BY-NC 4.0',
    cite: {
      kind: 'article',
      authors: [
        'Knox C', 'Wilson M', 'Klinger CM', 'Franklin M', 'Oler E', 'Wilson A', 'Pon A',
        'Cox J', 'Chin NEL', 'Strawbridge SA', 'Garcia-Patino M', 'Kruger R',
        'Sivakumaran A', 'Sanford S', 'Doshi R', 'Khetarpal N', 'Fatokun O', 'Doucet D',
        'Zubkowski A', 'Rayat DY', 'Jackson H', 'Harford K', 'Anjum A', 'Zakir M',
        'Wang F', 'Tian S', 'Lee B', 'Liigand J', 'Peters H', 'Wang RQR', 'Nguyen T',
        'So D', 'Sharp M', 'da Silva R', 'Gabriel C', 'Scantlebury J', 'Jasinski M',
        'Ackerman D', 'Jewison T', 'Sajed T', 'Gautam V', 'Wishart DS',
      ],
      title: 'DrugBank 6.0: the DrugBank Knowledgebase for 2024',
      journal: 'Nucleic Acids Research',
      journalAbbr: 'Nucleic Acids Res',
      year: 2024,
      volume: '52',
      issue: 'D1',
      pages: 'D1265-D1275',
      doi: '10.1093/nar/gkad976',
      pmid: '37953279',
    },
  },
]

const SPECIALIZED: Source[] = [
  {
    id: 'lactmed',
    name: 'LactMed (NIH Bookshelf)',
    href: 'https://www.ncbi.nlm.nih.gov/books/NBK501922/',
    role: 'Drug levels in breast milk and effects on the nursing infant.',
    license: 'US public domain',
    cite: {
      kind: 'web',
      title: 'Drugs and Lactation Database (LactMed)',
      publisher: 'National Institute of Child Health and Human Development',
      place: 'Bethesda (MD)',
      nlmPublisher: 'National Institute of Child Health and Human Development',
      since: 2006,
    },
  },
  {
    id: 'fdapgx',
    name: 'FDA Table of Pharmacogenetic Associations',
    href: 'https://www.fda.gov/medical-devices/precision-medicine/table-pharmacogenetic-associations',
    role: 'Gene-drug associations with recognized evidence of clinical impact.',
    license: 'US public domain',
    cite: { kind: 'web', title: 'Table of Pharmacogenetic Associations', ...FDA },
  },
  {
    id: 'ecotox',
    name: 'EPA ECOTOX Knowledgebase',
    href: 'https://cfpub.epa.gov/ecotox/',
    role: 'Aquatic and terrestrial toxicity endpoints. The PNEC denominator in every risk quotient on this site.',
    license: 'US public domain',
    cite: {
      kind: 'article',
      authors: [
        'Olker JH', 'Elonen CM', 'Pilli A', 'Anderson A', 'Kinziger B', 'Erickson S',
        'Skopinski M', 'Pomplun A', 'LaLone CA', 'Russom CL', 'Hoff D',
      ],
      title: 'The ECOTOXicology Knowledgebase: a curated database of ecologically relevant toxicity tests to support environmental research and risk assessment',
      journal: 'Environmental Toxicology and Chemistry',
      journalAbbr: 'Environ Toxicol Chem',
      year: 2022,
      volume: '41',
      issue: '6',
      pages: '1520-1539',
      doi: '10.1002/etc.5324',
      pmid: '35262228',
    },
  },
  {
    id: 'pubchem',
    name: 'PubChem',
    href: 'https://pubchem.ncbi.nlm.nih.gov/',
    role: 'Compound records, synonyms, and physicochemical properties.',
    license: 'US public domain',
    cite: {
      kind: 'article',
      authors: [
        'Kim S', 'Chen J', 'Cheng T', 'Gindulyte A', 'He J', 'He S', 'Li Q',
        'Shoemaker BA', 'Thiessen PA', 'Yu B', 'Zaslavsky L', 'Zhang J', 'Bolton EE',
      ],
      title: 'PubChem 2025 update',
      journal: 'Nucleic Acids Research',
      journalAbbr: 'Nucleic Acids Res',
      year: 2025,
      volume: '53',
      issue: 'D1',
      pages: 'D1516-D1525',
      doi: '10.1093/nar/gkae1059',
      pmid: '39558165',
    },
  },
]

export const SOURCE_GROUPS: SourceGroup[] = [
  { id: 'regulatory-and-product-data', heading: 'Regulatory and product data', sources: REGULATORY },
  { id: 'classification-and-chemistry', heading: 'Classification and chemistry', sources: CLASSIFICATION },
  { id: 'specialized-datasets', heading: 'Specialized datasets', sources: SPECIALIZED },
]

export const ALL_SOURCES: Source[] = SOURCE_GROUPS.flatMap(g => g.sources)
