import { describe, expect, it } from 'vitest'
import { abbreviatePages, formatList, formatPage, formatSource } from './cite'
import { ALL_SOURCES } from './sources'

const byId = (id: string) => {
  const s = ALL_SOURCES.find(x => x.id === id)
  if (!s) throw new Error(id)
  return s
}
const cite = (style: Parameters<typeof formatSource>[0], id: string, accessed = '2026-09-16') => {
  const s = byId(id)
  return formatSource(style, s.id, s.href, s.cite, accessed)
}

describe('abbreviatePages', () => {
  it('drops shared leading digits', () => {
    expect(abbreviatePages('1520-1539')).toBe('1520-39')
    expect(abbreviatePages('D1516-D1525')).toBe('D1516-25')
    expect(abbreviatePages('61')).toBe('61')
  })
})

describe('upstream sources', () => {
  it('AMA web', () => {
    expect(cite('ama', 'openfda')).toBe(
      'openFDA. US Food and Drug Administration. Accessed September 16, 2026. https://open.fda.gov/',
    )
  })
  it('AMA article truncates past six authors', () => {
    expect(cite('ama', 'pubchem')).toBe(
      'Kim S, Chen J, Cheng T, et al. PubChem 2025 update. Nucleic Acids Res. 2025;53(D1):D1516-D1525. doi:10.1093/nar/gkae1059',
    )
  })
  it('APA article with 21+ authors uses the ellipsis form', () => {
    const out = cite('apa', 'drugbank')
    expect(out).toContain('Zubkowski, A., . . . Wishart, D. S. (2024). DrugBank 6.0: The DrugBank')
    expect(out).toContain('Nucleic Acids Research, 52(D1), D1265–D1275.')
  })
  it('NLM web with open-ended start year', () => {
    expect(cite('nlm', 'lactmed')).toBe(
      'Drugs and Lactation Database (LactMed) [Internet]. Bethesda (MD): National Institute of Child Health and Human Development; 2006- [cited 2026 Sep 16]. Available from: https://www.ncbi.nlm.nih.gov/books/NBK501922/',
    )
  })
  it('WHO index takes the access year as its edition', () => {
    expect(cite('ama', 'whoatcddd', '2027-02-01')).toMatch(/^ATC\/DDD Index 2027\./)
  })
  it('NLM keeps the subtitle lowercase', () => {
    expect(cite('nlm', 'classyfire')).toContain('ClassyFire: automated chemical classification')
  })
  it('Vancouver article', () => {
    expect(cite('vancouver', 'ecotox')).toContain(
      'Olker JH, Elonen CM, Pilli A, Anderson A, Kinziger B, Erickson S, et al.',
    )
    expect(cite('vancouver', 'ecotox')).toContain('Environ Toxicol Chem. 2022;41(6):1520-39.')
  })
  it('APA list is alphabetized', () => {
    const list = formatList('apa', [
      { sortKey: 'Kim S', text: 'K' },
      { sortKey: 'Djoumbou Feunang Y', text: 'D' },
    ])
    expect(list).toBe('D\n\nK')
  })
})

describe('Commons page', () => {
  const base = { author: 'Pharmacy Commons contributors', title: 'Metformin', url: 'https://pharmacycommons.org/drugs/metformin', updated: '', accessed: '2026-09-16' }
  it('returns nothing without a title or URL', () => {
    expect(formatPage('ama', { ...base, title: '', url: '' })).toBe('')
  })
  it('NLM closes the bracket when only updated is known', () => {
    expect(formatPage('nlm', { ...base, updated: '2026-09-01', accessed: '' })).toContain('[updated 2026 Sep 1].')
  })
  it('NLM combines updated and cited', () => {
    expect(formatPage('nlm', { ...base, updated: '2026-09-01' })).toContain('[updated 2026 Sep 1; cited 2026 Sep 16].')
  })
})
