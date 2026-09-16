/**
 * Tool registry, shared by the Tools page and the Tools menu in the nav.
 * A tool with a `to` route is linked from both; everything else is listed on
 * the Tools page only.
 */

export type ToolStatus = 'live' | 'building' | 'planned'
export type ToolGroup = 'clinical' | 'environmental'

export type Tool = {
  id: string
  name: string
  /** Full description for the Tools page. */
  blurb: string
  /** One line for the nav menu. Required for any tool with a route. */
  summary?: string
  status: ToolStatus
  group: ToolGroup
  to?: string
}

export const TOOLS: Tool[] = [
  {
    id: 'creatinine-clearance',
    name: 'Creatinine clearance',
    blurb: 'Cockcroft-Gault with actual, ideal, and adjusted body weight side by side, so the weight choice is explicit rather than buried.',
    summary: 'Cockcroft-Gault by body weight, plus eGFR',
    status: 'building',
    group: 'clinical',
    to: '/tools/creatinine-clearance',
  },
  {
    id: 'body-surface-area',
    name: 'Body surface area',
    blurb: 'Mosteller and Du Bois, with the divergence between them shown — it matters at the extremes of size.',
    status: 'planned',
    group: 'clinical',
  },
  {
    id: 'mme',
    name: 'Morphine milligram equivalents',
    blurb: 'Opioid conversion with the conversion factor and its source shown for every step, not just the total.',
    status: 'planned',
    group: 'clinical',
  },
  {
    id: 'lab-arithmetic',
    name: 'Corrected calcium, anion gap, osmolal gap',
    blurb: 'The short arithmetic that gets done wrong under time pressure.',
    status: 'planned',
    group: 'clinical',
  },
  {
    id: 'risk-quotient',
    name: 'Risk quotient calculator',
    blurb: 'PEC ÷ PNEC from consumption data, excretion fraction, and wastewater removal rate — the same computation that drives the eco-risk field on each monograph.',
    status: 'planned',
    group: 'environmental',
  },
  {
    id: 'pec-estimator',
    name: 'PEC estimator',
    blurb: 'Predicted environmental concentration from defined daily dose, population served, and per-capita wastewater volume.',
    status: 'planned',
    group: 'environmental',
  },
]

/** Tools that have a page, in registry order. */
export const ROUTED_TOOLS = TOOLS.filter((t): t is Tool & { to: string } => Boolean(t.to))

export const toolsIn = (group: ToolGroup) => TOOLS.filter(t => t.group === group)
