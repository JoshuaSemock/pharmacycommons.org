import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from './Button'
import { useSession } from '../auth'
import type { BrandName } from '../api.generated'
import { applyBrandEdits, brandErrorMessage, editBrand, useBrandEdits } from '../brands'
import type { BrandAction, BrandEdit, ShownBrand } from '../brands'
import { useContributorStatus } from '../contribute'
import type { ContributorStatus } from '../contribute'
import { citationHref, getProtection } from '../infobox'
import type { Protection } from '../infobox'
import { formatBrandName } from '../names'
import { HandleSetup } from '../OverviewEditor'

/**
 * Brand names in the drug page header (phase 15h).
 *
 * Source brands (Drugs@FDA, RxNorm, workbook) link to Drugs@FDA when they
 * have an NDA/BLA. Community additions show with a dashed outline and their
 * source on hover. Brands contributors removed stay listed, struck through,
 * under "Show all", with the reason, so the disagreement is visible.
 * Verified contributors get "Edit brand names": add, remove a listed brand,
 * or undo a community change; every change needs a source.
 */

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const STAMP_LINK = `lp-raised lp-press rounded-md text-ink ${FOCUS}`
const LINK = `text-ink underline decoration-hepatica-300 underline-offset-2 hover:decoration-hepatica-600 ${FOCUS}`
const FIELD = 'lp-field block w-full rounded-md px-3 py-1.5 font-sans text-sm text-ink placeholder:text-ink/60'
const LABEL = 'mb-1 block font-sans text-sm font-semibold text-ink'
const SMALL_TEXT = { fontSize: 'var(--text-sm)' } as const
const CHIP =
  'block rounded-md px-2.5 py-1 font-sans text-sm text-ink shadow-emboss peer-checked:font-medium peer-checked:shadow-deboss peer-focus-visible:ring-2 peer-focus-visible:ring-ink/30'
const PREVIEW = 8

function fdaHref(b: BrandName): string | null {
  const appl = b.appl_nos[0]?.replace(/^(NDA|BLA)/i, '')
  return appl && /^\d{6}$/.test(appl)
    ? `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${appl}`
    : null
}

function credit(e: BrandEdit): string {
  return `@${e.handle}${e.credential ? ` · ${e.credential}` : ''}`
}

