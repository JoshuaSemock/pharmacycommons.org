import { describe, expect, it } from 'vitest'
import type { FrontmatterResult } from './frontmatter'
import { ACTIVE_TOOL_SECTIONS, TOOLS, TOOL_SECTIONS, buildTool, isActive, toolProblem } from './tools'
import { CURRENT_API_BASE } from './developers/endpoints'

const FILES = import.meta.glob<FrontmatterResult>('./content/tools/*.md', { query: '?fm', import: 'default', eager: true })

const fm = (meta: Record<string, unknown>, body = 'A description.'): FrontmatterResult => ({ meta, body, error: null })
const valid = { name: 'A tool', status: 'live', section: 'calculators', to: '/tools/a' }

describe('tool files', () => {
  it('loads every committed file', () => {
    expect(Object.keys(FILES).length).toBeGreaterThan(5)
    expect(TOOLS).toHaveLength(Object.keys(FILES).length)
  })

  it.each(Object.entries(FILES))('%s: is usable', (_path, file) => {
    expect(toolProblem(file)).toBeNull()
  })

  it('has unique order numbers', () => {
    const orders = Object.entries(FILES).map(([p, f]) => buildTool(p, f)?.order)
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('gives every live tool keywords for the header search', () => {
    for (const t of TOOLS.filter(isActive)) {
      if (t.id === 'api') continue
      expect(t.keywords?.length, t.id).toBeGreaterThan(0)
    }
  })

  it('keeps the API tool pointed at the public API', () => {
    const api = TOOLS.find(t => t.id === 'api')
    expect(api?.href).toBe(`${CURRENT_API_BASE}/v1`)
    expect(api?.to).toBeUndefined()
  })

  it('lists sections in order and leaves planned tools out of the menu', () => {
    expect(ACTIVE_TOOL_SECTIONS.map(s => s.id)).toEqual(TOOL_SECTIONS.map(s => s.id).filter(id => ACTIVE_TOOL_SECTIONS.some(s => s.id === id)))
    for (const s of ACTIVE_TOOL_SECTIONS) for (const t of s.tools) expect(t.status).toBe('live')
  })
})

describe('buildTool', () => {
  it('takes the id from the file name and the description from the body', () => {
    const t = buildTool('./content/tools/my-tool.md', fm({ ...valid, keywords: ['a', 'b'], summary: 'S', order: 5 }))
    expect(t).toMatchObject({ id: 'my-tool', blurb: 'A description.', keywords: ['a', 'b'], summary: 'S', order: 5, to: '/tools/a' })
  })

  it('rejects bad status, section, links and empty descriptions', () => {
    expect(toolProblem(fm({ ...valid, status: 'soon' }))).toMatch(/status/)
    expect(toolProblem(fm({ ...valid, section: 'nope' }))).toMatch(/section/)
    expect(toolProblem(fm({ ...valid, to: 'tools/a' }))).toMatch(/to must/)
    expect(toolProblem(fm({ ...valid, to: undefined }))).toMatch(/live tool needs/)
    expect(toolProblem(fm({ ...valid, api_path: '/v1' }))).toMatch(/not both/)
    expect(toolProblem(fm(valid, ''))).toMatch(/body/)
    expect(toolProblem({ meta: {}, body: '', error: 'bad yaml' })).toMatch(/bad yaml/)
    expect(buildTool('./x.md', fm({ ...valid, name: '' }))).toBeNull()
  })

  it('allows a planned tool with nowhere to go yet', () => {
    expect(toolProblem(fm({ name: 'Soon', status: 'planned', section: 'planned', to: undefined }))).toBeNull()
  })
})
