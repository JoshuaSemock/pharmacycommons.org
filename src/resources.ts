/**
 * Outside links for the Resources page.
 *
 * Everything here is a place we send readers, not a place we draw data from.
 * Nothing in this file feeds a Pharmacy Commons record, and nothing here is
 * cited. Datasets the Commons is built from belong in `sources.ts`, which
 * drives the References page. Don't list the same site in both.
 *
 * Re-check links when LINKS_CHECKED gets old. Several .gov and publisher
 * sites (CDC, DEA, Cochrane, HIV.gov) block scripted checkers, so open those
 * in a browser rather than trusting a 403.
 */

export type ExternalLink = {
  /** Stable key, used for React keys. */
  id: string
  name: string
  href: string
  /** Who runs it. */
  publisher: string
  /** One sentence on what a reader will find there. */
  note: string
  /** Short labels such as region or "Free registration". Omit when free and US. */
  badges?: string[]
}

export type LinkGroup = {
  id: string
  heading: string
  intro: string
  links: ExternalLink[]
}

/** Date every link below was last opened and confirmed. */
export const LINKS_CHECKED = '2026-09-25'

const GUIDELINES: ExternalLink[] = [
  {
    id: 'uspstf',
    name: 'USPSTF Recommendations',
    href: 'https://www.uspreventiveservicestaskforce.org/uspstf/recommendation-topics',
    publisher: 'US Preventive Services Task Force',
    note: 'Graded recommendations on screening, counseling, and preventive medications such as aspirin, statins, and PrEP.',
  },
  {
    id: 'acip',
    name: 'ACIP',
    href: 'https://www.cdc.gov/acip/',
    publisher: 'Advisory Committee on Immunization Practices, CDC',
    note: 'US vaccine recommendations, meeting records, and the evidence reviews behind the immunization schedules.',
  },
  {
    id: 'hivguidelines',
    name: 'HIV Clinical Guidelines',
    href: 'https://clinicalinfo.hiv.gov/en/guidelines',
    publisher: 'US Department of Health and Human Services',
    note: 'Antiretroviral therapy for adults, children, and pregnancy, and prevention and treatment of opportunistic infections.',
  },
  {
    id: 'idsa',
    name: 'IDSA Practice Guidelines',
    href: 'https://www.idsociety.org/practice-guideline/practice-guidelines/',
    publisher: 'Infectious Diseases Society of America',
    note: 'Diagnosis and antimicrobial treatment guidelines, from resistant gram-negative infections to C. difficile.',
  },
  {
    id: 'accaha',
    name: 'ACC/AHA Clinical Guidelines',
    href: 'https://www.acc.org/guidelines',
    publisher: 'American College of Cardiology',
    note: 'Joint cardiology guidelines: hypertension, cholesterol, heart failure, atrial fibrillation, and more.',
  },
  {
    id: 'ada',
    name: 'Standards of Care in Diabetes',
    href: 'https://professional.diabetes.org/standards-of-care',
    publisher: 'American Diabetes Association',
    note: 'Updated every year, including the pharmacologic treatment algorithms for type 1 and type 2 diabetes.',
  },
  {
    id: 'kdigo',
    name: 'KDIGO Guidelines',
    href: 'https://kdigo.org/guidelines/',
    publisher: 'Kidney Disease: Improving Global Outcomes',
    note: 'Chronic kidney disease, acute kidney injury, anemia, and blood pressure in kidney disease.',
    badges: ['International'],
  },
  {
    id: 'gold',
    name: 'GOLD Report',
    href: 'https://goldcopd.org/',
    publisher: 'Global Initiative for Chronic Obstructive Lung Disease',
    note: 'The yearly COPD strategy report, including inhaler selection and escalation.',
    badges: ['International'],
  },
  {
    id: 'gina',
    name: 'GINA Report',
    href: 'https://ginasthma.org/',
    publisher: 'Global Initiative for Asthma',
    note: 'The yearly asthma strategy report, with step-based treatment tracks.',
    badges: ['International'],
  },
  {
    id: 'nccn',
    name: 'NCCN Guidelines',
    href: 'https://www.nccn.org/guidelines/category_1',
    publisher: 'National Comprehensive Cancer Network',
    note: 'Treatment guidelines by cancer type, plus supportive care such as antiemesis.',
    badges: ['Free registration'],
  },
  {
    id: 'cpic',
    name: 'CPIC Guidelines',
    href: 'https://www.clinpgx.org/cpic/guidelines',
    publisher: 'Clinical Pharmacogenetics Implementation Consortium',
    note: 'How to adjust drug choice or dose once a genotype result is known.',
    badges: ['International'],
  },
  {
    id: 'nice',
    name: 'NICE Guidance',
    href: 'https://www.nice.org.uk/guidance',
    publisher: 'National Institute for Health and Care Excellence',
    note: 'Clinical guidelines and technology appraisals for England, useful for a second view on US guidance.',
    badges: ['UK'],
  },
  {
    id: 'who',
    name: 'WHO Guidelines',
    href: 'https://www.who.int/publications/who-guidelines',
    publisher: 'World Health Organization',
    note: 'Global guidelines, often written for settings with limited resources.',
    badges: ['International'],
  },
]

