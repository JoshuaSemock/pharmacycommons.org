// GENERATED from src/pageSource/blocks.ts by scripts/sync-page-source.mjs — do not edit here.
/**
 * Line grammars for structured blocks (docs/page-editor.md §5). Each grammar
 * turns the lines between `:::name` and `:::` into typed rows, or explains on
 * the line what's wrong.
 *
 *   keyed      key: value [@cite]        Quick Facts (keys from infobox_properties)
 *   brands     Name / Name [@cite] / ~~Name~~ [@cite] reason
 *   threshold  egfr < 30: action [@cite] Renal dosing and future range tables
 *
 * A `#` with a space before it starts a comment to the end of the line; the
 * serializer writes source values there.
 */

import { splitCitations } from './citations.ts'
import { htmlInValue } from './prose.ts'
import { blockByHint, nearest } from './suggest.ts'
import type {
  BlockSchema,
  BrandLine,
  BrandsBlock,
  Comparator,
  Diagnostic,
  InfoboxBlock,
  InfoboxLine,
  PageContext,
  ThresholdBlock,
  ThresholdLine,
} from './types.ts'

export type RawLine = { text: string; line: number }

export const NULL_TOKEN = '[NONE]'

/** Removes a trailing `# comment`. A # must follow whitespace (or start the line). */
export function stripComment(text: string): string {
  const m = /(^|\s)#(\s|$)/.exec(text)
  return (m ? text.slice(0, m.index) : text).trimEnd()
}

const normal = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

function err(code: string, message: string, line: number, suggestion?: string): Diagnostic {
  return suggestion === undefined
    ? { severity: 'error', code, message, line }
    : { severity: 'error', code, message, line, suggestion }
}

/** Points a misplaced fact at the block that owns it. */
function elsewhere(input: string, ctx: PageContext, self: string): string {
  const other = blockByHint(input, ctx.registry.blocks, self)
  if (!other) return ''
  const first = other.example.split('\n')[0]
  const where = other.owner_section ? ` under ## ${headingOf(ctx, other.owner_section)}` : ''
  return ` ${other.label} goes in :::${other.name}${where}, e.g. \`${first}\`.`
}

function headingOf(ctx: PageContext, sectionId: string): string {
  for (const t of ctx.registry.templates) {
    for (const item of t.main) if (item.kind === 'section' && item.id === sectionId) return item.heading
  }
  return sectionId
}

// ─── keyed (Quick Facts) ───────────────────────────────────────────────────────

export function infoboxKeysFor(ctx: PageContext) {
  return ctx.infoboxKeys.filter(k => k.entity_types.includes(ctx.entityType))
}

