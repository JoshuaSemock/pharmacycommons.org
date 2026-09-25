/**
 * Citation formatting for the References page.
 *
 * Two inputs: a Commons page (user-entered fields) and an upstream reference
 * (structured metadata in sources.ts). Anything missing is dropped rather than
 * filled with a placeholder, so the output never claims more than we know.
 *
 * Output is plain text — no italics — because it is meant to be pasted.
 */

export type Style = 'ama' | 'apa' | 'vancouver' | 'nlm' | 'bibtex'

export const STYLES: { id: Style; label: string }[] = [
  { id: 'ama', label: 'AMA 11' },
  { id: 'apa', label: 'APA 7' },
  { id: 'vancouver', label: 'Vancouver' },
  { id: 'nlm', label: 'NLM' },
  { id: 'bibtex', label: 'BibTeX' },
]

/** A database or web resource, cited as the resource itself. */
export type WebCitation = {
  kind: 'web'
  title: string
  /** Corporate author, as AMA/APA print it ("US Food and Drug Administration"). */
  publisher: string
  /** Citing Medicine place and publisher ("Silver Spring (MD)", "Food and Drug Administration (US)"). */
  place: string
  nlmPublisher: string
  /** First year of publication, for NLM's open-ended "2006-". Omit if unknown. */
  since?: number
  /** Append the access year to the title — for annually re-issued indexes. */
  editionYear?: boolean
}

/** A journal article the maintainers ask users to cite. */
export type ArticleCitation = {
  kind: 'article'
  /** "Family Initials", exactly as PubMed lists them. */
  authors: string[]
  title: string
  journal: string
  journalAbbr: string
  year: number
  volume: string
  issue?: string
  pages: string
  doi: string
  pmid?: string
}