const TRIALS: ExternalLink[] = [
  {
    id: 'clinicaltrials',
    name: 'ClinicalTrials.gov',
    href: 'https://clinicaltrials.gov/',
    publisher: 'US National Library of Medicine',
    note: 'Registered studies worldwide, with recruitment status, eligibility, and posted results.',
  },
  {
    id: 'ictrp',
    name: 'WHO ICTRP Search Portal',
    href: 'https://trialsearch.who.int/',
    publisher: 'World Health Organization',
    note: 'Searches the trial registries of many countries at once, including ones ClinicalTrials.gov does not cover.',
    badges: ['International'],
  },
  {
    id: 'ctis',
    name: 'EU Clinical Trials',
    href: 'https://euclinicaltrials.eu/',
    publisher: 'European Medicines Agency',
    note: 'Trials authorized in the European Union and European Economic Area.',
    badges: ['EU'],
  },
  {
    id: 'isrctn',
    name: 'ISRCTN Registry',
    href: 'https://www.isrctn.com/',
    publisher: 'BioMed Central',
    note: 'A primary registry recognized by WHO, strong on UK and academic studies.',
    badges: ['International'],
  },
  {
    id: 'pubmed',
    name: 'PubMed',
    href: 'https://pubmed.ncbi.nlm.nih.gov/',
    publisher: 'US National Library of Medicine',
    note: 'Biomedical literature search. Filter by article type for trials, meta-analyses, and guidelines.',
  },
  {
    id: 'cochrane',
    name: 'Cochrane Library',
    href: 'https://www.cochranelibrary.com/',
    publisher: 'Cochrane',
    note: 'Systematic reviews of interventions. Abstracts and plain-language summaries are free.',
    badges: ['Partly subscription'],
  },
  {
    id: 'epistemonikos',
    name: 'Epistemonikos',
    href: 'https://www.epistemonikos.org/',
    publisher: 'Epistemonikos Foundation',
    note: 'Links systematic reviews to the primary studies they include.',
    badges: ['International'],
  },
]

const LISTS: ExternalLink[] = [
  {
    id: 'eml',
    name: 'WHO Model List of Essential Medicines',
    href: 'https://list.essentialmeds.org/',
    publisher: 'World Health Organization',
    note: 'The medicines WHO considers essential for a basic health system, for adults and children.',
    badges: ['International'],
  },
  {
    id: 'niosh',
    name: 'NIOSH Hazardous Drugs',
    href: 'https://www.cdc.gov/niosh/healthcare/hazardous-drugs/',
    publisher: 'National Institute for Occupational Safety and Health',
    note: 'The list of drugs that need special handling in healthcare settings, with the handling guidance.',
  },
  {
    id: 'ismphighalert',
    name: 'ISMP High-Alert Medications (acute care)',
    href: 'https://home.ecri.org/blogs/guidance-insights-tools/high-alert-medications-in-acute-care-settings',
    publisher: 'ISMP, part of ECRI',
    note: 'Drugs with a heightened risk of significant harm when used in error.',
  },
  {
    id: 'ismp',
    name: 'ISMP lists and recommendations',
    href: 'https://home.ecri.org/pages/ismp',
    publisher: 'ISMP, part of ECRI',
    note: "Where ISMP's other lists now live, including Do Not Crush and Confused Drug Names.",
  },
  {
    id: 'deaschedules',
    name: 'Controlled substances by schedule',
    href: 'https://www.deadiversion.usdoj.gov/schedules/orangebook/c_cs_alpha.pdf',
    publisher: 'US Drug Enforcement Administration',
    note: 'Alphabetical list of federally controlled substances and their schedules (PDF). State schedules can be stricter.',
  },
  {
    id: 'orangebook',
    name: 'Orange Book',
    href: 'https://www.accessdata.fda.gov/scripts/cder/ob/',
    publisher: 'US Food and Drug Administration',
    note: 'Approved drug products with therapeutic equivalence (AB) ratings, patents, and exclusivity.',
  },
  {
    id: 'purplebook',
    name: 'Purple Book',
    href: 'https://purplebooksearch.fda.gov/',
    publisher: 'US Food and Drug Administration',
    note: 'Licensed biologics, biosimilars, and interchangeable products.',
  },
  {
    id: 'fdashortages',
    name: 'FDA Drug Shortages',
    href: 'https://www.accessdata.fda.gov/scripts/drugshortages/',
    publisher: 'US Food and Drug Administration',
    note: 'Current and resolved shortages, with reasons and expected recovery dates.',
  },
  {
    id: 'fdaddi',
    name: 'FDA table of substrates, inhibitors, and inducers',
    href: 'https://www.fda.gov/drugs/drug-interactions-labeling/drug-development-and-drug-interactions-table-substrates-inhibitors-and-inducers',
    publisher: 'US Food and Drug Administration',
    note: 'Reference drugs for CYP enzymes and transporters, as used in interaction studies.',
  },
  {
    id: 'crediblemeds',
    name: 'CredibleMeds QTdrugs Lists',
    href: 'https://www.crediblemeds.org/',
    publisher: 'CredibleMeds',
    note: 'Drugs ranked by risk of QT prolongation and torsades de pointes.',
    badges: ['Free registration'],
  },
]

