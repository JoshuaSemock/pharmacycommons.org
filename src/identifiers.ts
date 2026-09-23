/**
 * Pharmacy Commons — link each identifier on a drug page back to its source
 *
 * Every builder here takes the value exactly as stored in the satellite
 * tables (moieties / precise_forms / combinations / formulations) and returns
 * text segments, some carrying an href to the authoritative record. Values
 * that don't match the expected format stay plain text rather than producing
 * a broken link.
 *
 * Link formats (checked 2026-09-22):
 *   CAS RN           https://commonchemistry.cas.org/detail?cas_rn=657-24-9
 *   UNII             https://precision.fda.gov/uniisearch/srs/unii/9100L32L2N
 *   InChIKey         https://pubchem.ncbi.nlm.nih.gov/compound/XZWYZXLIPXDOLR-UHFFFAOYSA-N
 *   DrugBank ID      https://go.drugbank.com/drugs/DB00331
 *   NDC              https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=0002-4184-30
 *   FDA application  https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=020357
 *   LactMed          https://www.ncbi.nlm.nih.gov/books/NBK501922/?term=metformin
 *                    (stored IDs are legacy "LM173" record numbers, which have no
 *                    URL of their own, so the link searches LactMed by drug name)
 *   O.C.G.A.         https://law.justia.com/codes/georgia/title-16/chapter-13/article-3/section-16-13-71/
 */

export interface Segment {
  text: string
  href?: string
}

export interface SourcedValue {
  /** Name of the source the links go to, e.g. "FDA UNII" — shown next to the label. */
  source: string | null
  segments: Segment[]
}

type Ctx = { name: string }
type Builder = (value: string, ctx: Ctx) => SourcedValue

const plain = (value: string): SourcedValue => ({ source: null, segments: [{ text: value }] })

/** Split a delimited list ("a; b" / "a, b") and link each item, keeping the separators readable. */
function linkList(value: string, delimiter: RegExp, source: string, href: (item: string) => string | null): SourcedValue {
  const items = value.split(delimiter).map(s => s.trim()).filter(Boolean)
  const segments: Segment[] = []
  items.forEach((item, i) => {
    if (i > 0) segments.push({ text: ', ' })
    const url = href(item)
    segments.push(url ? { text: item, href: url } : { text: item })
  })
  const linked = segments.some(s => s.href)
  return { source: linked ? source : null, segments }
}

// ─── CAS ──────────────────────────────────────────────────────────────────────

/**
 * "657-24-9" → "657-24-9" when the CAS check digit is valid, else null.
 * Hyphens are required: ~115 stored values are bare digit strings that are
 * mostly truncated registry numbers (e.g. "2593837" from "2593837-xx-x"), and
 * a chance check-digit match would link the wrong substance.
 */
export function normalizeCas(raw: string): string | null {
  if (!/^\d{2,7}-\d{2}-\d$/.test(raw.trim())) return null
  const digits = raw.replace(/[^0-9]/g, '')
  const body = digits.slice(0, -1)
  const check = Number(digits.slice(-1))
  const sum = body
    .split('')
    .reverse()
    .reduce((acc, d, i) => acc + Number(d) * (i + 1), 0)
  if (sum % 10 !== check) return null
  return `${digits.slice(0, -3)}-${digits.slice(-3, -1)}-${digits.slice(-1)}`
}

const cas: Builder = value =>
  linkList(value, /[;,|]/, 'CAS Common Chemistry', item => {
    const rn = normalizeCas(item)
    return rn ? `https://commonchemistry.cas.org/detail?cas_rn=${rn}` : null
  })

// ─── Georgia code (O.C.G.A.) ──────────────────────────────────────────────────

