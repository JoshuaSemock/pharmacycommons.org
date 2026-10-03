import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '@/components/Button'
import Card from '@/components/Card'
import CharacterIndex from '@/components/CharacterIndex'
import DrugPreviewLink from '@/components/DrugPreviewLink'
import Stamp from '@/components/Stamp'
import { PageTitle } from '@/pages/PageShell'
import { SectionHeading, ChipRadio } from '@/tools/medrec/ui'
import { getListBySlug } from '@/api'
import type { ListDetail, ListItem } from '@/api.generated'
import { bucketName, bucketToParam, paramToBucket, type Bucket } from '@/catalog'
import {
  DIC_FILENAME,
  FILTERS,
  PAGE_SIZE,
  dicUtf16,
  dicUtf8,
  displayDefinition,
  isFilter,
  loadBucket,
  loadBucketCounts,
  loadDicText,
  saveBlob,
  searchDictionary,
  tagOf,
  wordCount,
  type DictionaryEntry,
  type DictionaryFilter,
} from '@/dictionary'

/**
 * /tools/dictionary
 *
 * A custom dictionary for Microsoft Word: medical terms, abbreviations and
 * drug and brand names, so Word stops underlining correct spellings and can
 * suggest them. The page is in four parts:
 *
 *   1. Download (.dic, built by dictionary_dic() in Supabase; UTF-8 with a BOM)
 *   2. How to add it to Word, for Windows and Mac
 *   3. The Joint Commission "Do Not Use" list (pc:list:joint-commission-do-not-use)
 *   4. The dictionary itself, A–Z, with definitions; drug names link to their
 *      records and preview on hover (DrugPreviewLink)
 *
 * Data: public.dictionary_terms (phase 14). Notes: docs/dictionary.md.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const TITLE = 'Medical dictionary for Word'
const DO_NOT_USE_SLUG = 'joint-commission-do-not-use'

type Os = 'windows' | 'mac'

const STEPS: Record<Os, { title: string; body: string }[]> = {
  windows: [
    { title: 'Open the proofing settings', body: 'In Word, choose File › Options › Proofing.' },
    { title: 'Open custom dictionaries', body: 'Under "When correcting spelling in Microsoft Office programs", choose Custom Dictionaries….' },
    { title: 'Add the file', body: `Choose Add…, find ${DIC_FILENAME} (usually in Downloads) and choose Open.` },
    { title: 'Check it is turned on', body: 'Make sure its box is ticked and, with it selected, set Dictionary language to All Languages. Choose OK twice.' },
  ],
  mac: [
    { title: 'Open the spelling settings', body: 'In Word, choose Word › Settings (Preferences on older versions) › Spelling & Grammar.' },
    { title: 'Open custom dictionaries', body: 'Under Custom dictionary, choose Dictionaries….' },
    { title: 'Add the file', body: `Choose Add…, find ${DIC_FILENAME} (usually in Downloads) and choose Open.` },
    { title: 'Check it is turned on', body: 'Make sure its box is ticked, then choose OK.' },
  ],
}

const fmtBytes = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.round(n / 1000)} KB`)

export default function Dictionary() {
  useEffect(() => {
    document.title = `${TITLE} · Pharmacy Commons`
  }, [])

  return (
    <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <header className="pt-10 pb-10 sm:pt-14 lg:pb-12">
        <PageTitle
          title={TITLE}
          lede="Teach Word to spell medicine. One file adds about 43,000 drug names, brand names, biologics, medical terms and abbreviations to Word's spell checker, so correct spellings stop being underlined and Word can suggest them when a name is mistyped."
        />
      </header>

      <div className="grid gap-10 border-t border-ink/15 pt-10 lg:grid-cols-2 lg:gap-12">
        <DownloadPanel />
        <HowToAdd />
      </div>

      <DoNotUse />
      <Browser />
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Download
// ─────────────────────────────────────────────────────────────────────────────

function DownloadPanel() {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle')
  const [info, setInfo] = useState<{ words: number; bytes: number } | null>(null)
  const text = useRef<string | null>(null)

  async function get(): Promise<string | null> {
    if (text.current) return text.current
    setState('busy')
    try {
      const t = await loadDicText()
      text.current = t
      return t
    } catch {
      setState('failed')
      return null
    }
  }

  async function download(encoding: 'utf8' | 'utf16') {
    const t = await get()
    if (!t) return
    const blob = encoding === 'utf8' ? dicUtf8(t) : dicUtf16(t)
    saveBlob(blob, DIC_FILENAME)
    setInfo({ words: wordCount(t), bytes: blob.size })
    setState('done')
  }

  return (
    <section aria-labelledby="download" className="min-w-0">
      <SectionHeading id="download" title="Download" />
      <div className="mt-4 space-y-4 font-sans text-[15px] leading-relaxed text-ink">
        <p>
          The file is a plain word list, one word per line, saved as UTF-8 with a <span className="font-mono text-[13px]">.dic</span> extension: the
          format Word's custom dictionaries use. It holds spellings only, with no definitions, identifiers or other data, and it is rebuilt from the
          dictionary below each time you download it.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => download('utf8')} disabled={state === 'busy'}>
            <DownloadIcon />
            {state === 'busy' ? 'Building the file…' : 'Download the dictionary (.dic)'}
          </Button>
          <button
            type="button"
            onClick={() => download('utf16')}
            disabled={state === 'busy'}
            className="font-sans text-[13px] text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
          >
            UTF-16 version
          </button>
        </div>
        <p className="text-[13px]" aria-live="polite">
          {state === 'failed' && 'The file could not be built just now. Try again in a moment.'}
          {state === 'done' && info && `Saved ${DIC_FILENAME}: ${info.words.toLocaleString()} words, ${fmtBytes(info.bytes)}.`}
          {(state === 'idle' || state === 'busy') &&
            'If accented or Greek letters (é, α, β) show up wrong after you add it, use the UTF-16 version, the encoding Word saves its own dictionaries in.'}
        </p>
      </div>
    </section>
  )
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 1.5v8M3.75 6.5L7 9.75 10.25 6.5M2 12.25h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. How to add it
// ─────────────────────────────────────────────────────────────────────────────

function HowToAdd() {
  const [os, setOs] = useState<Os>(() => (typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? 'mac' : 'windows'))
  return (
    <section aria-labelledby="add-to-word" className="min-w-0">
      <SectionHeading id="add-to-word" title="Add it to Word" />
      <div className="mt-4">
        <ChipRadio
          name="dict-os"
          label="Your computer"
          value={os}
          options={[
            ['windows', 'Windows'],
            ['mac', 'Mac'],
          ]}
          onChange={setOs}
        />
      </div>
      <ol className="mt-5 space-y-4">
        {STEPS[os].map((s, i) => (
          <li key={s.title} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3">
            <span className="font-mono text-[13px] leading-6 text-ink">{i + 1}.</span>
            <div className="min-w-0 font-sans text-[14.5px] leading-relaxed text-ink">
              <p className="font-medium">{s.title}</p>
              <p>{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-5 font-sans text-[13px] leading-relaxed text-ink">
        Outlook, PowerPoint and the other desktop Office apps share the same custom dictionaries. Word on the web and the phone and tablet apps
        cannot load a dictionary file. To update, download the file again and add it in place of the old one.
      </p>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. The Joint Commission "Do Not Use" list
// ─────────────────────────────────────────────────────────────────────────────

type Group = { names: string[]; note: string | null; source: string | null }

/** Consecutive entries with the same explanation (U and u; the four QD spellings) read as one row. */
function groupItems(items: ListItem[]): Group[] {
  const out: Group[] = []
  for (const i of [...items].sort((a, b) => a.position - b.position)) {
    const last = out[out.length - 1]
    if (last && last.note === i.note && last.source === i.legal_status) last.names.push(i.source_name)
    else out.push({ names: [i.source_name], note: i.note, source: i.legal_status })
  }
  return out
}

