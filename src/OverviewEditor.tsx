import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Button from './components/Button'
import WikiMarkdown from './components/WikiMarkdown'
import {
  ContributeError,
  HANDLE_PATTERN,
  kindLabel,
  linkMarkup,
  openLinkQuery,
  savePage,
  setContributorHandle,
  suggestPages,
} from './contribute'
import type { ContributorStatus, PageSuggestion } from './contribute'
import { getPageContent } from './pageContent'
import type { PageContent } from './pageContent'

/**
 * Editor for a page's Overview (phase 15, docs/user-edits.md §3–§4).
 *
 * Two fields (description, markdown text), Write / Preview tabs, `[[`
 * autocomplete from entity names, a required edit summary and the licence
 * notice from Terms of Use §3. Saves through save_page(), which:
 *   - publishes at once on open pages (publish-then-patrol), or
 *   - holds the edit as pending on 'reviewed' pages unless the editor is a
 *     patroller, and
 *   - refuses with 'edit_conflict' if someone saved after this editor opened.
 * On a conflict the editor fetches the newer text and lets the contributor
 * either redo their change on top of it or discard it; nothing is
 * overwritten silently.
 *
 * Contributors without a public handle choose one here first.
 */

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const LINK = `text-ink underline decoration-hepatica-300 underline-offset-2 hover:decoration-hepatica-600 ${FOCUS}`
const FIELD = 'lp-field block w-full rounded-md px-3 py-2 font-sans text-base leading-relaxed text-ink placeholder:text-ink/60'
const LABEL = 'mb-1.5 block font-sans text-sm font-semibold text-ink'
// index.css sizes bare headings outside Tailwind's layers, so size them inline.
const SMALL_HEADING = { fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)', lineHeight: 1.4 } as const
const DESCRIPTION_MAX = 2000
const SUMMARY_MAX = 500

export type SavedOutcome = { pending: boolean }

type Props = {
  pcid: number
  name: string
  data: PageContent
  status: Extract<ContributorStatus, { kind: 'ready' }>
  labelAnchor: string
  onCancel: () => void
  onSaved: (outcome: SavedOutcome) => void
  onHandleSet: () => void
}