const REFERENCE: ExternalLink[] = [
  {
    id: 'medlineplus',
    name: 'MedlinePlus Drugs and Supplements',
    href: 'https://medlineplus.gov/druginformation.html',
    publisher: 'US National Library of Medicine',
    note: 'Plain-language drug information written for patients and families.',
  },
  {
    id: 'livertox',
    name: 'LiverTox',
    href: 'https://www.ncbi.nlm.nih.gov/books/NBK547852/',
    publisher: 'National Institute of Diabetes and Digestive and Kidney Diseases',
    note: 'Drug-induced liver injury by agent, with likelihood scores and case reports.',
  },
  {
    id: 'clinpgx',
    name: 'ClinPGx (formerly PharmGKB)',
    href: 'https://www.clinpgx.org/',
    publisher: 'Stanford University',
    note: 'Curated gene-drug evidence, drug label annotations, and pathways.',
  },
  {
    id: 'fdadsc',
    name: 'FDA Drug Safety Communications',
    href: 'https://www.fda.gov/drugs/drug-safety-and-availability/drug-safety-communications',
    publisher: 'US Food and Drug Administration',
    note: 'New safety findings and labeling changes as FDA announces them.',
  },
  {
    id: 'ema',
    name: 'EMA Medicines',
    href: 'https://www.ema.europa.eu/en/medicines',
    publisher: 'European Medicines Agency',
    note: 'European product information and assessment reports, for comparison with US labeling.',
    badges: ['EU'],
  },
]

const SAFETY: ExternalLink[] = [
  {
    id: 'medwatch',
    name: 'MedWatch',
    href: 'https://www.fda.gov/safety/medwatch-fda-safety-information-and-adverse-event-reporting-program',
    publisher: 'US Food and Drug Administration',
    note: 'Report a side effect, a product problem, or a medication error to FDA.',
  },
  {
    id: 'vaers',
    name: 'VAERS',
    href: 'https://vaers.hhs.gov/',
    publisher: 'CDC and FDA',
    note: 'Report an adverse event after vaccination.',
  },
  {
    id: 'ismperrors',
    name: 'ECRI and ISMP Error Reporting',
    href: 'https://home.ecri.org/pages/ecri-ismp-error-reporting-system',
    publisher: 'ISMP, part of ECRI',
    note: 'Confidential reporting of medication errors and near misses.',
  },
  {
    id: 'poison',
    name: 'Poison Control',
    href: 'https://www.poison.org/',
    publisher: "America's Poison Centers and the National Capital Poison Center",
    note: 'Online triage for poisonings and overdoses. By phone, 1-800-222-1222 anywhere in the US.',
  },
  {
    id: 'fdadisposal',
    name: 'Disposal of unused medicines',
    href: 'https://www.fda.gov/drugs/safe-disposal-medicines/disposal-unused-medicines-what-you-should-know',
    publisher: 'US Food and Drug Administration',
    note: 'How to get rid of medicines at home, and which few are on the flush list.',
  },
  {
    id: 'takeback',
    name: 'Drug take-back locations',
    href: 'https://www.deadiversion.usdoj.gov/drug_disposal/takeback/',
    publisher: 'US Drug Enforcement Administration',
    note: 'Find a year-round collection site. Take-back keeps drugs out of water and soil.',
  },
]

export const LINK_GROUPS: LinkGroup[] = [
  {
    id: 'guidelines',
    heading: 'Guideline recommendations',
    intro: 'Who recommends what, and when to use it. Check the edition year: most of these are revised every one to three years.',
    links: GUIDELINES,
  },
  {
    id: 'trials-and-evidence',
    heading: 'Clinical trials and evidence',
    intro: 'Registries for ongoing and completed studies, and places to find the reviews that summarize them.',
    links: TRIALS,
  },
  {
    id: 'outside-lists',
    heading: 'Drug lists kept elsewhere',
    intro: 'Authority lists we have not imported into Lists yet. The source keeps the current edition.',
    links: LISTS,
  },
  {
    id: 'other-references',
    heading: 'Other drug references',
    intro: 'Useful references that are not upstream of anything on this site.',
    links: REFERENCE,
  },
  {
    id: 'report-and-dispose',
    heading: 'Report and dispose',
    intro: 'Where to report a problem with a medicine, and how to get rid of one safely.',
    links: SAFETY,
  },
]

export const ALL_LINKS: ExternalLink[] = LINK_GROUPS.flatMap(g => g.links)