function DoNotUse() {
  const [list, setList] = useState<ListDetail | null | undefined>(undefined)
  useEffect(() => {
    getListBySlug(DO_NOT_USE_SLUG).then(setList, () => setList(null))
  }, [])

  const groups = useMemo(() => (list ? groupItems(list.items) : []), [list])
  const official = groups.filter(g => g.source !== 'ISMP addition')
  const extra = groups.filter(g => g.source === 'ISMP addition')

  return (
    <section aria-labelledby="do-not-use" className="mt-14 border-t border-ink/15 pt-10">
      <SectionHeading
        id="do-not-use"
        title={'The Joint Commission "Do Not Use" list'}
        lede="Some abbreviations are spelled right and still dangerous. These have each been misread in ways that harmed patients, so The Joint Commission prohibits them in every order, preprinted form and piece of medication-related documentation, handwritten or electronic."
      />
      <Card sunken className="mt-6 max-w-4xl">
        {list === undefined && <p className="font-sans text-[14px] text-ink">Loading the list…</p>}
        {list === null && (
          <p className="font-sans text-[14px] text-ink">
            The list could not be loaded just now. The prohibited set is U, IU, Q.D., Q.O.D., trailing zeros, missing leading zeros, MS, MSO4 and
            MgSO4.
          </p>
        )}
        {list && (
          <>
            <DoNotUseTable groups={official} />
            {extra.length > 0 && (
              <>
                <p className="mt-6 font-sans text-[13px] font-medium text-ink">
                  Also error-prone (ISMP; not on the Joint Commission list)
                </p>
                <DoNotUseTable groups={extra} />
              </>
            )}
          </>
        )}
      </Card>
      <div className="mt-5 max-w-[42rem] space-y-3 font-sans text-[14px] leading-relaxed text-ink">
        <p>
          The download includes these abbreviations, because they are correctly spelled, so Word will not underline them. Don't rely on the spell
          checker to catch them; write the term out in full as shown above.
        </p>
        <p>
          A trailing zero is still allowed where the precision of a value must be shown, such as laboratory results, the size of a lesion, or
          catheter and tube sizes, but never in a medication order.{' '}
          {list && (
            <>
              Source:{' '}
              {list.source_url ? (
                <a href={list.source_url} target="_blank" rel="noreferrer" className="underline decoration-ink/30 underline-offset-2 hover:decoration-ink">
                  The Joint Commission, Standard IM.02.02.01
                </a>
              ) : (
                'The Joint Commission, Standard IM.02.02.01'
              )}
              .{' '}
              <Link to={`/lists/${DO_NOT_USE_SLUG}`} className="underline decoration-ink/30 underline-offset-2 hover:decoration-ink">
                Open it as a list
              </Link>{' '}
              (<span className="font-mono text-[12.5px]">{list.pcid_code}</span>).
            </>
          )}
        </p>
      </div>
    </section>
  )
}

