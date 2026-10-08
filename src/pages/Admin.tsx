import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button'
import { useSession } from '../auth'
import { suggestPages, kindLabel } from '../contribute'
import type { PageSuggestion } from '../contribute'
import {
  PROTECTION_LABEL,
  adminErrorMessage,
  blockContributor,
  findContributors,
  getProtectedPages,
  grantRole,
  isAdmin,
  revokeRole,
  setPageProtection,
  unblockContributor,
} from '../contributions'
import type { AdminContributor, Protection, ProtectedPage, Role } from '../contributions'
import { formatDrugName } from '../names'
import { entityHref } from '../wiki'

/**
 * /admin — contributors and page protection (phase 15g, docs/user-edits.md §9).
 *
 * Admins only; every action is an RPC that checks has_role('admin') itself.
 * Contributors are found by handle and shown with their credential badge,
 * NPI state, roles, block and activity, never their NPI, email or name.
 * Protection: 'reviewed' holds edits from non-reviewers for review (the 44
 * high-alert/NTI moieties and their hierarchy start there), 'patrollers'
 * locks a page to reviewers.
 */

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const LINK = `text-ink underline decoration-hepatica-300 underline-offset-2 hover:decoration-hepatica-600 ${FOCUS}`
const FIELD = 'lp-field block w-full rounded-md px-3 py-2 font-sans text-base text-ink placeholder:text-ink/60'
const H1 = { fontSize: 'var(--text-3xl)', fontFamily: 'var(--font-sans)', lineHeight: 1.15 } as const
const H2 = { fontSize: 'var(--text-xl)', fontFamily: 'var(--font-sans)', lineHeight: 1.25 } as const
const CHIP =
  'block rounded-md px-3 py-1 font-sans text-sm text-ink lp-chip peer-focus-visible:ring-2 peer-focus-visible:ring-ink/30'

export default function Admin() {
  const { user, loading } = useSession()
  const [admin, setAdmin] = useState<boolean | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Admin · Pharmacy Commons'
  }, [])

  useEffect(() => {
    if (loading) return
    if (!user) {
      setAdmin(false)
      return
    }
    let cancelled = false
    isAdmin().then(a => {
      if (!cancelled) setAdmin(a)
    })
    return () => {
      cancelled = true
    }
  }, [user, loading])

  return (
    <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <header className="mb-8 border-b border-ink/15 py-6">
        <h1 className="font-semibold text-ink" style={H1}>
          Admin
        </h1>
        <p className="mt-2 max-w-2xl font-sans text-base leading-relaxed text-ink">
          Contributor roles and blocks, and which pages hold edits for review. Edits themselves are checked in the{' '}
          <Link to="/review" className={LINK}>
            review queue
          </Link>
          .
        </p>
      </header>

      {notice && (
        <p role="status" className="mb-6 max-w-3xl rounded-md border border-sky-300 bg-sky-100/40 px-3 py-2 font-sans text-sm text-ink">
          {notice}
        </p>
      )}

      {admin === null ? (
        <div className="h-32 animate-pulse rounded-md bg-ink/10 motion-reduce:animate-none" aria-busy="true" />
      ) : !admin ? (
        <p className="font-sans text-base text-ink">
          This page is for Pharmacy Commons admins.{' '}
          {!user && (
            <Link to="/account" className={LINK}>
              Sign in
            </Link>
          )}
        </p>
      ) : (
        <div className="space-y-14">
          <Contributors selfId={user?.id ?? null} onNotice={setNotice} />
          <ProtectionSection onNotice={setNotice} />
        </div>
      )}
    </main>
  )
}

// ─── Contributors ─────────────────────────────────────────────────────────────