export function parseKeyed(lines: RawLine[], schema: BlockSchema, ctx: PageContext): { block: InfoboxBlock; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = []
  const keys = infoboxKeysFor(ctx)
  const keyNames = keys.map(k => k.key)
  const nullToken = schema.grammar_spec.null_token ?? NULL_TOKEN
  const maxLen = schema.grammar_spec.max_value_length ?? 2000
  const seen = new Set<string>()
  const out: InfoboxLine[] = []

  for (const { text, line } of lines) {
    const body = stripComment(text)
    if (!body.trim()) continue
    const m = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*:(.*)$/.exec(body)
    if (!m) {
      diagnostics.push(err('bad_line', `Quick Facts lines are written key: value. Valid keys: ${keyNames.join(', ')}.`, line))
      continue
    }
    const key = m[1].toLowerCase()
    if (!keyNames.includes(key)) {
      const near = nearest(key, keyNames)
      diagnostics.push(
        err(
          'unknown_key',
          `Unknown Quick Facts key “${m[1]}”.${near ? ` Did you mean ${near}?` : ''}${elsewhere(key, ctx, schema.name)}`,
          line,
          near ?? undefined,
        ),
      )
      continue
    }
    if (seen.has(key)) {
      diagnostics.push(err('duplicate_key', `${key} is listed twice. Keep one line.`, line))
      continue
    }
    seen.add(key)

    const { text: value, citations, problems } = splitCitations(m[2])
    for (const p of problems) diagnostics.push(err('bad_citation', p.message, line))
    const html = htmlInValue(value)
    if (html) {
      diagnostics.push(err('raw_html', html, line))
      continue
    }
    if (!value) {
      if (citations.length > 0) diagnostics.push(err('citation_without_value', `${key} has a citation but no value. Write the value, or remove the citation to use the source.`, line))
      continue
    }
    if (value.length > maxLen) {
      diagnostics.push(err('too_long', `${key} is ${value.length} characters; the limit is ${maxLen}.`, line))
      continue
    }
    const isNull = value === nullToken
    if (!isNull && value.includes(nullToken)) {
      diagnostics.push(err('null_token_not_alone', `${nullToken} must be the whole value (then a citation), e.g. ${key}: ${nullToken} [@pmid:…].`, line))
      continue
    }
    if (!isNull && value.toUpperCase() === nullToken && value !== nullToken) {
      diagnostics.push(err('null_token_case', `Write ${nullToken} in capitals to record "no value".`, line, nullToken))
      continue
    }
    if (citations.length === 0) {
      // A malformed key already has its own error on this line.
      if (problems.length === 0) diagnostics.push(
        err('citation_required', `A value you write for ${key} replaces the source, so it needs a citation: add [@pmid:…], [@dailymed:…] or [@url:…].`, line),
      )
      continue
    }
    const source = ctx.sourceValues[key]
    if (!isNull && source && normal(source) === normal(value)) {
      diagnostics.push({ severity: 'warning', code: 'same_as_source', message: `This is the same as the source value; leave ${key} blank to use the source.`, line })
    }
    out.push({ key, value: isNull ? null : value, isNull, citations })
  }

  const order = new Map(keys.map((k, i) => [k.key, i]))
  out.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0))
  return { block: { name: 'infobox', lines: out }, diagnostics }
}

// ─── brands ────────────────────────────────────────────────────────────────────

export function parseBrands(lines: RawLine[], ctx: PageContext): { block: BrandsBlock; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = []
  const source = new Map(ctx.sourceBrands.map(b => [normal(b), b]))
  const seen = new Set<string>()
  const sourceLines = new Map<string, BrandLine>()
  const adds: BrandLine[] = []
  let lastLine = lines.length ? lines[lines.length - 1].line : 0

  for (const { text, line } of lines) {
    lastLine = line
    const body = stripComment(text).trim()
    if (!body) continue
    const struck = /^~~(.+?)~~(.*)$/.exec(body)
    const nameAndRest = struck ? { name: struck[1].trim(), rest: struck[2] } : null
    const { text: plain, citations, problems } = splitCitations(nameAndRest ? nameAndRest.rest : body)
    for (const p of problems) diagnostics.push(err('bad_citation', p.message, line))
    const html = htmlInValue(nameAndRest ? nameAndRest.name + ' ' + plain : plain)
    if (html) {
      diagnostics.push(err('raw_html', html, line))
      continue
    }
    const name = nameAndRest ? nameAndRest.name : plain
    const key = normal(name)
    if (!name) {
      diagnostics.push(err('bad_line', 'Write the brand name before the citation.', line))
      continue
    }
    if (seen.has(key)) {
      diagnostics.push(err('duplicate_brand', `${name} is listed twice.`, line))
      continue
    }
    seen.add(key)
    const sourceName = source.get(key)

    if (nameAndRest) {
      if (!sourceName) {
        diagnostics.push(err('strike_not_source', `Only a brand from the sources can be struck through. ${name} isn't one; just delete the line.`, line))
        continue
      }
      if (citations.length === 0) {
        if (problems.length === 0) diagnostics.push(err('citation_required', `Say why ${sourceName} is wrong with a citation: ~~${sourceName}~~ [@…] reason.`, line))
        continue
      }
      if (!plain) {
        diagnostics.push(err('reason_required', `Add a short reason after the citation, e.g. ~~${sourceName}~~ [@…] not a metformin product.`, line))
        continue
      }
      sourceLines.set(key, { action: 'hide', brand: sourceName, reason: plain, citations })
      continue
    }
    if (sourceName) {
      if (citations.length > 0) {
        diagnostics.push({ severity: 'warning', code: 'source_brand_cited', message: `${sourceName} is already in the sources; the citation isn't needed.`, line })
      }
      sourceLines.set(key, { action: 'source', brand: sourceName })
      continue
    }
    if (citations.length === 0) {
      if (problems.length === 0) diagnostics.push(err('citation_required', `${name} isn't in the sources, so adding it needs a citation: ${name} [@dailymed:…].`, line))
      continue
    }
    adds.push({ action: 'add', brand: name, citations })
  }

  for (const [key, name] of source) {
    if (!sourceLines.has(key)) {
      diagnostics.push(
        err(
          'source_brand_removed',
          `${name} comes from the sources and can't be deleted. To mark it as wrong, strike it through: ~~${name}~~ [@…] reason.`,
          lastLine,
        ),
      )
    }
  }
  const ordered = ctx.sourceBrands.map(b => sourceLines.get(normal(b))).filter((l): l is BrandLine => l !== undefined)
  return { block: { name: 'brands', lines: [...ordered, ...adds] }, diagnostics }
}