function DoNotUseTable({ groups }: { groups: Group[] }) {
  return (
    <ul className="divide-y divide-ink/10">
      {groups.map(g => (
        <li key={g.names.join('|')} className="grid gap-x-6 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(9rem,14rem)_minmax(0,1fr)]">
          <span className="min-w-0 break-words font-mono text-[14px] font-medium text-ink">{g.names.join(', ')}</span>
          <span className="min-w-0 font-sans text-[14px] leading-snug text-ink">{g.note}</span>
        </li>
      ))}
    </ul>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. The dictionary
// ─────────────────────────────────────────────────────────────────────────────

function Browser() {
  const [params, setParams] = useSearchParams()
  const bucket: Bucket = paramToBucket(params.get('letter')) ?? 'A'
  const filterParam = params.get('show')
  const filter: DictionaryFilter = isFilter(filterParam) ? filterParam : 'all'
  const [query, setQuery] = useState(params.get('q') ?? '')
  const q = query.trim()
  const searching = q.length >= 2

  const [counts, setCounts] = useState<Record<Bucket, number> | null>(null)
  const [rows, setRows] = useState<DictionaryEntry[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [doNotUse, setDoNotUse] = useState<Set<number>>(new Set())
  const top = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadBucketCounts().then(setCounts, () => setCounts(null))
    getListBySlug(DO_NOT_USE_SLUG).then(
      l => setDoNotUse(new Set((l?.items ?? []).map(i => i.term_id).filter((n): n is number => typeof n === 'number'))),
      () => undefined,
    )
  }, [])

  // Keep ?q= in step with the box, without a history entry per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = new URLSearchParams(params)
      if (q) next.set('q', q)
      else next.delete('q')
      if (next.toString() !== params.toString()) setParams(next, { replace: true })
    }, 300)
    return () => window.clearTimeout(t)
  }, [q, params, setParams])

  useEffect(() => {
    const ctl = new AbortController()
    setStatus('loading')
    const run = searching
      ? searchDictionary(q, filter, ctl.signal).then(r => ({ rows: r, total: r.length }))
      : loadBucket(bucket, filter, 0, ctl.signal)
    const t = window.setTimeout(
      () =>
        run.then(
          r => {
            setRows(r.rows)
            setTotal(r.total)
            setStatus('ready')
          },
          err => {
            if (!ctl.signal.aborted) {
              console.error(err)
              setStatus('failed')
            }
          },
        ),
      searching ? 200 : 0,
    )
    return () => {
      window.clearTimeout(t)
      ctl.abort()
    }
  }, [bucket, filter, q, searching])

  async function loadMore() {
    try {
      const r = await loadBucket(bucket, filter, rows.length)
      setRows(prev => [...prev, ...r.rows])
    } catch (err) {
      console.error(err)
    }
  }

  function patch(next: Record<string, string | null>) {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k)
      else p.set(k, v)
    }
    setParams(p, { replace: false })
  }

  function selectBucket(b: Bucket | null) {
    if (!b) return
    setQuery('')
    patch({ letter: bucketToParam(b), q: null })
    top.current?.scrollIntoView({ block: 'start' })
  }

  const heading = searching
    ? status === 'ready'
      ? `${rows.length.toLocaleString()}${rows.length >= 300 ? '+' : ''} matches for “${q}”`
      : `Searching for “${q}”…`
    : `${bucketName(bucket)}: ${status === 'ready' ? `${total.toLocaleString()} entries` : '…'}`

  return (
    <section aria-labelledby="dictionary" className="mt-14 border-t border-ink/15 pt-10">
      <SectionHeading
        id="dictionary"
        title="The dictionary"
        lede="Every entry in the download, with what it means. Drug and brand names link to their records; point at one to preview its classes and identifier."
      />

      <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="lp-field flex max-w-lg flex-1 items-center gap-2 rounded-md px-4 py-2.5">
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-ink">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search terms and definitions"
            aria-label="Search the dictionary"
            className="min-w-0 flex-1 bg-transparent font-sans text-[15px] text-ink outline-none placeholder:text-ink"
          />
        </div>
        <ChipRadio
          name="dict-filter"
          label="Show"
          value={filter}
          options={FILTERS.map(f => [f.id, f.label] as const)}
          onChange={v => patch({ show: v === 'all' ? null : v })}
        />
      </div>

      <div className="mt-6">
        <CharacterIndex
          counts={counts}
          active={searching ? null : bucket}
          onSelect={selectBucket}
          showAll={false}
          label="Dictionary by first character"
        />
      </div>

      <div ref={top} className="scroll-mt-[calc(var(--nav-h,5.75rem)_+_3rem)]" />
      <p className="mt-6 font-sans text-[13px] text-ink" aria-live="polite">
        {heading}
      </p>

      {status === 'failed' && <p className="mt-4 font-sans text-[14px] text-ink">The dictionary could not be loaded just now. Try again in a moment.</p>}

      {status !== 'failed' && (
        <ul className={`mt-3 divide-y divide-ink/10 ${status === 'loading' ? 'opacity-60' : ''}`}>
          {rows.map(e => (
            <Entry key={e.id} entry={e} doNotUse={doNotUse.has(e.id)} />
          ))}
        </ul>
      )}

      {status === 'ready' && rows.length === 0 && (
        <p className="mt-4 font-sans text-[14px] text-ink">{searching ? 'Nothing matches that.' : 'No entries under this character with this filter.'}</p>
      )}

      {!searching && status === 'ready' && rows.length < total && (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button onClick={loadMore} size="sm">
            Load {Math.min(PAGE_SIZE, total - rows.length).toLocaleString()} more
          </Button>
          <span className="font-mono text-[11px] text-ink">{(total - rows.length).toLocaleString()} left</span>
        </div>
      )}
    </section>
  )
}

function Entry({ entry, doNotUse }: { entry: DictionaryEntry; doNotUse: boolean }) {
  const def = displayDefinition(entry)
  const tag = tagOf(entry)
  return (
    <li className="grid gap-x-6 gap-y-1 py-2.5 sm:grid-cols-[minmax(10rem,18rem)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        {entry.member_pcid ? (
          <DrugPreviewLink
            pcid={entry.member_pcid}
            className="min-w-0 break-words font-sans text-[15px] font-medium text-ink underline decoration-ink/25 underline-offset-2 hover:decoration-ink"
          >
            {entry.term}
          </DrugPreviewLink>
        ) : (
          <span className="min-w-0 break-words font-sans text-[15px] font-medium text-ink">{entry.term}</span>
        )}
        {tag && <span className="font-sans text-[11.5px] text-ink">{tag}</span>}
        {doNotUse && <Stamp sunken>Do not use</Stamp>}
      </div>
      <p className="min-w-0 break-words font-sans text-[14px] leading-snug text-ink">{def ?? '—'}</p>
    </li>
  )
}