function Contributors({ selfId, onNotice }: { selfId: string | null; onNotice: (m: string) => void }) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<AdminContributor[] | 'loading' | 'failed'>('loading')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      findContributors(query)
        .then(r => {
          if (!cancelled) setRows(r)
        })
        .catch(() => {
          if (!cancelled) setRows('failed')
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, version])

  return (
    <section aria-labelledby="contributors-heading" className="space-y-4">
      <h2 id="contributors-heading" className="font-semibold text-ink" style={H2}>
        Contributors
      </h2>
      <div className="max-w-md">
        <label htmlFor="admin-handle" className="mb-1.5 block font-sans text-sm font-semibold text-ink">
          Find by handle
        </label>
        <input
          id="admin-handle"
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Most recently active first"
          autoComplete="off"
          className={FIELD}
        />
      </div>
      {rows === 'loading' ? (
        <div className="h-20 animate-pulse rounded-md bg-ink/10 motion-reduce:animate-none" aria-busy="true" />
      ) : rows === 'failed' ? (
        <p className="font-sans text-base text-ink">Contributors couldn’t be loaded right now.</p>
      ) : rows.length === 0 ? (
        <p className="font-sans text-base text-ink">No contributors match.</p>
      ) : (
        <ol className="lp-divide-y max-w-4xl">
          {rows.map(c => (
            <ContributorRow
              key={c.user_id}
              c={c}
              self={c.user_id === selfId}
              onDone={m => {
                onNotice(m)
                setVersion(v => v + 1)
              }}
            />
          ))}
        </ol>
      )}
    </section>
  )
}

type BlockLength = '1' | '7' | '30' | 'none'
const BLOCK_LENGTHS: { key: BlockLength; label: string }[] = [
  { key: '1', label: '1 day' },
  { key: '7', label: '7 days' },
  { key: '30', label: '30 days' },
  { key: 'none', label: 'Until lifted' },
]

