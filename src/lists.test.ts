import { describe, expect, it } from 'vitest'
import type { ListItem } from './api.generated'
import {
  compareRows,
  defaultSortKey,
  filterItems,
  formatCount,
  isTermList,
  listToCsv,
  sortItems,
  sortOptions,
  statusParts,
  statusValues,
  topChoices,
} from './lists'

function item(p: Partial<ListItem> & { name: string }): ListItem {
  return {
    position: 1,
    rank: null,
    value: null,
    legal_status: null,
    note: null,
    sources: null,
    source_name: p.name,
    pcid: 1000001,
    slug: p.name,
    entity_type: 'moiety',
    ...p,
  }
}

const meps = [
  item({ name: 'lisinopril', rank: 2, value: 19819400 }),
  item({ name: 'atorvastatin', rank: 1, value: 27311800 }),
  item({ name: 'metformin', rank: 3, value: 19482800 }),
]

describe('sortItems', () => {
  it('sorts by rank ascending, reversible', () => {
    expect(sortItems(meps, 'rank', false).map(i => i.name)).toEqual(['atorvastatin', 'lisinopril', 'metformin'])
    expect(sortItems(meps, 'rank', true).map(i => i.name)).toEqual(['metformin', 'lisinopril', 'atorvastatin'])
  })

  it('sorts a measured value biggest first, and a rank-like value smallest first', () => {
    expect(sortItems(meps, 'value', false).map(i => i.name)).toEqual(['atorvastatin', 'lisinopril', 'metformin'])
    const overall = [item({ name: 'b', value: 668 }), item({ name: 'a', value: 12 })]
    expect(sortItems(overall, 'value', false, { valueIsRank: true }).map(i => i.name)).toEqual(['a', 'b'])
  })

  it('sorts names case-insensitively and keeps nulls last whatever the direction', () => {
    const rows = [item({ name: 'Zolpidem', rank: null }), item({ name: 'alprazolam', rank: 5 }), item({ name: 'Buspirone', rank: 1 })]
    expect(sortItems(rows, 'name', false).map(i => i.name)).toEqual(['alprazolam', 'Buspirone', 'Zolpidem'])
    expect(sortItems(rows, 'rank', true).map(i => i.name)).toEqual(['alprazolam', 'Buspirone', 'Zolpidem'])
  })

  it('does not mutate its input', () => {
    const copy = [...meps]
    sortItems(meps, 'name', false)
    expect(meps).toEqual(copy)
  })
})

describe('filterItems', () => {
  const rows = [
    item({ name: 'hydrocodone/acetaminophen', source_name: 'hydrocodone/ acetaminophen', rank: 15, legal_status: 'CS-2' }),
    item({ name: 'dronabinol', source_name: 'dronabinol in oral solution', rank: 400, legal_status: 'CS-2 (oral solution); CS-3 (in sesame oil)' }),
    item({ name: 'gabapentin', rank: null, legal_status: 'PDMP' }),
  ]

  it('matches the drug name or the source name', () => {
    expect(filterItems(rows, { query: 'sesame' })).toHaveLength(0)
    expect(filterItems(rows, { query: 'oral solution' }).map(i => i.name)).toEqual(['dronabinol'])
    expect(filterItems(rows, { query: 'HYDRO' }).map(i => i.name)).toEqual(['hydrocodone/acetaminophen'])
  })

  it('keeps only ranks within the top N', () => {
    expect(filterItems(rows, { top: 100 }).map(i => i.name)).toEqual(['hydrocodone/acetaminophen'])
  })

  it('matches a status inside a combined status', () => {
    expect(filterItems(rows, { status: 'CS-3' }).map(i => i.name)).toEqual(['dronabinol'])
    expect(filterItems(rows, { status: 'CS-2' })).toHaveLength(2)
  })
})

describe('status helpers', () => {
  it('splits combined statuses', () => {
    expect(statusParts('CS-1 (sodium oxybate); CS-3 (sodium oxybate (labeled))')).toEqual(['CS-1', 'CS-3'])
    expect(statusParts(null)).toEqual([])
  })
  it('lists distinct statuses in natural order', () => {
    const rows = [item({ name: 'a', legal_status: 'CS-5' }), item({ name: 'b', legal_status: 'CS-1; CS-3' }), item({ name: 'c', legal_status: 'CS-1' })]
    expect(statusValues(rows)).toEqual(['CS-1', 'CS-3', 'CS-5'])
  })
})

describe('list options', () => {
  it('offers only the sorts the data supports', () => {
    expect(sortOptions({ items: meps, measure_label: 'Mean people per year', measure_unit: 'people' }).map(o => o.key)).toEqual([
      'rank',
      'value',
      'name',
    ])
    const mpje = [item({ name: 'a', legal_status: 'CS-2' })]
    expect(sortOptions({ items: mpje, measure_label: null, measure_unit: null }).map(o => o.key)).toEqual(['name', 'status'])
  })

  it('falls back when the default sort has no data', () => {
    const mpje = [item({ name: 'a', legal_status: 'CS-2' })]
    expect(defaultSortKey({ default_sort: 'rank', items: mpje, measure_label: null, measure_unit: null })).toBe('name')
    expect(defaultSortKey({ default_sort: 'value_desc', items: meps, measure_label: 'x', measure_unit: 'people' })).toBe('value')
  })

  it('offers top-N cut-offs smaller than the list', () => {
    expect(topChoices(247)).toEqual([10, 25, 50, 100, 200])
  })
})

