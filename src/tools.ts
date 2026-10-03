/**
 * Tool registry, shared by the Tools page and the Tools menu in the nav.
 *
 * The Tools page lists every entry, section by section, in the order below,
 * followed by the third-party calculators. The nav menu shows the same
 * sections but only the tools that are active (live, with somewhere to go);
 * a section with no active tools is left out of the menu.
 */
import { CURRENT_API_BASE } from './developers/endpoints'

export type ToolStatus = 'live' | 'building' | 'planned'

export type ToolSectionId = 'workup' | 'calculators' | 'lists' | 'reference' | 'environmental' | 'research' | 'planned'

export type ToolSection = { id: ToolSectionId; label: string }

/** Page and menu order. */
export const TOOL_SECTIONS: ToolSection[] = [
  { id: 'workup', label: 'Clinical workup' },
  { id: 'calculators', label: 'Clinical calculators' },
  { id: 'lists', label: 'Clinical lists' },
  { id: 'reference', label: 'Writing and reference' },
  { id: 'environmental', label: 'Environmental' },
  { id: 'research', label: 'Research' },
  { id: 'planned', label: 'Planned' },
]

export type Tool = {
  id: string
  name: string
  /** Full description for the Tools page. */
  blurb: string
  /** One line under the name in the nav menu. */
  summary?: string
  status: ToolStatus
  section: ToolSectionId
  /** A page on this site. */
  to?: string
  /** An address off this site (opens in a new tab). */
  href?: string
}

export const TOOLS: Tool[] = [
  // Clinical workup
  {
    id: 'medication-reconciliation',
    name: 'Medication reconciliation',
    blurb:
      'One complete list of prescriptions, over-the-counter products, supplements, herbals and alternative medicines, plus allergies and caffeine, nicotine, alcohol and recreational substance use. Directions are written out in full with no abbreviations, with the dose and 24-hour maximum calculated so they always agree. The list stays in your browser: save it as CSV, reopen it later, or print it.',
    summary: 'Medication list, allergies, and directions builder',
    status: 'live',
    section: 'workup',
    to: '/tools/medication-reconciliation',
  },

  // Clinical calculators
  {
    id: 'creatinine-clearance',
    name: 'Creatinine clearance',
    blurb:
      'Cockcroft-Gault with actual, ideal, adjusted, and lean body weight side by side, so the weight choice is explicit rather than buried. Adds CKD-EPI 2021 eGFR, CKD and AKI staging, amputation correction, and a renal dose check.',
    summary: 'Cockcroft-Gault by body weight, plus eGFR',
    status: 'live',
    section: 'calculators',
    to: '/tools/creatinine-clearance',
  },
  {
    id: 'body-surface-area',
    name: 'Body surface area',
    blurb: 'Mosteller and Du Bois, with the divergence between them shown — it matters at the extremes of size.',
    status: 'planned',
    section: 'calculators',
  },
  {
    id: 'days-supply',
    name: 'Days supply and quantity',
    blurb:
      'Quantity from directions and days, or days from quantity, with package size, priming, drops per mL, and in-use limits counted in. Covers tablets, liquids, eye and ear drops, inhalers, insulin, and injectables including GLP-1 pens. Where the manufacturer and the payer disagree, both results are shown.',
    summary: 'Quantity to dispense, or days a quantity lasts',
    status: 'live',
    section: 'calculators',
    to: '/tools/days-supply',
  },
  {
    id: 'mme',
    name: 'Morphine milligram equivalents',
    blurb: 'Opioid conversion with the conversion factor and its source shown for every step, not just the total.',
    status: 'planned',
    section: 'calculators',
  },
  {
    id: 'lab-arithmetic',
    name: 'Corrected calcium, anion gap, osmolal gap',
    blurb: 'The short arithmetic that gets done wrong under time pressure.',
    status: 'planned',
    section: 'calculators',
  },

  // Clinical lists
  {
    id: 'do-not-crush',
    name: 'Do not crush list',
    blurb:
      'Oral dosage forms that should not be crushed or chewed, grouped by reason: modified release, transmucosal, irritant, unpleasant taste, and hazardous or teratogenic.',
    summary: 'Oral forms not to crush or chew, by reason',
    status: 'live',
    section: 'lists',
    to: '/lists/do-not-crush',
  },
  {
    id: 'qtc-prolonging',
    name: 'QTc prolonging medications list',
    blurb:
      'Medications that prolong the QT interval, with the level of risk for each. Part of the wider list of drugs that affect the risk of arrhythmias, which also covers Brugada syndrome.',
    summary: 'Drugs that prolong the QT interval, with risk',
    status: 'live',
    section: 'lists',
    to: '/lists/arrhythmia-risk-long-qt',
  },

  // Writing and reference
  {
    id: 'dictionary',
    name: 'Medical dictionary for Word',
    blurb:
      'A custom dictionary file for Microsoft Word with about 42,000 drug names, brand names, biologics, medical terms and abbreviations, so correct spellings stop being underlined and Word can suggest them. Step-by-step instructions for Windows and Mac, the full dictionary with definitions, and The Joint Commission "Do Not Use" abbreviations.',
    summary: 'Spell-check drug names and medical terms in Word',
    status: 'live',
    section: 'reference',
    to: '/tools/dictionary',
  },

  // Environmental
  {
    id: 'risk-quotient',
    name: 'Risk quotient',
    blurb:
      'PEC ÷ PNEC from consumption data, excretion fraction, and wastewater removal rate — the same computation that drives the eco-risk field on each monograph.',
    status: 'planned',
    section: 'environmental',
  },
  {
    id: 'pec-estimator',
    name: 'PEC estimator',
    blurb: 'Predicted environmental concentration from defined daily dose, population served, and per-capita wastewater volume.',
    status: 'planned',
    section: 'environmental',
  },

  // Research
  {
    id: 'api',
    name: 'API',
    blurb:
      'The live, read-only API index: record types, counts, data sources and every endpoint, as JSON. No key needed.',
    summary: 'Live API index, as JSON',
    status: 'live',
    section: 'research',
    href: `${CURRENT_API_BASE}/v1`,
  },
  {
    id: 'developers',
    name: 'Developers',
    blurb:
      'How to use the API: a quickstart, a console that runs requests against the live data, every endpoint with examples, and the OpenAPI, JSON Schema and JSON-LD files.',
    summary: 'API guide, console, and endpoint reference',
    status: 'live',
    section: 'research',
    to: '/developers',
  },

  // Planned
  {
    id: 'pharmacopoe-ai',
    name: 'Pharmacopoe Ai',
    blurb:
      'A retrieval-grounded assistant answering from the Commons itself — monograph fields, label text, and environmental data — with every claim linked back to the record it came from. Scoped deliberately: it will decline questions the underlying data cannot support rather than generate a plausible answer. Not a diagnostic tool, and not a prescribing aid.',
    status: 'planned',
    section: 'planned',
  },
]