// ─── threshold (renal dosing) ──────────────────────────────────────────────────

type Interval = { lo: number; loInc: boolean; hi: number; hiInc: boolean }

function interval(l: ThresholdLine): Interval | null {
  switch (l.comparator) {
    case '<':
      return { lo: -Infinity, loInc: false, hi: l.low ?? 0, hiInc: false }
    case '<=':
      return { lo: -Infinity, loInc: false, hi: l.low ?? 0, hiInc: true }
    case '>':
      return { lo: l.low ?? 0, loInc: false, hi: Infinity, hiInc: false }
    case '>=':
      return { lo: l.low ?? 0, loInc: true, hi: Infinity, hiInc: false }
    case 'range':
      return { lo: l.low ?? 0, loInc: true, hi: l.high ?? 0, hiInc: false }
    default:
      return null
  }
}

function overlaps(a: Interval, b: Interval): boolean {
  const lo = Math.max(a.lo, b.lo)
  const hi = Math.min(a.hi, b.hi)
  if (lo < hi) return true
  if (lo > hi) return false
  const loInc = a.lo === lo ? a.loInc : b.loInc
  const loInc2 = b.lo === lo ? b.loInc : a.loInc
  const hiInc = a.hi === hi ? a.hiInc : b.hiInc
  const hiInc2 = b.hi === hi ? b.hiInc : a.hiInc
  return loInc && loInc2 && hiInc && hiInc2
}

const NUM = '(\\d+(?:\\.\\d+)?)'
const CONDITION: { re: RegExp; comparator: Comparator }[] = [
  { re: new RegExp(`^<=\\s*${NUM}$`), comparator: '<=' },
  { re: new RegExp(`^≤\\s*${NUM}$`), comparator: '<=' },
  { re: new RegExp(`^>=\\s*${NUM}$`), comparator: '>=' },
  { re: new RegExp(`^≥\\s*${NUM}$`), comparator: '>=' },
  { re: new RegExp(`^<\\s*${NUM}$`), comparator: '<' },
  { re: new RegExp(`^>\\s*${NUM}$`), comparator: '>' },
  { re: new RegExp(`^${NUM}\\s*(?:-|–|to)\\s*${NUM}$`), comparator: 'range' },
]