export default function OverviewEditor({ pcid, name, data, status, labelAnchor, onCancel, onSaved, onHandleSet }: Props) {
  const [base, setBase] = useState<number | null>(data.currentRevisionId)
  const [description, setDescription] = useState(data.description)
  const [body, setBody] = useState(data.body)
  const [summary, setSummary] = useState('')
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<PageContent | null>(null)

  const held = data.protection === 'reviewed' && !status.patroller
  const locked = data.protection === 'patrollers' && !status.patroller
  const unchanged = description === data.description && body === data.body && base === data.currentRevisionId

  if (status.handle === null) return <HandleSetup onDone={onHandleSet} onCancel={onCancel} />

  if (locked) {
    return (
      <Notice>
        This page is locked to reviewers right now, so it can’t be edited.{' '}
        <button type="button" onClick={onCancel} className={`font-medium underline ${FOCUS}`}>
          Back
        </button>
      </Notice>
    )
  }

  async function save() {
    setError(null)
    if (!summary.trim()) {
      setError('Add a short edit summary describing what you changed.')
      return
    }
    setSaving(true)
    try {
      await savePage({ pcid, baseRevisionId: base, description, body, summary: summary.trim() })
      onSaved({ pending: held })
    } catch (err) {
      if (err instanceof ContributeError && err.reason === 'edit_conflict') {
        try {
          setConflict(await getPageContent(pcid))
        } catch {
          setError(err.message)
        }
      } else {
        setError(err instanceof Error ? err.message : 'The change couldn’t be saved. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (conflict) {
    return (
      <ConflictPanel
        theirs={conflict}
        mine={{ description, body }}
        labelAnchor={labelAnchor}
        onKeepMine={() => {
          setBase(conflict.currentRevisionId)
          setConflict(null)
          setError(null)
        }}
        onDiscard={onCancel}
      />
    )
  }

  return (
    <form
      className="space-y-5"
      onSubmit={e => {
        e.preventDefault()
        void save()
      }}
    >
      {held ? (
        <Notice>
          {name} is a high-alert page. Your edit goes to the review queue and appears once a reviewer accepts it.
        </Notice>
      ) : data.protection === 'reviewed' ? (
        <Notice>{name} is a high-alert page. You’re a reviewer, so your edit goes live straight away.</Notice>
      ) : null}

      <div role="tablist" aria-label="Editor view" className="flex gap-1">
        {(['write', 'preview'] as const).map(t => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`lp-flat rounded-md px-3 py-1.5 font-sans text-sm font-medium text-ink ${FOCUS}`}
          >
            {t === 'write' ? 'Write' : 'Preview'}
          </button>
        ))}
      </div>

      {tab === 'write' ? (
        <div className="space-y-5">
          <div>
            <label htmlFor="overview-description" className={LABEL}>
              Description
            </label>
            <LinkingTextarea
              id="overview-description"
              value={description}
              onChange={setDescription}
              rows={2}
              maxLength={DESCRIPTION_MAX}
              placeholder={`One or two sentences on what ${name} is and what it’s for.`}
            />
            <p className="mt-1 font-sans text-sm text-ink">
              Shown first. {description.length.toLocaleString()} / {DESCRIPTION_MAX.toLocaleString()}
            </p>
          </div>
          <div>
            <label htmlFor="overview-body" className={LABEL}>
              Text
            </label>
            <LinkingTextarea
              id="overview-body"
              value={body}
              onChange={setBody}
              rows={16}
              placeholder="## Dosing calculations&#10;Notes, calculations and context the label leaves out."
            />
            <SyntaxHelp />
          </div>
        </div>
      ) : (
        <div className="lp-sunken space-y-4 rounded-md p-4">
          {description.trim() || body.trim() ? (
            <>
              {description.trim() && (
                <div className="[&_p]:text-lg">
                  <WikiMarkdown source={description} links={data.links} properties={data.properties} labelAnchor={labelAnchor} />
                </div>
              )}
              {body.trim() && <WikiMarkdown source={body} links={data.links} properties={data.properties} labelAnchor={labelAnchor} />}
            </>
          ) : (
            <p className="font-sans text-base text-ink">Nothing to preview yet.</p>
          )}
          <p className="lp-rule-t pt-3 font-sans text-sm text-ink">
            Links and values you’ve just added show as plain text until you save; the database matches them to
            pages when it stores the change.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="overview-summary" className={LABEL}>
          Edit summary <span className="font-normal">(required)</span>
        </label>
        <input
          id="overview-summary"
          type="text"
          value={summary}
          onChange={e => setSummary(e.target.value)}
          maxLength={SUMMARY_MAX}
          placeholder="What did you change, and from what source?"
          className={FIELD}
        />
      </div>

      <p className="font-sans text-sm leading-relaxed text-ink">
        By saving, you agree to license your text under{' '}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" className={LINK}>
          CC BY-SA 4.0
        </a>{' '}
        and any structured values under CC0, as set out in the{' '}
        <Link to="/terms" className={LINK}>
          Terms of Use
        </Link>
        . You’ll be credited as @{status.handle}
        {status.displayCredential ? ' with the credential listed for your NPI' : ''}. Don’t include patient
        information.
      </p>

      {error && (
        <p role="alert" className="rounded-md border border-rose-300 bg-rose-100/40 px-3 py-2 font-sans text-sm text-ink">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving || unchanged}>
          {saving ? 'Saving…' : held ? 'Send for review' : 'Save'}
        </Button>
        <Button onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        {unchanged && <span className="font-sans text-sm text-ink">No changes yet.</span>}
      </div>
    </form>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-sky-300 bg-sky-100/40 px-3 py-2 font-sans text-sm leading-relaxed text-ink">{children}</p>
}

function SyntaxHelp() {
  return (
    <details className="mt-2 font-sans text-sm text-ink">
      <summary className={`cursor-pointer font-medium ${FOCUS}`}>Formatting help</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <code className="font-mono">## Heading</code>, <code className="font-mono">**bold**</code>,{' '}
          <code className="font-mono">- list item</code>, tables with <code className="font-mono">|</code>.
        </li>
        <li>
          Link a page: type <code className="font-mono">[[</code> and pick from the list, or write{' '}
          <code className="font-mono">[[metformin]]</code> or <code className="font-mono">[[metformin|Glucophage]]</code>.
        </li>
        <li>
          Show a live value: <code className="font-mono">{'{{acb_score}}'}</code> for this page, or{' '}
          <code className="font-mono">{'{{acb_score:amitriptyline}}'}</code> for another. Keys: acb_score, qtc_risk,
          do_not_crush, most_used, legal_status, indications, dosing, contraindications, boxed_warning, epc_class.
        </li>
        <li>Cite your sources in the text and the edit summary.</li>
      </ul>
    </details>
  )
}

// ─── Textarea with [[ autocomplete ───────────────────────────────────────────

function LinkingTextarea({
  id,
  value,
  onChange,
  rows,
  maxLength,
  placeholder,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  rows: number
  maxLength?: number
  placeholder?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const listId = useId()
  const [open, setOpen] = useState<{ start: number; query: string } | null>(null)
  const [items, setItems] = useState<PageSuggestion[]>([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (!open || open.query.trim().length < 2) {
      setItems([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      suggestPages(open.query, controller.signal)
        .then(rows => {
          setItems(rows)
          setActive(0)
        })
        .catch(() => setItems([]))
    }, 150)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open?.query])

  function track(el: HTMLTextAreaElement) {
    setOpen(openLinkQuery(el.value, el.selectionStart ?? el.value.length))
  }

  function choose(s: PageSuggestion) {
    const el = ref.current
    if (!el || !open) return
    const caret = el.selectionStart ?? value.length
    // Swallow a closing ]] the writer may already have typed.
    const after = value.slice(caret).replace(/^\]\]/, '')
    const insert = linkMarkup(s)
    const next = value.slice(0, open.start) + insert + after
    onChange(next)
    setOpen(null)
    setItems([])
    requestAnimationFrame(() => {
      el.focus()
      const pos = open.start + insert.length
      el.setSelectionRange(pos, pos)
    })
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(a => (a + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => (a - 1 + items.length) % items.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      choose(items[active])
    } else if (e.key === 'Escape') {
      setOpen(null)
      setItems([])
    }
  }

  const showList = open !== null && items.length > 0

  return (
    <div className="relative">
      <textarea
        ref={ref}
        id={id}
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        spellCheck
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        onChange={e => {
          onChange(e.target.value)
          track(e.target)
        }}
        onKeyDown={onKeyDown}
        onClick={e => track(e.currentTarget)}
        onBlur={() => setTimeout(() => setOpen(null), 150)}
        className={`${FIELD} resize-y`}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Pages to link"
          className="pc-grain lp-raised absolute right-0 left-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-md bg-paper py-1"
        >
          {items.map((s, i) => (
            <li
              key={s.slug}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={e => {
                e.preventDefault()
                choose(s)
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 font-sans text-sm text-ink ${
                i === active ? 'lp-raised' : ''
              }`}
            >
              <span className="min-w-0 truncate font-medium">{s.name}</span>
              <span className="shrink-0">{kindLabel(s.entityType)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Handle setup ─────────────────────────────────────────────────────────────

function HandleSetup({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [handle, setHandle] = useState('')
  const [showCredential, setShowCredential] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = HANDLE_PATTERN.test(handle)

  async function submit() {
    setError(null)
    setSaving(true)
    try {
      await setContributorHandle(handle, showCredential)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That handle couldn’t be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={e => {
        e.preventDefault()
        if (valid) void submit()
      }}
    >
      <p className="font-sans text-base leading-relaxed text-ink">
        Before your first edit, choose the public handle your changes are credited to. Your name and NPI number are
        never shown.
      </p>
      <div>
        <label htmlFor="contributor-handle" className={LABEL}>
          Handle
        </label>
        <div className="flex items-center gap-2">
          <span className="font-sans text-base text-ink">@</span>
          <input
            id="contributor-handle"
            type="text"
            value={handle}
            onChange={e => setHandle(e.target.value.trim())}
            maxLength={30}
            autoComplete="nickname"
            placeholder="e.g. jsmith_rph"
            className={FIELD}
          />
        </div>
        <p className="mt-1 font-sans text-sm text-ink">3–30 letters, numbers, dots, dashes or underscores.</p>
      </div>
      <label className="flex items-start gap-2 font-sans text-sm text-ink">
        <input
          type="checkbox"
          checked={showCredential}
          onChange={e => setShowCredential(e.target.checked)}
          className="mt-0.5 accent-ink"
        />
        <span>Show the credential listed for my NPI next to my handle (for example “@jsmith_rph · PharmD”).</span>
      </label>
      {error && (
        <p role="alert" className="rounded-md border border-rose-300 bg-rose-100/40 px-3 py-2 font-sans text-sm text-ink">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={!valid || saving}>
          {saving ? 'Saving…' : 'Continue'}
        </Button>
        <Button onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// ─── Edit conflict ────────────────────────────────────────────────────────────

function ConflictPanel({
  theirs,
  mine,
  labelAnchor,
  onKeepMine,
  onDiscard,
}: {
  theirs: PageContent
  mine: { description: string; body: string }
  labelAnchor: string
  onKeepMine: () => void
  onDiscard: () => void
}) {
  return (
    <div className="space-y-4">
      <Notice>
        Someone else saved this page while you were editing. Compare the two versions below. Nothing has been lost:
        keep editing your version (it will replace theirs, so carry over anything of theirs you want to keep), or
        discard yours.
      </Notice>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <h3 className={LABEL} style={SMALL_HEADING}>
            Their saved version
          </h3>
          <div className="lp-sunken max-h-[28rem] space-y-3 overflow-y-auto rounded-md p-4">
            {theirs.description && <WikiMarkdown source={theirs.description} links={theirs.links} properties={theirs.properties} labelAnchor={labelAnchor} />}
            {theirs.body ? (
              <WikiMarkdown source={theirs.body} links={theirs.links} properties={theirs.properties} labelAnchor={labelAnchor} />
            ) : (
              !theirs.description && <p className="font-sans text-base text-ink">(empty)</p>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <h3 className={LABEL} style={SMALL_HEADING}>
            Your version
          </h3>
          <pre className="lp-sunken max-h-[28rem] overflow-auto rounded-md p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap text-ink">
            {[mine.description, mine.body].filter(Boolean).join('\n\n') || '(empty)'}
          </pre>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button onClick={onKeepMine}>Keep editing my version</Button>
        <Button onClick={onDiscard}>Discard my changes</Button>
      </div>
    </div>
  )
}