function ContributorRow({ c, self, onDone }: { c: AdminContributor; self: boolean; onDone: (message: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [panel, setPanel] = useState<'none' | 'block' | 'admin'>('none')
  const [reason, setReason] = useState('')
  const [length, setLength] = useState<BlockLength>('7')

  async function run(action: () => Promise<void>, message: string) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setPanel('none')
      setReason('')
      onDone(message)
    } catch (err) {
      setError(adminErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const has = (r: Role) => c.roles.includes(r)
  const toggle = (r: Role, label: string) =>
    has(r)
      ? run(() => revokeRole(c.user_id, r), `@${c.handle} is no longer ${label}.`)
      : run(() => grantRole(c.user_id, r), `@${c.handle} is now ${label}.`)

  return (
    <li className="space-y-2 py-3 font-sans text-sm text-ink">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="min-w-0 text-base font-medium [overflow-wrap:anywhere]">
          @{c.handle}
          {c.credential && <span className="font-normal"> · {c.credential}</span>}
        </span>
        <span>
          {[
            has('admin') ? 'Admin' : has('patroller') ? 'Reviewer' : null,
            c.verified ? 'NPI verified' : 'NPI not active',
            c.blocked ? 'Blocked' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <p>
        {c.edits} {c.edits === 1 ? 'contribution' : 'contributions'}
        {c.last_edit_at && <> · last {new Date(c.last_edit_at).toLocaleDateString()}</>}
        {c.blocked && (
          <>
            {' '}
            · blocked: <span className="italic">{c.block_reason}</span>
            {c.block_expires_at ? `, until ${new Date(c.block_expires_at).toLocaleDateString()}` : ', until lifted'}
          </>
        )}
      </p>
      {self ? (
        <p>This is you. Your own roles and blocks can only be changed by another admin.</p>
      ) : (
      <div className="flex flex-wrap gap-2">
        {!has('admin') && (
          <Button size="sm" disabled={busy || (!c.verified && !has('patroller'))} onClick={() => void toggle('patroller', 'a reviewer')}>
            {has('patroller') ? 'Remove reviewer' : 'Make reviewer'}
          </Button>
        )}
        {has('admin') ? (
          <Button size="sm" disabled={busy} onClick={() => void toggle('admin', 'an admin')}>
            Remove admin
          </Button>
        ) : (
          <Button size="sm" disabled={busy || !c.verified} onClick={() => setPanel(p => (p === 'admin' ? 'none' : 'admin'))}>
            Make admin…
          </Button>
        )}
        {c.blocked ? (
          <Button size="sm" disabled={busy} onClick={() => void run(() => unblockContributor(c.user_id), `@${c.handle} can edit again.`)}>
            Lift block
          </Button>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => setPanel(p => (p === 'block' ? 'none' : 'block'))}>
            Block…
          </Button>
        )}
      </div>
      )}

      {panel === 'admin' && (
        <div className="max-w-xl space-y-2 pt-1">
          <p>
            Admins can change roles, block contributors and protect pages, including removing other admins. Make
            @{c.handle} an admin?
          </p>
          <span className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void toggle('admin', 'an admin')}>
              Make admin
            </Button>
            <Button size="sm" onClick={() => setPanel('none')}>
              Cancel
            </Button>
          </span>
        </div>
      )}

      {panel === 'block' && (
        <form
          className="max-w-xl space-y-3 pt-1"
          onSubmit={e => {
            e.preventDefault()
            if (!reason.trim()) return
            const days = length === 'none' ? null : Number(length)
            void run(() => blockContributor(c.user_id, reason.trim(), days), `@${c.handle} is blocked from editing.`)
          }}
        >
          <div>
            <label htmlFor={`block-${c.user_id}`} className="mb-1.5 block text-sm font-semibold">
              Reason (kept with the block)
            </label>
            <input
              id={`block-${c.user_id}`}
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              maxLength={500}
              className={FIELD}
            />
          </div>
          <div role="radiogroup" aria-label="Block length" className="flex flex-wrap gap-1.5">
            {BLOCK_LENGTHS.map(b => (
              <label key={b.key} className="relative cursor-pointer">
                <input
                  type="radio"
                  name={`block-length-${c.user_id}`}
                  checked={length === b.key}
                  onChange={() => setLength(b.key)}
                  className="peer sr-only"
                />
                <span className={CHIP}>{b.label}</span>
              </label>
            ))}
          </div>
          <span className="flex gap-2">
            <Button size="sm" type="submit" disabled={busy || !reason.trim()}>
              Block
            </Button>
            <Button size="sm" onClick={() => setPanel('none')}>
              Cancel
            </Button>
          </span>
        </form>
      )}

      {error && (
        <p role="alert" className="max-w-xl rounded-md border border-rose-300 bg-rose-100/40 px-3 py-2">
          {error}
        </p>
      )}
    </li>
  )
}

// ─── Page protection ──────────────────────────────────────────────────────────

const LEVELS: Protection[] = ['open', 'reviewed', 'patrollers']

function LevelPicker({ name, value, onChange }: { name: string; value: Protection; onChange: (p: Protection) => void }) {
  return (
    <div role="radiogroup" aria-label="Protection" className="flex flex-wrap gap-1.5">
      {LEVELS.map(l => (
        <label key={l} className="relative cursor-pointer">
          <input type="radio" name={name} checked={value === l} onChange={() => onChange(l)} className="peer sr-only" />
          <span className={CHIP}>{PROTECTION_LABEL[l]}</span>
        </label>
      ))}
    </div>
  )
}

function pageName(name: string, entityType: string): string {
  return ['moiety', 'precise_form', 'combination'].includes(entityType) ? formatDrugName(name) : name
}

function ProtectionSection({ onNotice }: { onNotice: (m: string) => void }) {
  const [pages, setPages] = useState<ProtectedPage[] | 'loading' | 'failed'>('loading')
  const [version, setVersion] = useState(0)
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getProtectedPages()
      .then(r => {
        if (!cancelled) setPages(r)
      })
      .catch(() => {
        if (!cancelled) setPages('failed')
      })
    return () => {
      cancelled = true
    }
  }, [version])

  async function save(pcid: number, level: Protection, label: string) {
    setBusy(true)
    setError(null)
    try {
      await setPageProtection(pcid, level)
      setEditing(null)
      onNotice(`${label}: ${PROTECTION_LABEL[level].split(':')[0].toLowerCase()}.`)
      setVersion(v => v + 1)
    } catch (err) {
      setError(adminErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const shown = useMemo(() => {
    if (!Array.isArray(pages)) return []
    const q = filter.trim().toLowerCase()
    return q ? pages.filter(p => p.name.toLowerCase().includes(q)) : pages
  }, [pages, filter])

  return (
    <section aria-labelledby="protection-heading" className="space-y-4">
      <h2 id="protection-heading" className="font-semibold text-ink" style={H2}>
        Page protection
      </h2>
      <p className="max-w-2xl font-sans text-sm leading-relaxed text-ink">
        Pages are open unless listed here. A protection level covers the page’s Overview and Quick Facts; it does
        not carry over to its salt forms or brands, so protect those separately.
      </p>

      <AddProtection busy={busy} onSave={(pcid, level, label) => void save(pcid, level, label)} />

      {error && (
        <p role="alert" className="max-w-xl rounded-md border border-rose-300 bg-rose-100/40 px-3 py-2 font-sans text-sm text-ink">
          {error}
        </p>
      )}

      {pages === 'loading' ? (
        <div className="h-20 animate-pulse rounded-md bg-ink/10 motion-reduce:animate-none" aria-busy="true" />
      ) : pages === 'failed' ? (
        <p className="font-sans text-base text-ink">Protected pages couldn’t be loaded right now.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="font-sans text-sm text-ink">
              {pages.filter(p => p.protection === 'reviewed').length} reviewed ·{' '}
              {pages.filter(p => p.protection === 'patrollers').length} locked
            </p>
            <div className="w-full max-w-xs">
              <label htmlFor="protected-filter" className="sr-only">
                Filter protected pages
              </label>
              <input
                id="protected-filter"
                type="search"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter by name"
                className={FIELD}
              />
            </div>
          </div>
          <ol className="lp-divide-y max-w-4xl">
            {shown.map(p => {
              const label = pageName(p.name, p.entityType)
              return (
                <li key={p.pcid} className="space-y-2 py-2.5 font-sans text-sm text-ink">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      <Link to={entityHref(p.entityType, p.slug)} className="lp-press inline-block rounded-md px-2 py-0.5 text-base">
                        {label}
                      </Link>{' '}
                      · {kindLabel(p.entityType)}
                    </span>
                    <span className="flex items-baseline gap-3">
                      <span>{p.protection === 'reviewed' ? 'Reviewed' : 'Locked'}</span>
                      <button
                        type="button"
                        aria-expanded={editing === p.pcid}
                        onClick={() => setEditing(e => (e === p.pcid ? null : p.pcid))}
                        className={`underline underline-offset-2 ${FOCUS}`}
                      >
                        Change
                      </button>
                    </span>
                  </div>
                  {editing === p.pcid && (
                    <LevelPicker name={`level-${p.pcid}`} value={p.protection} onChange={l => void save(p.pcid, l, label)} />
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </section>
  )
}

function AddProtection({ busy, onSave }: { busy: boolean; onSave: (pcid: number, level: Protection, label: string) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PageSuggestion[]>([])
  const [picked, setPicked] = useState<{ pcid: number; label: string } | null>(null)
  const [level, setLevel] = useState<Protection>('reviewed')

  useEffect(() => {
    if (picked || query.trim().length < 2) {
      setResults([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      suggestPages(query, controller.signal)
        .then(setResults)
        .catch(() => setResults([]))
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, picked])

  function pick(s: PageSuggestion) {
    if (s.pcid) setPicked({ pcid: s.pcid, label: pageName(s.name, s.entityType) })
  }

  let body: ReactNode
  if (picked) {
    body = (
      <div className="space-y-3">
        <p className="font-sans text-sm text-ink">
          <span className="font-medium">{picked.label}</span> ·{' '}
          <button type="button" onClick={() => setPicked(null)} className={`underline underline-offset-2 ${FOCUS}`}>
            choose another
          </button>
        </p>
        <LevelPicker name="add-level" value={level} onChange={setLevel} />
        <Button size="sm" disabled={busy} onClick={() => onSave(picked.pcid, level, picked.label)}>
          Save
        </Button>
      </div>
    )
  } else {
    body = (
      <div className="max-w-md">
        <label htmlFor="protect-page" className="mb-1.5 block font-sans text-sm font-semibold text-ink">
          Protect or open a page
        </label>
        <input
          id="protect-page"
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Page name"
          autoComplete="off"
          className={FIELD}
        />
        {results.length > 0 && (
          <ul className="lp-sunken mt-2 grid gap-1.5 rounded-md p-2">
            {results.map(s => (
              <li key={s.slug}>
                <button type="button" onClick={() => pick(s)} className={`lp-press w-full rounded-md px-2.5 py-1 text-left font-sans text-sm text-ink ${FOCUS}`}>
                  {pageName(s.name, s.entityType)} <span>· {kindLabel(s.entityType)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return <div className="lp-raised max-w-2xl rounded-md p-4">{body}</div>
}