/** Justia path for a Title 16 Chapter 13 section, which depends on its article (and part). */
function georgia1613Path(section: number): string | null {
  if (section >= 1 && section <= 5) return 'article-1'
  if (section >= 20 && section < 57) return 'article-2/part-1'
  if (section >= 57 && section <= 65) return 'article-2/part-2'
  if (section >= 70 && section <= 79) return 'article-3'
  if (section >= 90 && section <= 96) return 'article-4'
  if (section >= 110 && section <= 114) return 'article-5'
  if (section >= 120 && section <= 122) return 'article-6'
  return null
}

export function ocgaUrl(title: number, chapter: number, section: string): string | null {
  if (title !== 16 || chapter !== 13) return null // only the controlled-substance chapter is mapped
  const path = georgia1613Path(Number(section))
  if (!path) return null
  const slug = `section-${title}-${chapter}-${section.replace('.', '-')}`
  return `https://law.justia.com/codes/georgia/title-${title}/chapter-${chapter}/${path}/${slug}/`
}

/** Links every "O.C.G.A. § 16-13-71" inside the citation text; the rest stays as written. */
const statute: Builder = value => {
  const re = /O\.C\.G\.A\.\s*§+\s*(\d+)-(\d+)-(\d+(?:\.\d+)?)/g
  const segments: Segment[] = []
  let last = 0
  let linked = false
  for (const m of value.matchAll(re)) {
    const url = ocgaUrl(Number(m[1]), Number(m[2]), m[3])
    if (m.index! > last) segments.push({ text: value.slice(last, m.index) })
    segments.push(url ? { text: m[0], href: url } : { text: m[0] })
    if (url) linked = true
    last = m.index! + m[0].length
  }
  if (last < value.length) segments.push({ text: value.slice(last) })
  return { source: linked ? 'Georgia Code (Justia)' : null, segments: segments.length ? segments : [{ text: value }] }
}

// ─── Registry ─────────────────────────────────────────────────────────────────
//
// Keyed by the display label (api.ts HUMANIZED_FIELDS, plus the Identifiers
// card's own "NDC codes" row), because that's what reaches the page.

const BUILDERS: Record<string, Builder> = {
  'CAS number': cas,

  UNII: value =>
    linkList(value, /[;,|]/, 'FDA UNII', item =>
      /^[A-Z0-9]{10}$/.test(item) ? `https://precision.fda.gov/uniisearch/srs/unii/${item}` : null,
    ),

  InChIKey: value =>
    linkList(value, /[;,|]/, 'PubChem', item =>
      /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/.test(item) ? `https://pubchem.ncbi.nlm.nih.gov/compound/${item}` : null,
    ),

  'DrugBank ID': value =>
    linkList(value, /[;,|]/, 'DrugBank', item =>
      /^DB\d{5}$/.test(item) ? `https://go.drugbank.com/drugs/${item}` : null,
    ),

  'NDC codes': value =>
    linkList(value, /[;,|]/, 'DailyMed', item =>
      /^\d{4,5}-\d{3,4}(-\d{1,2})?$/.test(item)
        ? `https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${encodeURIComponent(item)}`
        : null,
    ),

  'FDA applications': value =>
    linkList(value, /[;,|]/, 'Drugs@FDA', item => {
      const n = item.replace(/^(NDA|ANDA|BLA)\s*/i, '')
      return /^\d{6}$/.test(n)
        ? `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${n}`
        : null
    }),

  'LactMed ID': (value, ctx) => ({
    source: 'LactMed (NLM)',
    segments: [
      {
        text: value,
        // Legacy LM record numbers have no URL of their own; search LactMed by
        // the stored value when it's a name, otherwise by the drug's name.
        href: `https://www.ncbi.nlm.nih.gov/books/NBK501922/?term=${encodeURIComponent(
          /^LM\d+$/i.test(value) ? ctx.name : value,
        )}`,
      },
    ],
  }),

  'Statute citation': statute,
}

/** Segments (with links where the value has a known source) for one identifier row. */
export function sourcedValue(label: string, value: string, ctx: Ctx): SourcedValue {
  const build = BUILDERS[label]
  return build ? build(value, ctx) : plain(value)
}
