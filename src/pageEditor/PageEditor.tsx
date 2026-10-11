import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button'
import { HandleSetup } from '../OverviewEditor'
import { linkMarkup, suggestPages } from '../contribute'
import type { ContributorStatus } from '../contribute'
import { contextAt, panelFor, parsePageSource } from '../pageSource'
import type { Diagnostic, FragmentTarget, PageContext, ParseResult } from '../pageSource'
import { openPage, publishPage, PublishError } from './api'
import type { OpenResult, PublishProblem, PublishResult } from './api'
import { applyCompletion, completionAt } from './complete'
import type { Completion } from './complete'
import { clearDraft, draftKey, loadDraft, pruneDrafts, saveDraft } from './draft'
import type { Draft } from './draft'
import PagePreview from './PagePreview'

/**
 * The full-page editor (docs/page-editor.md §4, §4a, §7). Opens the whole page
 * (Edit page) or one section (its [edit] link) as page source, checks it live
 * with the same parser publish-page uses, and publishes through publish-page.
 *
 *   Source   the text, with problems listed under it and a panel of what can be
 *            written where the cursor is; autocomplete for [[ {{ [@ ::: ::
 *   Preview  the page as it will read
 *   Publish  required summary; refused until every error is fixed
 *
 * Drafts save to this browser as you type. If someone publishes in the
 * meantime, publish-page merges section by section; a real clash reloads the
 * merged page here with your own text alongside to re-apply.
 */

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const LINK = `text-ink underline decoration-hepatica-300 underline-offset-2 hover:decoration-hepatica-600 ${FOCUS}`
const FIELD = 'lp-field block w-full rounded-md px-3 py-2 font-sans text-base leading-relaxed text-ink placeholder:text-ink/60'
const SOURCE = 'lp-field block w-full rounded-md px-3 py-2 font-mono text-sm leading-relaxed text-ink [tab-size:2]'
const LABEL = 'mb-1.5 block font-sans text-sm font-semibold text-ink'
const SMALL_HEADING = { fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)', lineHeight: 1.4 } as const
const SUMMARY_MAX = 500

type Ready = Extract<ContributorStatus, { kind: 'ready' }>

type Props = {
  pcid: number
  /** Page name as shown, for messages. */
  name: string
  target?: FragmentTarget
  status: Ready
  onHandleSet: () => void
  onClose: () => void
  onPublished: (result: PublishResult) => void
}

export function targetLabel(target?: FragmentTarget): string {
  if (!target) return 'the whole page'
  if (target.kind === 'lead') return 'the lead'
  if (target.kind === 'rail') return target.name === 'infobox' ? 'Quick Facts' : 'brand names'
  return target.heading
}

export default function PageEditor(props: Props) {
  const { status, onHandleSet, onClose } = props
  if (status.handle === null) return <HandleSetup onDone={onHandleSet} onCancel={onClose} />
  return <EditorLoader {...props} />
}

function EditorLoader(props: Props) {
  const { pcid, target } = props
  const [opened, setOpened] = useState<OpenResult | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const targetKey = JSON.stringify(target ?? null)

  useEffect(() => {
    let cancelled = false
    setOpened(null)
    setFailed(null)
    pruneDrafts()
    openPage(pcid, target)
      .then(r => !cancelled && setOpened(r))
      .catch((e: unknown) => {
        if (cancelled) return
        setFailed(e instanceof PublishError && e.problem.kind === 'message' ? e.problem.message : 'The editor couldn’t load this page. Please try again.')
      })
    return () => {
      cancelled = true
    }
    // targetKey stands in for `target` (a new object on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pcid, targetKey])

  if (failed) return <Notice>{failed}</Notice>
  if (!opened) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading the editor">
        <div className="h-4 w-4/5 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
        <div className="h-40 w-full animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
      </div>
    )
  }
  return <Editor {...props} opened={opened} />
}

