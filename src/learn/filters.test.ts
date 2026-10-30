import { describe, expect, it } from 'vitest'
import { applyFilters, facetsOf, parseSelection, serializeSelection, toggleValue } from './filters'
import type { LearnItem } from './types'

const item = (id: string, tags: string[]) => ({ id, tags }) as unknown as LearnItem
const items = [
  item('a', ['schedule:2', 'importance:high']),
  item('b', ['schedule:2', 'importance:medium']),
  item('c', ['schedule:3', 'importance:high']),
  item('d', ['schedule:5', 'importance:medium']),
  item('e', ['schedule:1', 'importance:high']),
]

describe('learn filters', () => {
  it('offers only groups that split the items, in a sensible order', () => {
    const g = facetsOf(items)
    expect(g.map(x => x.key)).toEqual(['schedule', 'importance'])
    expect(g[0].values.map(v => v.label)).toEqual(['Schedule I', 'Schedule II', 'Schedule III', 'Schedule V'])
    expect(g[1].values.map(v => v.value)).toEqual(['high', 'medium'])
    expect(facetsOf(items.map(i => item(i.id, ['importance:high', 'class:epc'])))).toEqual([])
  })

  it('ORs within a group and ANDs across groups', () => {
    const ids = (s: Parameters<typeof applyFilters>[1]) => applyFilters(items, s).map(i => i.id)
    expect(ids({})).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(ids({ schedule: ['2', '3', '4', '5'] })).toEqual(['a', 'b', 'c', 'd'])
    expect(ids({ schedule: ['2', '3', '4', '5'], importance: ['high'] })).toEqual(['a', 'c'])
    expect(ids({ schedule: [] })).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('round-trips through the URL and ignores unknown keys', () => {
    const sel = parseSelection('importance:high,schedule:2,schedule:3,bogus:x,schedule:2')
    expect(sel).toEqual({ importance: ['high'], schedule: ['2', '3'] })
    expect(serializeSelection(sel)).toBe('schedule:2,schedule:3,importance:high')
    expect(parseSelection(null)).toEqual({})
  })

  it('toggles a value on and off', () => {
    const on = toggleValue({}, 'schedule', '2')
    expect(on).toEqual({ schedule: ['2'] })
    expect(toggleValue(on, 'schedule', '2')).toEqual({ schedule: [] })
  })
})
