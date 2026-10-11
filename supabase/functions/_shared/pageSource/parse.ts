// GENERATED from src/pageSource/parse.ts by scripts/sync-page-source.mjs — do not edit here.
/**
 * Page source → PageModel (docs/page-editor.md §4, §7).
 *
 * The same function runs in the browser (live checks, preview) and in the
 * publish-page Edge Function (the check that counts), so what the editor
 * underlines is exactly what publishing would refuse.
 *
 * Structure, line by line (outside code fences):
 *   # Title                 first line; locked
 *   :::name … :::           structured block
 *   ::name                  locked section embed
 *   ## Heading              section; everything until the next ## or ::embed
 *   anything else           prose: the lead (before the first section or embed)
 *                           or the current section's text
 *
 * Two modes:
 *   page      the whole page (Edit page). Checks that every template section and
 *             embed is still there.
 *   fragment  one section from its [edit] link: the lead, one ## section, or one
 *             rail block. Anything outside that section is refused.
 */

import { analyzeProse } from './prose.ts'
import { parseBrands, parseKeyed, parseThreshold } from './blocks.ts'
import type { RawLine } from './blocks.ts'
import { blockByHint, nearest } from './suggest.ts'
import type {
  BlockSchema,
  BrandsBlock,
  Diagnostic,
  Extracted,
  InfoboxBlock,
  MainItem,
  PageContext,
  PageModel,
  PageTemplate,
  ParseResult,
  TemplateItem,
} from './types.ts'

export const MAX_SOURCE_LENGTH = 200_000

export type FragmentTarget =
  | { kind: 'lead' }
  | { kind: 'section'; heading: string }
  | { kind: 'rail'; name: 'infobox' | 'brands' }

export type ParseOptions = {
  mode?: 'page' | 'fragment'
  target?: FragmentTarget
  /** Ids of contributor sections in the base revision, keyed by lower-cased heading. */
  sectionIds?: Record<string, string>
}

export function templateFor(ctx: PageContext): PageTemplate {
  const t = ctx.registry.templates.find(x => x.page_type === ctx.pageType)
  if (!t) throw new Error(`No page template for ${ctx.pageType}`)
  return t
}

const headingKey = (h: string) => h.trim().replace(/\s+/g, ' ').toLowerCase()

/** Prose lines with their 1-based source line numbers (prose can be interrupted by rail blocks). */
type ProseBuf = { lines: string[]; nums: number[] }

type Section = { item: Extract<MainItem, { kind: 'section' }>; line: number; prose: ProseBuf | null }

