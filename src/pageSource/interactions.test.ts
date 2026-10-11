import { describe, expect, it } from 'vitest'
import { parsePageSource } from './parse'
import { serializeFragment, serializePage, templateModel } from './serialize'
import { overlayStructured } from './publish'
import { METFORMIN } from './fixtures/metformin'
import type { PageModel, StatementBlock } from './types'

/** :::interactions — the statement grammar (docs/page-editor.md §5a). */

const DM = '[@dailymed:1ed9dde4-339c-486f-a346-dde33a5e493f]'
const section = (lines: string[]) => `## Interactions\n\n:::interactions\n${lines.join('\n')}\n:::\n`
const parseSection = (lines: string[]) =>
  parsePageSource(section(lines), METFORMIN, { mode: 'fragment', target: { kind: 'section', heading: 'Interactions' } })

const blockOf = (model: PageModel): StatementBlock | null => {
  const s = model.main.find(m => m.kind === 'section' && m.id === 'interactions')
  const part = s?.kind === 'section' ? s.parts.find(p => p.kind === 'block') : undefined
  return part?.kind === 'block' && part.block.grammar === 'statement' ? part.block : null
}

describe(':::interactions', () => {
  it('reads one cited line per other page', () => {
    const r = parseSection([`[[warfarin]]: increased INR; monitor INR when starting or stopping ${DM}`, `[[strong CYP3A4 inhibitors|CYP3A4 inhibitors]]: avoid ${DM}`])
    expect(r.ok).toBe(true)
    expect(blockOf(r.model)?.lines).toEqual([
      { target: 'warfarin', effect: 'increased INR; monitor INR when starting or stopping', citations: [expect.objectContaining({ kind: 'dailymed' })] },
      { target: 'strong CYP3A4 inhibitors', effect: 'avoid', citations: [expect.objectContaining({ kind: 'dailymed' })] },
    ])
    expect(r.extracted.links.map(l => l.target)).toEqual(['warfarin', 'strong CYP3A4 inhibitors'])
  })

  it.each([
    ['warfarin: increased INR [@pmid:1]', 'bad_line', 'double brackets'],
    ['[[warfarin]]: increased INR', 'citation_required', 'citation'],
    ['[[warfarin]]: [@pmid:1]', 'effect_required', 'what happens'],
    ['[[warfarin]]: <b>bleeding</b> [@pmid:1]', 'raw_html', 'bold'],
  ])('refuses %s', (line, code, words) => {
    const r = parseSection([line])
    expect(r.ok).toBe(false)
    const d = r.diagnostics.find(x => x.code === code)
    expect(d?.message.toLowerCase()).toContain(words.toLowerCase())
  })

  it('refuses a second line about the same page', () => {
    const r = parseSection([`[[warfarin]]: a ${DM}`, `[[Warfarin]]: b ${DM}`])
    expect(r.diagnostics.map(d => d.code)).toContain('duplicate_target')
  })

  it('belongs under ## Interactions', () => {
    const source = serializePage(templateModel(METFORMIN), METFORMIN)
      .replace(':::interactions\n:::\n\n', '')
      .replace(
      '## Patient education\n',
      `## Patient education\n\n:::interactions\n[[warfarin]]: a ${DM}\n:::\n`,
    )
    expect(parsePageSource(source, METFORMIN).diagnostics.map(d => d.code)).toContain('block_misplaced')
  })

  it('serializes back to the same text', () => {
    const lines = [`[[warfarin]]: increased INR ${DM}`]
    const r = parseSection(lines)
    const page = { ...templateModel(METFORMIN), main: templateModel(METFORMIN).main.map(m => (m.kind === 'section' && m.id === 'interactions' ? r.model.main[1] : m)) }
    expect(serializeFragment(page, METFORMIN, { kind: 'section', heading: 'Interactions' })).toBe(section(lines))
  })

  it('opens on the live community_statements rows', () => {
    const model = overlayStructured(
      templateModel(METFORMIN),
      { infobox: [], brands: [], thresholds: [], statements: [{ block_name: 'interactions', object_text: 'warfarin', effect: 'increased INR', citations: ['[@pmid:1]'] }] },
      [],
      [],
    )
    expect(blockOf(model)?.lines).toEqual([{ target: 'warfarin', effect: 'increased INR', citations: [{ kind: 'pmid', id: '1', key: 'pmid:1' }] }])
  })
})