export function parseThreshold(lines: RawLine[], schema: BlockSchema, ctx: PageContext): { block: ThresholdBlock; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = []
  const measures = schema.grammar_spec.measures ?? {}
  const measureNames = Object.keys(measures)
  const maxLen = schema.grammar_spec.max_action_length ?? 1000
  const out: ThresholdLine[] = []
  const placed: { measure: string; iv: Interval | null; line: number; text: string }[] = []

  for (const { text, line } of lines) {
    const body = stripComment(text).trim()
    if (!body) continue
    const colon = body.indexOf(':')
    // A colon inside a citation key ([@pmid:…]) doesn't count as the separator.
    const firstCite = body.indexOf('[@')
    if (colon === -1 || (firstCite !== -1 && colon > firstCite)) {
      diagnostics.push(err('bad_line', `Write a range, a colon, then what to do, e.g. \`${schema.example.split('\n')[0]}\`.`, line))
      continue
    }
    const head = body.slice(0, colon).trim()
    const action = body.slice(colon + 1)
    const hm = /^([A-Za-z]+)\s*(.*)$/.exec(head)
    if (!hm) {
      diagnostics.push(err('bad_line', `Start the line with ${measureNames.join(', ')}.`, line))
      continue
    }
    const measure = hm[1].toLowerCase()
    const cond = hm[2].trim()
    const spec = measures[measure]
    if (!spec) {
      const near = nearest(measure, measureNames)
      diagnostics.push(
        err('unknown_measure', `“${hm[1]}” isn't a measure here. Use ${measureNames.join(', ')}.${near ? ` Did you mean ${near}?` : ''}${elsewhere(measure, ctx, schema.name)}`, line, near ?? undefined),
      )
      continue
    }
    let comparator: Comparator = 'any'
    let low: number | null = null
    let high: number | null = null
    if (spec.numeric) {
      const found = CONDITION.map(c => ({ c, m: c.re.exec(cond) })).find(x => x.m)
      if (!found || !found.m) {
        diagnostics.push(err('bad_range', `After ${measure} write < N, <= N, > N, >= N or N-M (${spec.unit ?? ''}).`, line))
        continue
      }
      comparator = found.c.comparator
      low = Number(found.m[1])
      if (comparator === 'range') {
        high = Number(found.m[2])
        if (!(low < high)) {
          diagnostics.push(err('bad_range', `In ${measure} ${low}-${high} the first number must be lower.`, line))
          continue
        }
      }
    } else if (cond) {
      diagnostics.push(err('bad_range', `${measure} takes no number: write \`${measure}: action\`.`, line))
      continue
    }

    const { text: act, citations, problems } = splitCitations(action)
    for (const p of problems) diagnostics.push(err('bad_citation', p.message, line))
    const html = htmlInValue(act)
    if (html) {
      diagnostics.push(err('raw_html', html, line))
      continue
    }
    if (!act) {
      diagnostics.push(err('action_required', 'Say what to do after the colon.', line))
      continue
    }
    if (act.length > maxLen) {
      diagnostics.push(err('too_long', `This line is ${act.length} characters; the limit is ${maxLen}.`, line))
      continue
    }
    if (citations.length === 0) {
      if (problems.length === 0) diagnostics.push(err('citation_required', 'Every renal dosing line needs a citation: add [@dailymed:…] or [@pmid:…].', line))
      continue
    }
    const entry: ThresholdLine = { measure, comparator, low, high, action: act, citations }
    const iv = interval(entry)
    const clash = placed.find(p => p.measure === measure && (iv === null || p.iv === null ? iv === p.iv : overlaps(iv, p.iv)))
    if (clash) {
      diagnostics.push(err('overlap', `This range overlaps line ${clash.line} (${clash.text}). Ranges for the same measure can't overlap.`, line))
      continue
    }
    placed.push({ measure, iv, line, text: head })
    out.push(entry)
  }
  return { block: { name: schema.name, grammar: 'threshold', lines: out }, diagnostics }
}
