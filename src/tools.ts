/**
 * Tool registry, shared by the Tools page and the Tools menu in the nav.
 *
 * Each tool is one markdown file in src/content/tools/, named <id>.md. Adding a
 * tool means adding a file, no code change. The front matter holds the fields
 * and the body is the full description for the Tools page:
 *
 *   ---
 *   name: "Days supply and quantity"
 *   status: live                 # live, building or planned
 *   section: calculators         # one of TOOL_SECTIONS below
 *   order: 30                    # page and menu order; lower first
 *   to: "/tools/days-supply"     # a page on this site, or
 *   api_path: "/v1"              # a path on the public API (opens in a new tab)
 *   summary: "One line for the nav menu"
 *   keywords:                    # other names people use; give every tool some
 *     - "dosing calculator"
 *   ---
 *   The full description, plain text.
 *
 * Files are parsed at build time (the `?fm` import, src/frontmatterParse.ts), so
 * no YAML library ships to the browser. A file that cannot be used is left out and
 * src/tools.test.ts fails.
 *
 * The Tools page lists every entry, section by section, in `order`,
 * followed by the third-party calculators. The nav menu shows the same
 * sections but only the tools that are active (live, with somewhere to go);
 * a section with no active tools is left out of the menu.
 */
import { CURRENT_API_BASE } from './developers/endpoints'
import { readList, readText } from './frontmatter'
import type { FrontmatterResult } from './frontmatter'

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
  /** Other names people use for it. The header search matches these, so "dosing calculator" finds Days supply. */
  keywords?: string[]
  status: ToolStatus
  section: ToolSectionId
  /** A page on this site. */
  to?: string
  /** An address off this site (opens in a new tab). */
  href?: string
  /** Page and menu order within the file set; lower first. */
  order?: number
}

const FILES = import.meta.glob<FrontmatterResult>('./content/tools/*.md', {
  query: '?fm',
  import: 'default',
  eager: true,
})

const STATUSES: readonly ToolStatus[] = ['live', 'building', 'planned']
const SECTION_IDS: readonly string[] = TOOL_SECTIONS.map(s => s.id)

/** Why a tool file cannot be used, or null. Exported for tests. */
export function toolProblem({ meta, body, error }: FrontmatterResult): string | null {
  if (error) return `front matter could not be read: ${error}`
  if (!readText(meta, 'name')) return 'name is missing'
  if (!STATUSES.includes(readText(meta, 'status') as ToolStatus)) return 'status must be live, building or planned'
  if (!SECTION_IDS.includes(readText(meta, 'section') ?? '')) return `section must be one of ${SECTION_IDS.join(', ')}`
  if (!body) return 'the body (the description) is empty'
  const to = readText(meta, 'to')
  if (to && !to.startsWith('/')) return 'to must be a path starting with /'
  const apiPath = readText(meta, 'api_path')
  if (apiPath && !apiPath.startsWith('/')) return 'api_path must start with /'
  if (to && apiPath) return 'give to or api_path, not both'
  if (readText(meta, 'status') === 'live' && !to && !apiPath) return 'a live tool needs to or api_path'
  return null
}

/** Exported for tests. Returns null for a file that cannot be used. */
export function buildTool(path: string, fm: FrontmatterResult): Tool | null {
  if (toolProblem(fm)) return null
  const { meta, body } = fm
  const apiPath = readText(meta, 'api_path')
  const order = Number(readText(meta, 'order') ?? 0)
  return {
    id: (path.split('/').pop() ?? '').replace(/\.md$/, ''),
    name: readText(meta, 'name') as string,
    blurb: body,
    summary: readText(meta, 'summary'),
    keywords: readList(meta, 'keywords').length ? readList(meta, 'keywords') : undefined,
    status: readText(meta, 'status') as ToolStatus,
    section: readText(meta, 'section') as ToolSectionId,
    to: readText(meta, 'to'),
    href: apiPath ? `${CURRENT_API_BASE}${apiPath}` : undefined,
    order: Number.isFinite(order) ? order : 0,
  }
}

export const TOOLS: Tool[] = Object.entries(FILES)
  .map(([path, fm]) => {
    const built = buildTool(path, fm)
    if (!built) console.warn(`[tools] ${path}: ${toolProblem(fm)}`)
    return built
  })
  .filter((t): t is Tool => t !== null)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.id < b.id ? -1 : 1))

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
