import { useMemo, useState } from 'react'
import PageShell from './PageShell'

type Style = 'ama' | 'apa' | 'vancouver' | 'nlm' | 'bibtex'

const STYLES: { id: Style; label: string }[] = [
  { id: 'ama', label: 'AMA 11' },
  { id: 'apa', label: 'APA 7' },
  { id: 'vancouver', label: 'Vancouver' },
  { id: 'nlm', label: 'NLM' },
  { id: 'bibtex', label: 'BibTeX' },
]

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Parse an ISO yyyy-mm-dd as a local date, avoiding UTC drift. */
function parseISO(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export default function Citations() {
  const [style, setStyle] = useState<Style>('ama')
  const [author, setAuthor] = useState('Pharmacy Commons contributors')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [updated, setUpdated] = useState('')
  const [accessed, setAccessed] = useState(todayISO())
  const [copied, setCopied] = useState(false)

  const citation = useMemo(
    () => buildCitation({ style, author, title, url, updated, accessed }),
    [style, author, title, url, updated, accessed]
  )

  async function copy() {
    try {
      await navigator.clipboard.writeText(citation)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <PageShell
      kicker="Citations"
      title="Cite a page from the Commons"
      lede="Fill in what you have. Fields left blank are dropped rather than filled with placeholders, so the output stays honest — check it against your target journal's instructions before submitting."
    >
      <section className="border-t border-sage-200 py-8">

        {/* Style selector */}
        <div className="mb-6 flex flex-wrap gap-1.5">
          {STYLES.map(s => (
            <button
              key={s.id}
              onClick={() => setStyle(s.id)}
              className={`rounded-md border px-3 py-1.5 font-sans text-[13px] transition-colors ${
                style === s.id
                  ? 'border-aqua-400 bg-aqua-100 text-aqua-700'
                  : 'border-sage-200 bg-white/60 text-sage-600 hover:border-sage-300 hover:text-sage-900'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Author or contributor" hint="Leave the default for community-maintained pages">
            <input
              type="text"
              value={author}
              onChange={e => setAuthor(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Page title">
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Metformin hydrochloride"
              className={inputClass}
            />
          </Field>
          <Field label="URL">
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://pharmacycommons.org/drugs/metformin"
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Last updated">
              <input
                type="date"
                value={updated}
                onChange={e => setUpdated(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Accessed">
              <input
                type="date"
                value={accessed}
                onChange={e => setAccessed(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </div>

        {/* Output */}
        <div className="mt-8">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-sans text-[13px] font-medium text-sage-900">Formatted citation</span>
            <button
              onClick={copy}
              disabled={!citation}
              className="rounded-md border border-sage-200 bg-white/60 px-2.5 py-1 font-sans text-[12px] text-sage-600 transition-colors hover:border-sage-300 hover:text-sage-900 disabled:opacity-40"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="rounded-lg border border-sage-200 bg-white/70 p-4">
            <p className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-sage-800">
              {citation || 'Enter a page title and URL to generate a citation.'}
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-sage-200 py-8">
        <h2
          className="mb-3 font-display text-[21px] font-semibold text-sage-900"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Citing the underlying sources
        </h2>
        <div className="font-sans text-[14.5px] text-sage-700 leading-relaxed space-y-3">
          <p>
            For anything load-bearing — a dose, a contraindication, an approval date —
            cite the primary record, not this site. Each monograph links its source
            documents, and the Resources page lists every upstream dataset with its
            license terms.
          </p>
          <p>
            Citing Pharmacy Commons is appropriate when you are referencing the
            aggregation itself: a derived environmental risk quotient, a class
            grouping, or the structured dataset as a whole.
          </p>
        </div>
      </section>
    </PageShell>
  )
}

const inputClass =
  'w-full rounded-lg border border-sage-200 bg-white/70 px-3 py-2 font-sans text-[13.5px] text-sage-900 placeholder-sage-400 outline-none transition-all focus:border-aqua-400 focus:bg-white focus:ring-2 focus:ring-aqua-200'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-sans text-[12.5px] font-medium text-sage-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block font-sans text-[11.5px] text-sage-600">{hint}</span>}
    </label>
  )
}

function buildCitation(input: {
  style: Style
  author: string
  title: string
  url: string
  updated: string
  accessed: string
}): string {
  const { style, url } = input
  const author = input.author.trim()
  const title = input.title.trim()
  if (!title && !url.trim()) return ''

  const site = 'Pharmacy Commons'
  const up = parseISO(input.updated)
  const ac = parseISO(input.accessed)

  const longDate = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
  const medDate = (d: Date) => `${d.getFullYear()} ${MONTHS_ABBR[d.getMonth()]} ${d.getDate()}`

  switch (style) {
    case 'ama': {
      const parts = [author && `${author}.`, title && `${title}.`, `${site}.`]
      if (up) parts.push(`Updated ${longDate(up)}.`)
      if (ac) parts.push(`Accessed ${longDate(ac)}.`)
      if (url) parts.push(url)
      return parts.filter(Boolean).join(' ')
    }
    case 'apa': {
      const year = up ? `(${up.getFullYear()}, ${MONTHS[up.getMonth()]} ${up.getDate()})` : '(n.d.)'
      const parts = [author && `${author}.`, `${year}.`, title && `${title}.`, `${site}.`]
      if (url) parts.push(url)
      return parts.filter(Boolean).join(' ')
    }
    case 'vancouver':
    case 'nlm': {
      const parts = [author && `${author}.`, title && `${title} [Internet].`, `${site};`]
      if (up) parts.push(`${medDate(up)}`)
      if (ac) parts.push(`[cited ${medDate(ac)}].`)
      if (url) parts.push(`Available from: ${url}`)
      return parts.filter(Boolean).join(' ')
    }
    case 'bibtex': {
      const key = (title || 'pharmacycommons')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .slice(0, 24)
      const lines = [`@misc{pharmacycommons-${key},`]
      if (author) lines.push(`  author       = {${author}},`)
      if (title) lines.push(`  title        = {${title}},`)
      lines.push(`  howpublished = {${site}},`)
      if (up) lines.push(`  year         = {${up.getFullYear()}},`)
      if (ac) lines.push(`  note         = {Accessed ${longDate(ac)}},`)
      if (url) lines.push(`  url          = {${url}}`)
      lines.push('}')
      return lines.join('\n')
    }
    default:
      return ''
  }
}