export type SourceCitation = WebCitation | ArticleCitation

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Parse an ISO yyyy-mm-dd as a local date, avoiding UTC drift. */
export function parseISO(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

const longDate = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
const medDate = (d: Date) => `${d.getFullYear()} ${MONTHS_ABBR[d.getMonth()]} ${d.getDate()}`

/** Adds terminal punctuation unless the text already ends with some. */
function stop(text: string, mark = '.'): string {
  return /[.?!]$/.test(text) ? text : `${text}${mark}`
}

/** AMA and APA capitalize the first word of a subtitle; Citing Medicine doesn't. */
function capSubtitle(title: string): string {
  return title.replace(/: ([a-z])/, (_, c: string) => `: ${c.toUpperCase()}`)
}

/** APA uses "U.S."; AMA and Citing Medicine use "US". */
function apaName(name: string): string {
  return name.replace(/\bUS\b/g, 'U.S.')
}

/* ------------------------------------------------------------------ authors */

type Name = { family: string; initials: string }

function splitName(raw: string): Name {
  const i = raw.lastIndexOf(' ')
  return i < 0 ? { family: raw, initials: '' } : { family: raw.slice(0, i), initials: raw.slice(i + 1) }
}

/** AMA 11: all authors up to 6; beyond that, first 3 and et al. */
function amaAuthors(authors: string[]): string {
  const list = authors.length > 6 ? [...authors.slice(0, 3), 'et al'] : authors
  return list.join(', ')
}

/** ICMJE Vancouver: first 6, then et al. */
function vancouverAuthors(authors: string[]): string {
  const list = authors.length > 6 ? [...authors.slice(0, 6), 'et al'] : authors
  return list.join(', ')
}

/** "DS" → "D. S." */
function apaInitials(initials: string): string {
  return initials.split('').map(c => `${c}.`).join(' ')
}

/** APA 7: up to 20 listed with "&"; 21+ is first 19, an ellipsis, then the last. */
function apaAuthors(authors: string[]): string {
  const fmt = (raw: string) => {
    const { family, initials } = splitName(raw)
    return initials ? `${family}, ${apaInitials(initials)}` : family
  }
  const names = authors.map(fmt)
  if (names.length === 1) return names[0]
  if (names.length <= 20) return `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`
  return `${names.slice(0, 19).join(', ')}, . . . ${names[names.length - 1]}`
}

function bibtexAuthors(authors: string[]): string {
  return authors
    .map(raw => {
      const { family, initials } = splitName(raw)
      const given = initials.split('').map(c => `${c}.`).join(' ')
      return given ? `{${family}}, ${given}` : `{${family}}`
    })
    .join(' and ')
}

/* -------------------------------------------------------------------- pages */

/**
 * Citing Medicine page abbreviation: "1520-1539" → "1520-39",
 * "D1516-D1525" → "D1516-25". Anything irregular passes through unchanged.
 */
export function abbreviatePages(pages: string): string {
  const match = /^([A-Za-z]*)(\d+)-([A-Za-z]*)(\d+)$/.exec(pages)
  if (!match) return pages
  const [, prefixA, startDigits, prefixB, endDigits] = match
  if (prefixB && prefixB !== prefixA) return pages
  if (startDigits.length !== endDigits.length) return `${prefixA}${startDigits}-${endDigits}`
  let i = 0
  while (i < endDigits.length - 1 && startDigits[i] === endDigits[i]) i++
  return `${prefixA}${startDigits}-${endDigits.slice(i)}`
}

const enDash = (pages: string) => pages.replace('-', '–')

/* --------------------------------------------------------- Commons page cite */

export type PageInput = {
  author: string
  title: string
  url: string
  updated: string
  accessed: string
}

const SITE = 'Pharmacy Commons'

export function formatPage(style: Style, input: PageInput): string {
  const author = input.author.trim()
  const title = input.title.trim()
  const url = input.url.trim()
  if (!title && !url) return ''

  const up = parseISO(input.updated)
  const ac = parseISO(input.accessed)

  switch (style) {
    case 'ama': {
      const parts = [author && stop(author), title && stop(title), `${SITE}.`]
      if (up) parts.push(`Updated ${longDate(up)}.`)
      if (ac) parts.push(`Accessed ${longDate(ac)}.`)
      if (url) parts.push(url)
      return parts.filter(Boolean).join(' ')
    }
    case 'apa': {
      const date = up ? `(${up.getFullYear()}, ${MONTHS[up.getMonth()]} ${up.getDate()})` : '(n.d.)'
      const parts = [author && stop(author), `${date}.`, title && stop(title), `${SITE}.`]
      if (url) parts.push(ac ? `Retrieved ${longDate(ac)}, from ${url}` : url)
      return parts.filter(Boolean).join(' ')
    }
    case 'vancouver':
    case 'nlm': {
      const parts = [author && stop(author), title && `${title} [Internet].`, `${SITE};`]
      if (up) parts.push(`[updated ${medDate(up)};`)
      if (ac) parts.push(up ? `cited ${medDate(ac)}].` : `[cited ${medDate(ac)}].`)
      else if (up) parts[parts.length - 1] = parts[parts.length - 1].replace(/;$/, '].')
      if (url) parts.push(`Available from: ${url}`)
      return parts.filter(Boolean).join(' ')
    }
    case 'bibtex': {
      const key = (title || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24)
      const lines = [`@misc{pharmacycommons-${key},`]
      if (author) lines.push(`  author       = {{${author}}},`)
      if (title) lines.push(`  title        = {${title}},`)
      lines.push(`  howpublished = {${SITE}},`)
      if (up) lines.push(`  year         = {${up.getFullYear()}},`)
      if (ac) lines.push(`  note         = {Accessed ${longDate(ac)}},`)
      if (url) lines.push(`  url          = {${url}},`)
      lines.push('}')
      return lines.join('\n')
    }
  }
}

/* ------------------------------------------------------ upstream source cite */

export function formatSource(
  style: Style,
  key: string,
  url: string,
  cite: SourceCitation,
  accessedISO: string,
): string {
  const ac = parseISO(accessedISO)
  return cite.kind === 'article'
    ? formatArticle(style, key, cite)
    : formatWeb(style, key, url, cite, ac)
}

function formatWeb(style: Style, key: string, url: string, c: WebCitation, ac: Date | null): string {
  const title = c.editionYear && ac ? `${c.title} ${ac.getFullYear()}` : c.title

  switch (style) {
    case 'ama': {
      const parts = [stop(title), stop(c.publisher)]
      if (ac) parts.push(`Accessed ${longDate(ac)}.`)
      parts.push(url)
      return parts.join(' ')
    }
    case 'apa': {
      const parts = [stop(apaName(c.publisher)), '(n.d.).', stop(title)]
      parts.push(ac ? `Retrieved ${longDate(ac)}, from ${url}` : url)
      return parts.join(' ')
    }
    case 'vancouver':
    case 'nlm': {
      const since = c.since ? ` ${c.since}-` : ''
      const parts = [`${title} [Internet].`, `${c.place}: ${c.nlmPublisher};${since}`]
      if (ac) parts.push(`[cited ${medDate(ac)}].`)
      else parts[1] = parts[1].replace(/;$/, '.')
      parts.push(`Available from: ${url}`)
      return parts.join(' ')
    }
    case 'bibtex': {
      const lines = [
        `@misc{${key},`,
        `  author       = {{${c.publisher}}},`,
        `  title        = {{${title}}},`,
        `  howpublished = {${c.publisher}},`,
      ]
      if (ac) lines.push(`  note         = {Accessed ${longDate(ac)}},`)
      lines.push(`  url          = {${url}},`, '}')
      return lines.join('\n')
    }
  }
}

function formatArticle(style: Style, key: string, c: ArticleCitation): string {
  const issue = c.issue ? `(${c.issue})` : ''

  switch (style) {
    case 'ama':
      return [
        stop(amaAuthors(c.authors)),
        stop(capSubtitle(c.title)),
        `${c.journalAbbr}. ${c.year};${c.volume}${issue}:${c.pages}.`,
        `doi:${c.doi}`,
      ].join(' ')
    case 'apa':
      return [
        stop(apaAuthors(c.authors)),
        `(${c.year}).`,
        stop(capSubtitle(c.title)),
        `${c.journal}, ${c.volume}${issue}, ${enDash(c.pages)}.`,
        `https://doi.org/${c.doi}`,
      ].join(' ')
    case 'vancouver':
    case 'nlm': {
      const authors = style === 'nlm' ? c.authors.join(', ') : vancouverAuthors(c.authors)
      const parts = [
        stop(authors),
        stop(c.title),
        `${c.journalAbbr}. ${c.year};${c.volume}${issue}:${abbreviatePages(c.pages)}.`,
        `doi: ${c.doi}.`,
      ]
      if (style === 'nlm' && c.pmid) parts.push(`PMID: ${c.pmid}.`)
      return parts.join(' ')
    }
    case 'bibtex': {
      const lines = [
        `@article{${key},`,
        `  author  = {${bibtexAuthors(c.authors)}},`,
        `  title   = {${c.title}},`,
        `  journal = {${c.journal}},`,
        `  year    = {${c.year}},`,
        `  volume  = {${c.volume}},`,
      ]
      if (c.issue) lines.push(`  number  = {${c.issue}},`)
      lines.push(`  pages   = {${c.pages.replace('-', '--')}},`, `  doi     = {${c.doi}},`)
      if (c.pmid) lines.push(`  pmid    = {${c.pmid}},`)
      lines.push('}')
      return lines.join('\n')
    }
  }
}

/**
 * A full reference list in the chosen style. Numbered styles keep source
 * order; APA is alphabetized; BibTeX entries are separated by blank lines.
 */
export function formatList(style: Style, entries: { sortKey: string; text: string }[]): string {
  if (style === 'bibtex') return entries.map(e => e.text).join('\n\n')
  if (style === 'apa') {
    return [...entries]
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map(e => e.text)
      .join('\n\n')
  }
  return entries.map((e, i) => `${i + 1}. ${e.text}`).join('\n')
}
