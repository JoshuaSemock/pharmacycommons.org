/**
 * What the editor's key panel and autocomplete show (docs/page-editor.md §4a).
 *
 * `contextAt` says where the cursor is (inside which block or section);
 * `panelFor` lists what can be written there, each entry with help text and the
 * text to insert. Both read the same registry the parser validates against, so
 * the panel can't offer something publishing would refuse.
 */

import { infoboxKeysFor } from './blocks'
import { templateFor } from './parse'
import type { PageContext } from './types'

export type CursorContext =
  | { region: 'title' }
  | { region: 'block'; name: string }
  | { region: 'lead' }
  | { region: 'section'; heading: string }
  | { region: 'after-embed' }

/** Where line `line` (1-based) of `source` sits. Code fences are respected. */
export function contextAt(source: string, line: number): CursorContext {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let ctx: CursorContext = { region: 'lead' }
  let block: string | null = null
  let fence: string | null = null
  let sawTitle = false
  for (let i = 0; i < Math.min(line, lines.length); i++) {
    const l = lines[i]
    if (fence) {
      if (l.trim().startsWith(fence)) fence = null
      continue
    }
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(l)
    if (f) {
      fence = f[1]
      continue
    }
    if (!sawTitle && /^#\s/.test(l)) {
      sawTitle = true
      if (i === line - 1) return { region: 'title' }
      continue
    }
    const open = /^:::\s*([A-Za-z][A-Za-z0-9-]*)\s*$/.exec(l)
    if (open) {
      block = open[1].toLowerCase()
      continue
    }
    if (/^:::\s*$/.test(l)) {
      if (i === line - 1 && block) return { region: 'block', name: block }
      block = null
      continue
    }
    if (block) continue
    if (/^::[A-Za-z]/.test(l)) ctx = { region: 'after-embed' }
    const h = /^##(?!#)\s*(.*?)\s*$/.exec(l)
    if (h) ctx = { region: 'section', heading: h[1] }
  }
  return block ? { region: 'block', name: block } : ctx
}

export type PanelEntry = {
  label: string
  /** Text inserted at the cursor (a line, or a key prefix). */
  insert: string
  help: string
  /** Current source value, for Quick Facts keys. */
  source?: string | null
  citation?: 'required' | 'when changed' | 'none'
}

export type Panel = { title: string; help: string; entries: PanelEntry[] }

const INLINE: PanelEntry[] = [
  { label: '[[page]]', insert: '[[', help: 'Link to another page by name, slug or PCID. [[metformin|Glucophage]] changes the link text.' },
  { label: '{{key}}', insert: '{{', help: 'Show a live Quick Facts value: {{acb_score}} here, {{acb_score:amitriptyline}} from another page.' },
  { label: '[@citation]', insert: '[@', help: 'Cite a source: [@pmid:…], [@doi:…], [@dailymed:set id], [@url:https://…].' },
]

export function panelFor(cursor: CursorContext, ctx: PageContext): Panel {
  const template = templateFor(ctx)
  if (cursor.region === 'block') {
    const schema = ctx.registry.blocks.find(b => b.name === cursor.name)
    if (!schema) return { title: `:::${cursor.name}`, help: 'Unknown block.', entries: [] }
    if (schema.grammar === 'keyed') {
      return {
        title: schema.label,
        help: schema.help,
        entries: [
          ...infoboxKeysFor(ctx).map(k => ({
            label: k.key,
            insert: `${k.key}: `,
            help: `${k.label} (source: ${k.source_kind})`,
            source: ctx.sourceValues[k.key] ?? null,
            citation: 'when changed' as const,
          })),
          { label: '[NONE]', insert: '[NONE] [@', help: 'The source is wrong and there is no value. Must be the whole value, with a citation.', citation: 'required' },
        ],
      }
    }
    return {
      title: schema.label,
      help: schema.help,
      entries: (schema.grammar_spec.forms ?? []).map(f => ({
        label: f.form,
        insert: f.form.replace(/ N-M/, ' ').replace(/ N\b/, ' ').replace(/: action$/, ''),
        help: f.meaning,
        citation: schema.citation === 'always' ? ('required' as const) : ('when changed' as const),
      })),
    }
  }
  if (cursor.region === 'section') {
    const tpl = template.main.find(t => t.kind === 'section' && t.heading.toLowerCase() === cursor.heading.toLowerCase())
    const blockName = tpl && tpl.kind === 'section' ? tpl.block : null
    const block = blockName ? ctx.registry.blocks.find(b => b.name === blockName) : null
    return {
      title: `## ${cursor.heading}`,
      help: tpl && tpl.kind === 'section' ? tpl.help : 'A section you or another contributor added. Markdown, links, values and citations work here.',
      entries: [...(block ? [{ label: `:::${block.name}`, insert: `:::${block.name}\n\n:::`, help: block.help }] : []), ...INLINE],
    }
  }
  if (cursor.region === 'title') return { title: 'Title', help: 'The title is locked. Renaming a page is done by a reviewer.', entries: [] }
  return {
    title: cursor.region === 'lead' ? 'Lead' : 'Between sections',
    help:
      cursor.region === 'lead'
        ? 'The opening paragraphs, above the first section. Summarise what the drug is and how it is used.'
        : 'Text here needs a heading first. Start a section with ## Heading, or move a locked section.',
    entries: [
      { label: '## Heading', insert: '## ', help: 'Start a new section.' },
      ...template.main.filter(t => t.kind === 'embed').map(t => {
        const e = ctx.registry.embeds.find(x => t.kind === 'embed' && x.name === t.name)
        return { label: `::${e?.name ?? ''}`, insert: `::${e?.name ?? ''}`, help: `${e?.label ?? ''}: ${e?.help ?? ''} (locked; can be moved)` }
      }),
      ...INLINE,
    ],
  }
}