function Editor({ pcid, name, target, status, onClose, onPublished, opened }: Props & { opened: OpenResult }) {
  const ctx: PageContext = useMemo(() => ({ ...opened.context, registry: opened.registry }), [opened])
  const key = draftKey(pcid, target)
  const [source, setSource] = useState(opened.source)
  const [base, setBase] = useState<number | null>(opened.revisionId)
  const [summary, setSummary] = useState('')
  const [tab, setTab] = useState<'source' | 'preview'>('source')
  const [caret, setCaret] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [problem, setProblem] = useState<PublishProblem | null>(null)
  const [conflictNote, setConflictNote] = useState<Extract<PublishProblem, { kind: 'conflict' }> | null>(null)
  const [draft, setDraft] = useState<Draft | null>(() => {
    const d = loadDraft(key)
    return d && d.source !== opened.source ? d : null
  })
  const area = useRef<HTMLTextAreaElement | null>(null)
  const sourceId = useId()
  const summaryId = useId()

  const held = opened.protection === 'reviewed' && !status.patroller
  const locked = opened.protection === 'patrollers' && !status.patroller

  // Live checks on the deferred text, so typing stays smooth on long pages.
  const deferred = useDeferredValue(source)
  const result: ParseResult = useMemo(
    () => parsePageSource(deferred, ctx, target ? { mode: 'fragment', target, sectionIds: opened.sectionIds } : { sectionIds: opened.sectionIds }),
    [deferred, ctx, target, opened.sectionIds],
  )
  const errors = result.diagnostics.filter(d => d.severity === 'error')
  const unchanged = source === opened.source && base === opened.revisionId

  // Autosave the draft.
  useEffect(() => {
    if (source === opened.source && !summary) return
    const t = window.setTimeout(() => saveDraft(key, { source, summary, baseRevisionId: base }), 400)
    return () => window.clearTimeout(t)
  }, [key, source, summary, base, opened.source])

  // ── Autocomplete ─────────────────────────────────────────────────────────
  const [completion, setCompletion] = useState<Completion | null>(null)
  const [active, setActive] = useState(0)
  useEffect(() => {
    const c = completionAt(source, caret, ctx)
    if (!c || c.kind !== 'page') {
      setCompletion(c && c.options.length ? c : null)
      setActive(0)
      return
    }
    if (c.query.trim().length < 2) {
      setCompletion(null)
      return
    }
    const controller = new AbortController()
    const t = window.setTimeout(() => {
      suggestPages(c.query, controller.signal)
        .then(pages => {
          setCompletion(pages.length ? { ...c, options: pages.map(p => ({ label: p.name, insert: linkMarkup(p), hint: p.entityType })) } : null)
          setActive(0)
        })
        .catch(() => {})
    }, 150)
    return () => {
      controller.abort()
      window.clearTimeout(t)
    }
  }, [source, caret, ctx])

  const insertAt = useCallback(
    (text: string, at: number, replaceTo = at) => {
      const next = source.slice(0, at) + text + source.slice(replaceTo)
      setSource(next)
      const pos = at + text.length
      requestAnimationFrame(() => {
        area.current?.focus()
        area.current?.setSelectionRange(pos, pos)
        setCaret(pos)
      })
    },
    [source],
  )

  function choose(i: number) {
    if (!completion) return
    const opt = completion.options[i]
    const r = applyCompletion(source, caret, completion, opt.insert)
    setSource(r.text)
    setCompletion(null)
    requestAnimationFrame(() => {
      area.current?.focus()
      area.current?.setSelectionRange(r.caret, r.caret)
      setCaret(r.caret)
    })
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!completion) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(a => (a + 1) % completion.options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => (a - 1 + completion.options.length) % completion.options.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      choose(active)
    } else if (e.key === 'Escape') {
      setCompletion(null)
    }
  }

  function jumpTo(line: number) {
    const el = area.current
    if (!el) return
    setTab('source')
    const lines = source.split('\n')
    const pos = lines.slice(0, Math.max(0, line - 1)).reduce((n, l) => n + l.length + 1, 0)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(pos, pos + (lines[line - 1]?.length ?? 0))
      // Scroll roughly to the line.
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20
      el.scrollTop = Math.max(0, (line - 4) * lineHeight)
      setCaret(pos)
    })
  }

  const caretLine = source.slice(0, caret).split('\n').length
  const panel = useMemo(() => panelFor(target?.kind === 'rail' ? { region: 'block', name: target.name } : contextAt(source, caretLine), ctx), [source, caretLine, ctx, target])

  async function publish() {
    setProblem(null)
    if (!summary.trim()) {
      setProblem({ kind: 'message', status: 0, code: 'summary_required', message: 'Add a short edit summary saying what you changed and why.' })
      return
    }
    setPublishing(true)
    try {
      const r = await publishPage({ pcid, baseRevisionId: base, source, summary: summary.trim(), target })
      clearDraft(key)
      onPublished(r)
    } catch (e) {
      const p: PublishProblem = e instanceof PublishError ? e.problem : { kind: 'message', status: 0, code: 'error', message: 'Publishing failed. Your draft is saved; try again.' }
      if (p.kind === 'conflict') {
        // Reload the merged page; keep the contributor's own text beside it.
        setConflictNote(p)
        setSource(p.source)
        setBase(p.revisionId)
      } else setProblem(p)
    } finally {
      setPublishing(false)
    }
  }

  if (locked) {
    return (
      <Notice>
        This page is locked to reviewers right now, so it can’t be edited.{' '}
        <button type="button" onClick={onClose} className={`lp-press ml-1 rounded-md px-2 py-0.5 ${FOCUS}`}>
          Back
        </button>
      </Notice>
    )
  }

  const serverDiagnostics = problem?.kind === 'invalid' ? problem.diagnostics : []

  return (
    <form
      className="space-y-4"
      onSubmit={e => {
        e.preventDefault()
        void publish()
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-sans text-sm text-ink">
          Editing <strong className="font-semibold">{targetLabel(target)}</strong>
          {target ? ` on ${name}` : ` of ${name}`}.{' '}
          <Link to="/blog/how-to-edit-a-page" target="_blank" className={LINK}>
            How to edit
          </Link>
        </p>
        <div role="tablist" aria-label="Editor view" className="flex gap-1">
          {(['source', 'preview'] as const).map(t => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`lp-toggle rounded-md px-3 py-1.5 font-sans text-sm font-medium text-ink ${FOCUS}`}
            >
              {t === 'source' ? 'Source' : 'Preview'}
            </button>
          ))}
        </div>
      </div>

      {held && <Notice>{name} is a high-alert page. Your edit goes to the review queue and appears once a reviewer accepts it.</Notice>}

      {draft && (
        <Notice>
          You have an unpublished draft from {new Date(draft.savedAt).toLocaleString()}.{' '}
          <button
            type="button"
            className={`lp-press rounded-md px-2 py-0.5 ${FOCUS}`}
            onClick={() => {
              setSource(draft.source)
              setSummary(draft.summary)
              setDraft(null)
            }}
          >
            Restore it
          </button>{' '}
          <button
            type="button"
            className={`lp-press rounded-md px-2 py-0.5 ${FOCUS}`}
            onClick={() => {
              clearDraft(key)
              setDraft(null)
            }}
          >
            Discard it
          </button>
          {draft.baseRevisionId !== opened.revisionId && ' The page has changed since; publishing merges your draft with those changes.'}
        </Notice>
      )}

      {conflictNote && <ConflictNote note={conflictNote} onDismiss={() => setConflictNote(null)} />}

      {tab === 'source' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="min-w-0 space-y-2">
            <label htmlFor={sourceId} className="sr-only">
              Page source
            </label>
            <textarea
              id={sourceId}
              ref={area}
              value={source}
              spellCheck
              rows={target ? 14 : 32}
              onChange={e => {
                setSource(e.target.value)
                setCaret(e.target.selectionStart)
              }}
              onSelect={e => setCaret(e.currentTarget.selectionStart)}
              onKeyDown={onKeyDown}
              aria-describedby={`${sourceId}-problems`}
              aria-autocomplete="list"
              aria-expanded={Boolean(completion)}
              className={SOURCE}
            />
            {completion && (
              <ul role="listbox" aria-label="Suggestions" className="lp-popover pc-grain grid max-h-56 gap-0.5 overflow-auto rounded-lg bg-paper p-1.5 font-sans text-sm text-ink">
                {completion.options.map((o, i) => (
                  <li key={o.label + i} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => choose(i)}
                      className={`lp-option flex w-full items-baseline justify-between gap-3 rounded-md px-3 py-1.5 text-left ${i === active ? 'lp-on' : ''}`}
                    >
                      <span className="font-mono">{o.label}</span>
                      <span className="truncate text-xs">{o.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Problems id={`${sourceId}-problems`} diagnostics={[...serverDiagnostics, ...result.diagnostics]} onJump={jumpTo} />
          </div>
          <aside aria-label="What you can write here" className="lp-sunken min-w-0 self-start rounded-md p-3 lg:sticky lg:top-[calc(var(--nav-h,3.5rem)_+_1rem)]">
            <h3 className="font-semibold text-ink" style={SMALL_HEADING}>
              {panel.title}
            </h3>
            <p className="mt-1 font-sans text-xs leading-relaxed text-ink">{panel.help}</p>
            {panel.entries.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {panel.entries.map(e => (
                  <li key={e.label}>
                    <button
                      type="button"
                      onMouseDown={ev => ev.preventDefault()}
                      onClick={() => insertAt(e.insert, caret)}
                      className={`w-full rounded px-1.5 py-1 text-left hover:bg-ink/5 ${FOCUS}`}
                      title={`Insert ${e.insert}`}
                    >
                      <span className="block font-mono text-xs text-ink">{e.label}</span>
                      <span className="block font-sans text-xs text-ink">
                        {e.help}
                        {e.source !== undefined && <> · source: {e.source ?? 'none'}</>}
                        {e.citation === 'required' && ' · citation required'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      ) : (
        <div className="lp-sunken rounded-md p-4">
          <PagePreview result={result} ctx={ctx} target={target} />
        </div>
      )}

      <div>
        <label htmlFor={summaryId} className={LABEL}>
          Edit summary <span className="font-normal">(required)</span>
        </label>
        <input
          id={summaryId}
          type="text"
          value={summary}
          maxLength={SUMMARY_MAX}
          onChange={e => setSummary(e.target.value)}
          placeholder="What you changed and why, e.g. Added renal dosing from the FDA label"
          className={FIELD}
        />
      </div>

      {problem && problem.kind !== 'invalid' && (
        <p role="alert" className="rounded-md border border-rose-400 bg-rose-100/40 px-3 py-2 font-sans text-sm text-ink">
          {problem.kind === 'citation' ? `${problem.message} (${problem.key})` : problem.kind === 'message' ? problem.message : 'Publishing failed.'}
        </p>
      )}

      <p className="font-sans text-xs leading-relaxed text-ink">
        By publishing, you agree to license your text under{' '}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" className={LINK}>
          CC BY-SA 4.0
        </a>{' '}
        and your structured facts under{' '}
        <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener noreferrer" className={LINK}>
          CC0
        </a>
        , and to the{' '}
        <Link to="/terms" className={LINK}>
          terms of use
        </Link>
        .
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={publishing || errors.length > 0 || unchanged || !summary.trim()}>
          {publishing ? 'Publishing…' : held ? 'Send for review' : 'Publish'}
        </Button>
        <Button type="button" size="sm" onClick={onClose} disabled={publishing}>
          Cancel
        </Button>
        <span className="font-sans text-sm text-ink" aria-live="polite">
          {errors.length > 0
            ? `${errors.length} problem${errors.length === 1 ? '' : 's'} to fix before publishing.`
            : unchanged
              ? 'No changes yet.'
              : !summary.trim()
                ? 'Add an edit summary to publish.'
                : 'Ready to publish.'}
        </span>
      </div>
    </form>
  )
}

function Problems({ id, diagnostics, onJump }: { id: string; diagnostics: Diagnostic[]; onJump: (line: number) => void }) {
  const seen = new Set<string>()
  const list = diagnostics.filter(d => {
    const k = `${d.line}:${d.code}:${d.message}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  if (!list.length) return <p id={id} className="font-sans text-xs text-ink">No problems found.</p>
  return (
    <ul id={id} aria-label="Problems" className="space-y-1">
      {list.map((d, i) => (
        <li
          key={i}
          className={`rounded-md border px-2.5 py-1.5 font-sans text-sm text-ink ${
            d.severity === 'error' ? 'border-rose-400 bg-rose-100/40' : d.severity === 'warning' ? 'border-marigold-400 bg-marigold-100/40' : 'border-sky-300 bg-sky-100/30'
          }`}
        >
          <button type="button" onClick={() => onJump(d.line)} className={`mr-2 font-mono text-xs underline underline-offset-2 ${FOCUS}`}>
            Line {d.line}
          </button>
          {d.severity === 'warning' && <span className="font-semibold">Warning: </span>}
          {d.message}
        </li>
      ))}
    </ul>
  )
}

function ConflictNote({ note, onDismiss }: { note: Extract<PublishProblem, { kind: 'conflict' }>; onDismiss: () => void }) {
  return (
    <div role="alert" className="space-y-3 rounded-md border border-marigold-400 bg-marigold-100/30 px-3 py-3 font-sans text-sm text-ink">
      <p>
        Someone published a change to the same {note.conflicts.length === 1 ? 'part' : 'parts'} of this page while you were editing. The editor now shows the
        page with their version; your other changes are kept. Re-apply your text below where you still want it, then publish again.
      </p>
      {note.conflicts.map(c => (
        <details key={c.unit} open>
          <summary className="cursor-pointer font-semibold">{c.label}</summary>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <Version title="Your version" text={c.incoming} />
            <Version title="Now on the page" text={c.current} />
          </div>
        </details>
      ))}
      <button type="button" onClick={onDismiss} className={`lp-press rounded-md px-2 py-0.5 ${FOCUS}`}>
        Hide
      </button>
    </div>
  )
}

function Version({ title, text }: { title: string; text: string | null }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">{title}</span>
        {text && (
          <button type="button" onClick={() => void navigator.clipboard?.writeText(text)} className={`lp-press rounded px-1.5 py-0.5 text-xs ${FOCUS}`}>
            Copy
          </button>
        )}
      </div>
      <pre className="lp-sunken max-h-60 overflow-auto whitespace-pre-wrap rounded p-2 font-mono text-xs">{text ?? '(removed)'}</pre>
    </div>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-sky-300 bg-sky-100/40 px-3 py-2 font-sans text-sm text-ink">{children}</p>
}