/** A tool is active when it is live and has somewhere to go. */
export const isActive = (tool: Tool): boolean => tool.status === 'live' && Boolean(tool.to || tool.href)

export const toolsIn = (section: ToolSectionId): Tool[] => TOOLS.filter(t => t.section === section)

/** Sections with at least one active tool, each with only its active tools. For the nav menu. */
export const ACTIVE_TOOL_SECTIONS: (ToolSection & { tools: Tool[] })[] = TOOL_SECTIONS.map(s => ({
  ...s,
  tools: toolsIn(s.id).filter(isActive),
})).filter(s => s.tools.length > 0)

export type ThirdPartyTool = {
  name: string
  publisher: string
  url: string
}

/**
 * Calculators on other sites. Listed on the Tools page only; Pharmacy Commons
 * does not check or maintain them.
 */
export const THIRD_PARTY_TOOLS: ThirdPartyTool[] = [
  {
    name: 'Creatinine clearance (Cockcroft-Gault equation)',
    publisher: 'MDCalc',
    url: 'https://www.mdcalc.com/calc/43/creatinine-clearance-cockcroft-gault-equation',
  },
  {
    name: 'Creatinine clearance calculator',
    publisher: 'ClinCalc',
    url: 'https://clincalc.com/kinetics/crcl.aspx',
  },
  {
    name: 'eGFR calculator',
    publisher: 'National Kidney Foundation',
    url: 'https://www.kidney.org/professionals/gfr_calculator',
  },
  {
    name: 'PREVENT calculator',
    publisher: 'American Heart Association',
    url: 'https://professional.heart.org/en/guidelines-and-statements/prevent-calculator',
  },
  {
    name: 'CHA₂DS₂-VASc score for atrial fibrillation stroke risk',
    publisher: 'MDCalc',
    url: 'https://www.mdcalc.com/calc/801/cha2ds2-vasc-score-atrial-fibrillation-stroke-risk',
  },
  {
    name: 'Mean arterial pressure (MAP)',
    publisher: 'MDCalc',
    url: 'https://www.mdcalc.com/calc/74/mean-arterial-pressure-map',
  },
]