export function parsePageSource(source: string, ctx: PageContext, options: ParseOptions = {}): ParseResult {
  const mode = options.mode ?? 'page'
  const diagnostics: Diagnostic[] = []
  const extracted: Extracted = { links: [], properties: [], citations: [] }
  const template = templateFor(ctx)
  const blocksByName = new Map(ctx.registry.blocks.map(b => [b.name, b]))
  const embedsByName = new Map(ctx.registry.embeds.map(e => [e.name, e]))
  const templateSections = template.main.filter((i): i is Extract<TemplateItem, { kind: 'section' }> => i.kind === 'section')
  const templateEmbeds = template.main.filter((i): i is Extract<TemplateItem, { kind: 'embed' }> => i.kind === 'embed').map(i => i.name)
  const railNames = new Set(template.rail)

  const model: PageModel = { title: ctx.title, brands: null, infobox: null, main: [{ kind: 'lead', id: 'lead', markdown: '' }] }
  const error = (code: string, message: string, line: number, suggestion?: string) =>
    diagnostics.push(suggestion === undefined ? { severity: 'error', code, message, line } : { severity: 'error', code, message, line, suggestion })

  const text = source.replace(/\r\n?/g, '\n')
  if (text.length > MAX_SOURCE_LENGTH) error('too_long', `The page is ${text.length.toLocaleString()} characters; the limit is ${MAX_SOURCE_LENGTH.toLocaleString()}.`, 1)
  const lines = text.split('\n')

  // ── Prose buffers ─────────────────────────────────────────────────────────
  const lead: ProseBuf = { lines: [], nums: [] }
  // current: the section prose goes into; afterEmbed: prose after an embed needs a heading first.
  const st: { current: Section | null; afterEmbed: boolean; mainStarted: boolean } = { current: null, afterEmbed: false, mainStarted: false }
  const sections: Section[] = []
  const seenEmbeds = new Map<string, number>()
  const seenBlocks = new Map<string, number>()

  const pushProse = (line: string, n: number) => {
    if (st.current) {
      if (!st.current.prose) st.current.prose = { lines: [], nums: [] }
      st.current.prose.lines.push(line)
      st.current.prose.nums.push(n)
      return
    }
    if (st.afterEmbed) {
      if (line.trim()) error('text_needs_heading', 'Start a section with ## Heading before writing text here.', n)
      return
    }
    lead.lines.push(line)
    lead.nums.push(n)
  }

  const flushSectionProse = (s: Section) => {
    if (!s.prose) return
    const md = trimBlank(s.prose.lines)
    if (md) {
      s.item.parts.push({ kind: 'prose', markdown: md.text })
      const nums = s.prose.nums
      collect(analyzeProse(md.text, rel => nums[md.offset + rel - 1] ?? nums[nums.length - 1], locationOf(s.item)))
    }
    s.prose = null
  }

  const collect = (r: { diagnostics: Diagnostic[]; extracted: Extracted }) => {
    diagnostics.push(...r.diagnostics)
    extracted.links.push(...r.extracted.links)
    extracted.properties.push(...r.extracted.properties)
    extracted.citations.push(...r.extracted.citations)
  }

  // ── Title ─────────────────────────────────────────────────────────────────
  let i = 0
  if (mode === 'page') {
    while (i < lines.length && !lines[i].trim()) i++
    const m = i < lines.length ? /^#\s+(.+?)\s*#*\s*$/.exec(lines[i]) : null
    if (!m) {
      error('missing_title', `The first line must be the page title: # ${ctx.title}`, i + 1, `# ${ctx.title}`)
    } else {
      if (m[1].trim() !== ctx.title) {
        error('title_locked', `The title can't be changed here (renaming is done by a reviewer). Keep it as # ${ctx.title}.`, i + 1, `# ${ctx.title}`)
      }
      i++
    }
  }

  // ── Body ──────────────────────────────────────────────────────────────────
  let fence: string | null = null
  for (; i < lines.length; i++) {
    const line = lines[i]
    const n = i + 1

    if (fence) {
      if (line.trim().startsWith(fence)) fence = null
      pushProse(line, n)
      continue
    }
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (f) {
      fence = f[1]
      pushProse(line, n)
      continue
    }

    const open = /^:::\s*([A-Za-z][A-Za-z0-9-]*)\s*$/.exec(line)
    if (open) {
      const name = open[1].toLowerCase()
      const body: RawLine[] = []
      let j = i + 1
      while (j < lines.length && !/^:::\s*$/.test(lines[j])) {
        if (/^:::\s*[A-Za-z]/.test(lines[j]) || /^##\s/.test(lines[j])) break
        body.push({ text: lines[j], line: j + 1 })
        j++
      }
      const closed = j < lines.length && /^:::\s*$/.test(lines[j])
      if (!closed) error('unclosed_block', `:::${name} isn't closed. Add a line with just ::: after its last line.`, n, ':::')
      i = closed ? j : j - 1
      handleBlock(name, body, n)
      continue
    }
    if (/^:::/.test(line)) {
      error('stray_block_end', 'This ::: has no matching :::name above it.', n)
      continue
    }
    const embed = /^::([A-Za-z][A-Za-z0-9-]*)\s*$/.exec(line)
    if (embed) {
      handleEmbed(embed[1].toLowerCase(), n)
      continue
    }
    if (/^::/.test(line)) {
      error('bad_embed', 'Locked sections are written ::name on a line of their own.', n)
      continue
    }
    const h2 = /^##(?!#)\s*(.*?)\s*#*\s*$/.exec(line)
    if (h2) {
      handleHeading(h2[1], n)
      continue
    }
    pushProse(line, n)
  }
  if (st.current) flushSectionProse(st.current)

  // Lead
  const leadMd = trimBlank(lead.lines)
  if (leadMd) {
    model.main[0] = { kind: 'lead', id: 'lead', markdown: leadMd.text }
    collect(analyzeProse(leadMd.text, rel => lead.nums[leadMd.offset + rel - 1] ?? lead.nums[lead.nums.length - 1], 'lead'))
  }

  // ── Completeness ──────────────────────────────────────────────────────────
  if (mode === 'page') {
    for (const name of templateEmbeds) {
      if (!seenEmbeds.has(name)) {
        error('section_removed', `::${name} (${embedsByName.get(name)?.label ?? name}) can't be removed. Put the line back; you can move it.`, lines.length, `::${name}`)
      }
    }
    for (const s of templateSections) {
      if (!sections.some(x => x.item.id === s.id)) {
        error('section_removed', `## ${s.heading} can't be removed. Put the heading back; you can move the section.`, lines.length, `## ${s.heading}`)
      }
    }
  } else {
    checkFragment()
  }

  return { model, diagnostics: sortDiagnostics(diagnostics), extracted, ok: !diagnostics.some(d => d.severity === 'error') }

  // ── Handlers (hoisted) ────────────────────────────────────────────────────

  function handleBlock(name: string, body: RawLine[], n: number) {
    const schema = blocksByName.get(name)
    if (!schema || !schema.enabled || !schema.page_types.includes(ctx.pageType)) {
      const near = nearest(name, ctx.registry.blocks.filter(b => b.enabled && b.page_types.includes(ctx.pageType)).map(b => b.name))
      const hinted = near ? null : blockByHint(name, ctx.registry.blocks)
      const suggestion = near ?? hinted?.name
      error('unknown_block', `There's no :::${name} block on this page.${suggestion ? ` Did you mean :::${suggestion}?` : ''}`, n, suggestion ? `:::${suggestion}` : undefined)
      return
    }
    if (seenBlocks.has(name)) {
      error('duplicate_block', `:::${name} already appears on line ${seenBlocks.get(name)}. Keep one.`, n)
      return
    }
    seenBlocks.set(name, n)

    if (schema.region === 'rail') {
      if (st.mainStarted && mode === 'page') {
        diagnostics.push({ severity: 'info', code: 'rail_fixed', message: `${schema.label} always sits in the side column; it stays there whatever its position here.`, line: n })
      }
      parseRailBlock(schema, body)
      return
    }
    // Section block: must sit in its owner section.
    const owner = schema.owner_section
    if (!st.current || st.current.item.id !== owner) {
      const heading = templateSections.find(s => s.id === owner)?.heading ?? owner
      error('block_misplaced', `:::${name} belongs under ## ${heading}. Move it there.`, n)
      return
    }
    flushSectionProse(st.current)
    const parsed = parseThreshold(body, schema, ctx)
    diagnostics.push(...parsed.diagnostics)
    for (const line of parsed.block.lines) for (const c of line.citations) extracted.citations.push({ ...c, location: `block:${name}` })
    st.current.item.parts.push({ kind: 'block', block: parsed.block })
  }

  function parseRailBlock(schema: BlockSchema, body: RawLine[]) {
    if (schema.grammar === 'keyed') {
      const parsed = parseKeyed(body, schema, ctx)
      diagnostics.push(...parsed.diagnostics)
      model.infobox = parsed.block as InfoboxBlock
      for (const l of parsed.block.lines) for (const c of l.citations) extracted.citations.push({ ...c, location: `block:infobox:${l.key}` })
    } else if (schema.grammar === 'brands') {
      const parsed = parseBrands(body, ctx)
      diagnostics.push(...parsed.diagnostics)
      model.brands = parsed.block as BrandsBlock
      for (const l of parsed.block.lines) if (l.action !== 'source') for (const c of l.citations) extracted.citations.push({ ...c, location: 'block:brands' })
    }
  }

  function handleEmbed(name: string, n: number) {
    const schema = embedsByName.get(name)
    if (!schema || !schema.page_types.includes(ctx.pageType)) {
      const choices = [...template.rail.filter(r => embedsByName.has(r)), ...templateEmbeds]
      const near = nearest(name, choices)
      error('unknown_section', `There's no ::${name} section on this page.${near ? ` Did you mean ::${near}?` : ''}`, n, near ? `::${near}` : undefined)
      return
    }
    if (seenEmbeds.has(name)) {
      error('duplicate_section', `::${name} already appears on line ${seenEmbeds.get(name)}. Keep one.`, n)
      return
    }
    seenEmbeds.set(name, n)
    if (railNames.has(name)) {
      if (st.mainStarted && mode === 'page') {
        diagnostics.push({ severity: 'info', code: 'rail_fixed', message: `${schema.label} always sits in the side column; it stays there whatever its position here.`, line: n })
      }
      return
    }
    if (st.current) flushSectionProse(st.current)
    st.current = null
    st.afterEmbed = true
    st.mainStarted = true
    model.main.push({ kind: 'embed', id: name, name })
  }

  function handleHeading(raw: string, n: number) {
    if (st.current) flushSectionProse(st.current)
    st.mainStarted = true
    st.afterEmbed = false
    const heading = raw.trim()
    if (!heading) {
      error('empty_heading', 'Write the section name after ##.', n)
      st.current = null
      st.afterEmbed = true
      return
    }
    const key = headingKey(heading)
    const tpl = templateSections.find(s => headingKey(s.heading) === key)
    if (sections.some(s => headingKey(s.item.heading) === key)) {
      error('duplicate_heading', `Two sections are called “${heading}”. Give one a different name.`, n)
    }
    if (tpl && tpl.heading !== heading) {
      diagnostics.push({ severity: 'warning', code: 'template_heading_case', message: `This section's name is fixed as “${tpl.heading}”.`, line: n, suggestion: `## ${tpl.heading}` })
    }
    const id = tpl ? tpl.id : (options.sectionIds?.[key] ?? null)
    const item: Extract<MainItem, { kind: 'section' }> = { kind: 'section', id, heading: tpl ? tpl.heading : heading, template: Boolean(tpl), parts: [] }
    const s: Section = { item, line: n, prose: null }
    sections.push(s)
    st.current = s
    model.main.push(item)
  }

  function checkFragment() {
    const target = options.target
    if (!target) return
    const extraMain = model.main.filter(m => m.kind !== 'lead')
    if (target.kind === 'lead') {
      if (extraMain.length || model.infobox || model.brands) {
        error('outside_fragment', 'This edit only covers the lead. Use Edit page to add or move sections.', 1)
      }
    } else if (target.kind === 'section') {
      const only = extraMain.length === 1 && extraMain[0].kind === 'section' ? extraMain[0] : null
      if (model.main[0].kind === 'lead' && model.main[0].markdown) error('outside_fragment', `Start with ## ${target.heading}. Text above it belongs to another section.`, 1)
      if (!only) error('outside_fragment', `This edit covers only ## ${target.heading}. Use Edit page to add, remove or move sections.`, 1)
      else if (headingKey(only.heading) !== headingKey(target.heading)) {
        const isTemplate = templateSections.some(s => headingKey(s.heading) === headingKey(target.heading))
        if (isTemplate) error('section_removed', `## ${target.heading} can't be renamed or removed.`, 1, `## ${target.heading}`)
      }
      if (model.infobox || model.brands) error('outside_fragment', 'Quick Facts and brands have their own edit links.', 1)
    } else {
      const wrong = extraMain.length > 0 || (model.main[0].kind === 'lead' && model.main[0].markdown) || (target.name === 'infobox' ? model.brands : model.infobox)
      if (wrong) error('outside_fragment', `This edit covers only :::${target.name}.`, 1)
      if (!(target.name === 'infobox' ? model.infobox : model.brands)) error('section_removed', `Keep the :::${target.name} block (an empty one is fine).`, 1)
    }
  }
}

function locationOf(item: Extract<MainItem, { kind: 'section' }>): string {
  return item.id ?? `heading:${item.heading}`
}

/** Drops leading/trailing blank lines; returns null when nothing is left. */
function trimBlank(lines: string[]): { text: string; offset: number } | null {
  let a = 0
  let b = lines.length
  while (a < b && !lines[a].trim()) a++
  while (b > a && !lines[b - 1].trim()) b--
  if (a === b) return null
  return { text: lines.slice(a, b).map(l => l.replace(/\s+$/, '')).join('\n'), offset: a }
}

const RANK = { error: 0, warning: 1, info: 2 } as const
function sortDiagnostics(d: Diagnostic[]): Diagnostic[] {
  return [...d].sort((a, b) => a.line - b.line || RANK[a.severity] - RANK[b.severity])
}