export default function BrandNames({ pcidCode, brands }: { pcidCode: string; brands: BrandName[] }) {
  const pcid = Number(pcidCode.replace(/^PCID-/, ''))
  const { edits, reload } = useBrandEdits(pcidCode)
  const { user, loading } = useSession()
  const [statusKey, setStatusKey] = useState(0)
  const status = useContributorStatus(user ? `${user.id}:${statusKey}` : null, loading)
  const [showAll, setShowAll] = useState(false)
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [protection, setProtection] = useState<Protection>('open')

  useEffect(() => {
    if (!editing) return
    const controller = new AbortController()
    getProtection(pcid, controller.signal)
      .then(setProtection)
      .catch(() => {})
    return () => controller.abort()
  }, [editing, pcid])

  const view = applyBrandEdits(brands, edits)
  const canEdit = status.kind === 'ready'
  if (view.shown.length === 0 && view.removed.length === 0 && !canEdit) return null
  const visible = showAll ? view.shown : view.shown.slice(0, PREVIEW)
  const more = view.shown.length > PREVIEW || view.removed.length > 0 || view.shown.some(b => b.added)

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
        <span className="font-sans text-sm font-medium text-ink">Brand names</span>
        {view.shown.length === 0 && <span className="font-sans text-sm text-ink">None listed</span>}
        {visible.map(b => (
          <BrandChip key={b.name} b={b} />
        ))}
        {more && (
          <button
            type="button"
            onClick={() => setShowAll(v => !v)}
            className={`font-sans text-sm font-medium text-ink hover:underline ${FOCUS}`}
          >
            {showAll
              ? 'Show fewer'
              : view.shown.length > PREVIEW
                ? `Show all ${view.shown.length}`
                : view.removed.length > 0
                  ? `Show removed (${view.removed.length})`
                  : 'Show details'}
          </button>
        )}
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => {
              setNotice(null)
              setEditing(true)
            }}
            className={`font-sans text-sm text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink ${FOCUS}`}
          >
            Edit brand names
          </button>
        )}
      </div>

      {showAll && view.shown.some(b => b.added) && (
        <p className="font-sans text-sm text-ink">
          Added by contributors:{' '}
          {view.shown
            .filter(b => b.added)
            .map((b, i) => (
              <span key={b.name}>
                {i > 0 && '; '}
                {formatBrandName(b.name)} ({b.added?.summary}, {b.added && credit(b.added)}
                {b.added?.patrol_status === 'unpatrolled' ? ', not yet reviewed' : ''})
              </span>
            ))}
        </p>
      )}

      {showAll && view.removed.length > 0 && (
        <p className="font-sans text-sm text-ink">
          Removed by contributors:{' '}
          {view.removed.map(({ brand, edit }, i) => (
            <span key={brand.name}>
              {i > 0 && '; '}
              <s>{formatBrandName(brand.name)}</s> ({edit.summary}, {credit(edit)}
              {edit.patrol_status === 'unpatrolled' ? ', not yet reviewed' : ''})
            </span>
          ))}
        </p>
      )}

      {view.pending.length > 0 && (
        <p className="font-sans text-sm text-ink">
          {view.pending.length} brand-name {view.pending.length === 1 ? 'change waits' : 'changes wait'} for a reviewer.
        </p>
      )}

      {notice && (
        <p role="status" className="max-w-xl rounded-md border border-sky-300 bg-sky-100/40 px-3 py-2 font-sans text-sm text-ink">
          {notice}
        </p>
      )}

      {editing && status.kind === 'ready' && (
        <div className="lp-raised max-w-xl rounded-md p-4">
          {status.handle === null ? (
            <HandleSetup onDone={() => setStatusKey(k => k + 1)} onCancel={() => setEditing(false)} />
          ) : (
            <BrandEditor
              pcid={pcid}
              source={brands}
              view={view}
              status={status}
              held={protection === 'reviewed' && !status.patroller}
              onCancel={() => setEditing(false)}
              onSaved={held => {
                setEditing(false)
                setShowAll(true)
                setNotice(held ? 'Sent for review. It appears once a reviewer accepts it.' : 'Saved. A reviewer will check it.')
                reload()
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

function BrandChip({ b }: { b: ShownBrand }) {
  const text = formatBrandName(b.name)
  if (b.added) {
    const e = b.added
    return (
      <span
        className="rounded-md border border-dashed border-ink/40 px-2 py-0.5 font-sans text-sm text-ink"
        title={`Added by ${credit(e)}. Source: ${e.citation}`}
      >
        {text}
        <span className="sr-only"> (added by a contributor)</span>
      </span>
    )
  }
  const href = fdaHref(b)
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" title={`${text} on Drugs@FDA`} className={`${STAMP_LINK} px-2 py-0.5 font-sans text-sm`}>
      {text}
    </a>
  ) : (
    <span className="lp-raised rounded-md px-2 py-0.5 font-sans text-sm text-ink">{text}</span>
  )
}

const ACTIONS: { key: BrandAction; label: string }[] = [
  { key: 'add', label: 'Add a brand' },
  { key: 'hide', label: 'Remove a listed brand' },
  { key: 'clear', label: 'Undo a change' },
]

function BrandEditor({
  pcid,
  source,
  view,
  status,
  held,
  onCancel,
  onSaved,
}: {
  pcid: number
  source: BrandName[]
  view: ReturnType<typeof applyBrandEdits>
  status: Extract<ContributorStatus, { kind: 'ready' }>
  held: boolean
  onCancel: () => void
  onSaved: (held: boolean) => void
}) {
  const [action, setAction] = useState<BrandAction>('add')
  const [brand, setBrand] = useState('')
  const [citation, setCitation] = useState('')
  const [summary, setSummary] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // What each action can act on.
  const hideable = view.shown.filter(b => !b.added).map(b => b.name)
  const undoable = [
    ...view.shown.filter(b => b.added).map(b => b.name),
    ...view.removed.map(r => r.brand.name),
  ]
  const choices = action === 'hide' ? hideable : action === 'clear' ? undoable : []

  async function save() {
    setError(null)
    if (!brand.trim()) return setError(action === 'add' ? 'Enter the brand name.' : 'Choose a brand.')
    if (!citation.trim()) return setError('Add the source for this change.')
    if (!summary.trim()) return setError('Add a short reason.')
    setSaving(true)
    try {
      await editBrand({ pcid, brand: brand.trim(), action, citation: citation.trim(), summary: summary.trim() })
      onSaved(held)
    } catch (err) {
      setError(brandErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const href = citationHref(citation)

  return (
    <form
      className="space-y-3"
      onSubmit={e => {
        e.preventDefault()
        void save()
      }}
    >
      {held && (
        <p className="rounded-md border border-sky-300 bg-sky-100/40 px-3 py-1.5 font-sans text-sm text-ink">
          High-alert page: your change waits for a reviewer before it appears.
        </p>
      )}
      <div role="radiogroup" aria-label="Change" className="flex flex-wrap gap-1.5">
        {ACTIONS.map(a => (
          <label key={a.key} className="relative cursor-pointer">
            <input
              type="radio"
              name="brand-action"
              checked={action === a.key}
              onChange={() => {
                setAction(a.key)
                setBrand('')
              }}
              className="peer sr-only"
            />
            <span className={CHIP}>{a.label}</span>
          </label>
        ))}
      </div>

      {action === 'add' ? (
        <div>
          <label htmlFor="brand-name" className={LABEL}>
            Brand name
          </label>
          <input
            id="brand-name"
            type="text"
            value={brand}
            onChange={e => setBrand(e.target.value)}
            maxLength={120}
            autoComplete="off"
            className={FIELD}
            style={SMALL_TEXT}
          />
          {source.length > 0 && (
            <p className="mt-1 font-sans text-sm text-ink">Spell it as the label or packaging does. International brands are welcome; say the country in the reason.</p>
          )}
        </div>
      ) : choices.length === 0 ? (
        <p className="font-sans text-sm text-ink">
          {action === 'hide' ? 'No listed brands to remove.' : 'No community changes to undo on this page.'}
        </p>
      ) : (
        <div role="radiogroup" aria-label="Brand" className="flex flex-wrap gap-1.5">
          {choices.map(name => (
            <label key={name} className="relative cursor-pointer">
              <input type="radio" name="brand-pick" checked={brand === name} onChange={() => setBrand(name)} className="peer sr-only" />
              <span className={CHIP}>{formatBrandName(name)}</span>
            </label>
          ))}
        </div>
      )}

      <div>
        <label htmlFor="brand-citation" className={LABEL}>
          Source (required)
        </label>
        <input
          id="brand-citation"
          type="text"
          value={citation}
          onChange={e => setCitation(e.target.value)}
          maxLength={500}
          placeholder="Drugs@FDA or DailyMed link, label, reference"
          className={FIELD}
          style={SMALL_TEXT}
        />
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" className={`mt-1 inline-block font-sans text-sm ${LINK}`}>
            Check the link
          </a>
        )}
      </div>
      <div>
        <label htmlFor="brand-summary" className={LABEL}>
          Reason (required, shown on the page)
        </label>
        <input
          id="brand-summary"
          type="text"
          value={summary}
          onChange={e => setSummary(e.target.value)}
          maxLength={500}
          placeholder={action === 'hide' ? 'e.g. belongs to the salt form, not this page' : 'e.g. UK brand'}
          className={FIELD}
          style={SMALL_TEXT}
        />
      </div>

      <p className="font-sans text-sm leading-relaxed text-ink">
        Brand-name changes are structured data, licensed CC0 under the{' '}
        <Link to="/terms" className={LINK}>
          Terms of Use
        </Link>
        . You’ll be credited as @{status.handle}.
      </p>

      {error && (
        <p role="alert" className="rounded-md border border-rose-300 bg-rose-100/40 px-3 py-2 font-sans text-sm text-ink">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={saving}>
          {saving ? 'Saving…' : held ? 'Send for review' : 'Save'}
        </Button>
        <Button size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
