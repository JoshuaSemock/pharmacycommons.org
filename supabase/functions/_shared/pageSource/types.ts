// GENERATED from src/pageSource/types.ts by scripts/sync-page-source.mjs — do not edit here.
/**
 * Types for the page source format (docs/page-editor.md).
 *
 * A page's source text is parsed into a PageModel: the community layer of the page
 * (lead, sections, structured block lines, order) with no copy of ingested data.
 * The model is position-free so that parse → serialize → parse is stable;
 * diagnostics carry line numbers instead.
 */

// ─── Registry (src/pageSource/registry.json, mirrored in public.block_schemas) ──

export type PageType = 'drug' | 'concept'

export type Grammar = 'keyed' | 'brands' | 'threshold'

export type LineForm = { form: string; meaning: string }

export type Measure = { label: string; unit: string | null; numeric: boolean }

export type GrammarSpec = {
  keys_from?: string
  null_token?: string
  max_value_length?: number
  measures?: Record<string, Measure>
  forms?: LineForm[]
  max_action_length?: number
}

export type BlockSchema = {
  name: string
  label: string
  grammar: Grammar
  region: 'rail' | 'section'
  owner_section: string | null
  page_types: PageType[]
  citation: 'on_change' | 'always'
  help: string
  example: string
  hints: string[]
  grammar_spec: GrammarSpec
  enabled: boolean
  sort_order: number
}

export type EmbedSchema = {
  name: string
  label: string
  region: 'rail' | 'main'
  page_types: PageType[]
  help: string
}

export type TemplateItem =
  | { kind: 'lead' }
  | { kind: 'embed'; name: string }
  | { kind: 'section'; id: string; heading: string; block: string | null; help: string }

export type PageTemplate = { page_type: PageType; rail: string[]; main: TemplateItem[] }

export type Registry = {
  version: number
  blocks: BlockSchema[]
  embeds: EmbedSchema[]
  templates: PageTemplate[]
}

/** One Quick Facts property, as stored in public.infobox_properties. */
export type InfoboxKey = { key: string; label: string; source_kind: string; entity_types: string[] }

// ─── What the parser needs to know about the page ──────────────────────────────

export type PageContext = {
  pageType: PageType
  /** Locked title, exactly as the page shows it. */
  title: string
  /** entities.entity_type, for which Quick Facts keys apply. */
  entityType: string
  infoboxKeys: InfoboxKey[]
  /** Brands the sources already list (entity_brand_names), for the brands block. */
  sourceBrands: string[]
  /** Current source value of each Quick Facts key, for the # comments. null = none. */
  sourceValues: Record<string, string | null>
  registry: Registry
}

// ─── Parsed model ──────────────────────────────────────────────────────────────

export type Citation =
  | { kind: 'pmid'; id: string; key: string }
  | { kind: 'doi'; id: string; key: string }
  | { kind: 'dailymed'; id: string; key: string }
  | { kind: 'url'; id: string; key: string }
  | { kind: 'ref'; id: string; key: string }

export type InfoboxLine = {
  key: string
  /** null with isNull=false means "use the source" (nothing stored). */
  value: string | null
  isNull: boolean
  citations: Citation[]
}

export type BrandLine =
  | { action: 'source'; brand: string }
  | { action: 'add'; brand: string; citations: Citation[] }
  | { action: 'hide'; brand: string; reason: string; citations: Citation[] }

export type Comparator = '<' | '<=' | '>' | '>=' | 'range' | 'any'

export type ThresholdLine = {
  measure: string
  comparator: Comparator
  /** For range: low (inclusive). For < <= > >=: the number. null for 'any'. */
  low: number | null
  /** For range only: high (exclusive). */
  high: number | null
  action: string
  citations: Citation[]
}

export type InfoboxBlock = { name: 'infobox'; lines: InfoboxLine[] }
export type BrandsBlock = { name: 'brands'; lines: BrandLine[] }
export type ThresholdBlock = { name: string; grammar: 'threshold'; lines: ThresholdLine[] }
export type Block = InfoboxBlock | BrandsBlock | ThresholdBlock

export type SectionPart = { kind: 'prose'; markdown: string } | { kind: 'block'; block: ThresholdBlock }

export type MainItem =
  | { kind: 'lead'; id: 'lead'; markdown: string }
  | { kind: 'embed'; id: string; name: string }
  | {
      kind: 'section'
      /** Template section id, or null for a contributor section not yet given an id. */
      id: string | null
      heading: string
      template: boolean
      parts: SectionPart[]
    }

export type PageModel = {
  title: string
  brands: BrandsBlock | null
  infobox: InfoboxBlock | null
  main: MainItem[]
}

// ─── Diagnostics and extracted references ──────────────────────────────────────

export type Severity = 'error' | 'warning' | 'info'

export type Diagnostic = {
  severity: Severity
  code: string
  message: string
  /** 1-based line in the source text. */
  line: number
  /** Replacement the editor can offer with one click. */
  suggestion?: string
}

/** Where on the page something was written: 'lead', a section id/heading, or a block. */
export type Location = string

export type Extracted = {
  links: { target: string; location: Location }[]
  properties: { key: string; target: string; location: Location }[]
  citations: (Citation & { location: Location })[]
}

export type ParseResult = {
  model: PageModel
  diagnostics: Diagnostic[]
  extracted: Extracted
  /** True when there are no errors (warnings and info don't block publish). */
  ok: boolean
}