describe('export and formatting', () => {
  it('writes a CSV with PCIDs and quotes commas', () => {
    const csv = listToCsv({ measure_label: 'People per year' }, [item({ name: 'multivitamin, prenatal', rank: 1, value: 5, pcid: 2002468 })])
    expect(csv.split('\n')[0]).toBe('rank,drug,pcid,name_in_source,People per year')
    expect(csv).toContain('PCID-2002468')
    expect(csv).toContain('"multivitamin, prenatal"')
  })

  it('formats counts', () => {
    expect(formatCount(27311800)).toBe('27.3 M')
    expect(formatCount(4889800)).toBe('4.89 M')
    expect(formatCount(517000)).toBe('517 K')
  })
})

describe('term lists (Joint Commission "Do Not Use")', () => {
  const term = (name: string, legal_status: string, note: string) =>
    item({ name, legal_status, note, pcid: null, slug: null, entity_type: 'term', term_id: 1 })
  const tjc = [
    term('QD', 'The Joint Commission', 'Write "daily".'),
    term('TAF', 'ISMP addition', 'Write the complete drug name.'),
  ]

  it('recognises a list made only of terms', () => {
    expect(isTermList(tjc)).toBe(true)
    expect(isTermList(meps)).toBe(false)
    expect(isTermList([])).toBe(false)
  })

  it('names the status sort after the list\'s own label', () => {
    expect(sortOptions({ items: tjc, measure_label: null, measure_unit: null, status_label: 'Source' }).find(o => o.key === 'status')?.label).toBe('Source')
    expect(sortOptions({ items: tjc, measure_label: null, measure_unit: null }).find(o => o.key === 'status')?.label).toBe('Status')
  })

  it('exports entries with their notes and no PCID', () => {
    const lines = listToCsv({ measure_label: null }, tjc).trim().split('\n')
    expect(lines[0]).toBe('rank,entry,pcid,name_in_source,legal_status,note')
    expect(lines[1]).toBe(',QD,,QD,The Joint Commission,"Write ""daily""."')
  })
})

describe('lists with a reason instead of a legal status', () => {
  const dnc = [
    item({ name: 'metoprolol succinate', legal_status: 'Modified-release', note: 'Toprol-XL · tablet', sources: ['MPR', "Pharmacist's Letter"] }),
    item({ name: 'aspirin', legal_status: 'Modified-release; Irritant', note: 'Ecotrin · tablet', sources: ['MPR'] }),
  ]

  it('names the status column after the list', () => {
    const opts = sortOptions({ items: dnc, measure_label: null, measure_unit: null, status_label: 'Reason' })
    expect(opts.find(o => o.key === 'status')?.label).toBe('Reason')
    expect(sortOptions({ items: dnc, measure_label: null, measure_unit: null }).find(o => o.key === 'status')?.label).toBe('Status')
  })

  it('finds a drug by the brand in its note', () => {
    expect(filterItems(dnc, { query: 'toprol' }).map(i => i.name)).toEqual(['metoprolol succinate'])
  })

  it('filters on one reason of several', () => {
    expect(filterItems(dnc, { status: 'Irritant' }).map(i => i.name)).toEqual(['aspirin'])
  })

  it('exports the note and corroborating sources', () => {
    const csv = listToCsv({ measure_label: null, status_label: 'Reason' }, dnc)
    expect(csv.split('\n')[0]).toBe('rank,drug,pcid,name_in_source,reason,note,also_listed_by')
    expect(csv).toContain("MPR; Pharmacist's Letter")
  })
})

describe('compareRows', () => {
  const generic = (name: string, pcid: number, extra: Partial<ListItem> = {}) => item({ name, pcid, ...extra })
  const brand = (name: string, pcid: number, of: { pcid: number; name: string }, status: string) =>
    item({
      name,
      pcid,
      slug: name.toLowerCase(),
      entity_type: 'formulation',
      legal_status: status,
      component_pcid: of.pcid,
      component_slug: of.name,
      component_name: of.name,
    })

  it('puts a brand on the same row as its generic from another list', () => {
    const doNotCrush = { items: [generic('metformin', 1001, { legal_status: 'Modified-release' })] }
    const brands = { items: [brand('Glucophage XR', 4001, { pcid: 1001, name: 'metformin' }, 'High')] }
    const rows = compareRows([doNotCrush, brands])
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toBe('1001')
    expect(rows[0].cells[0]).toHaveLength(1)
    expect(rows[0].cells[1].map(i => i.name)).toEqual(['Glucophage XR'])
  })

  it('keeps every brand that shares a generic, in one cell', () => {
    const brands = {
      items: [
        brand('Abilify', 4002, { pcid: 1002, name: 'aripiprazole' }, 'High'),
        brand('Abilify Maintena', 4003, { pcid: 1002, name: 'aripiprazole' }, 'High'),
      ],
    }
    const rows = compareRows([brands, { items: [] }])
    expect(rows).toHaveLength(1)
    expect(rows[0].cells[0].map(i => i.name)).toEqual(['Abilify', 'Abilify Maintena'])
    expect(rows[0].cells[1]).toEqual([])
  })

  it('still keeps only the first entry for a plain drug repeated in one list', () => {
    const list = { items: [generic('toprol', 1003, { note: 'tablet' }), generic('toprol', 1003, { note: 'capsule' })] }
    const rows = compareRows([list])
    expect(rows[0].cells[0]).toHaveLength(1)
    expect(rows[0].cells[0][0].note).toBe('tablet')
  })

  it('keys term entries by their source name', () => {
    const terms = { items: [item({ name: 'U', pcid: null, slug: null, entity_type: 'term' })] }
    expect(compareRows([terms])[0].key).toBe('term:U')
  })
})
