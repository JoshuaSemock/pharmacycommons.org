import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../components/Button'
import { useSession } from '../auth'
import {
  ContributeError,
  MEASUREMENT_TYPES,
  PAGE_KINDS,
  createPage,
  kindLabel,
  slugify,
  subtypeFor,
  suggestPages,
  useContributorStatus,
} from '../contribute'
import type { PageKindOption, PageSuggestion } from '../contribute'
import { HandleSetup } from '../OverviewEditor'
import { formatDrugName } from '../names'
import { entityHref } from '../wiki'

/**
 * /new — create a page (phase 15, docs/user-edits.md §7).
 *
 * The contributor picks what kind of thing the page is about; that decides
 * the PCID block create_page() mints from (drugs → blocks 1–4, clinical
 * concepts → 6, labs → 7, targets → 8, herbals → 9). Classes and lists stay
 * curated. While they type the name, pages with similar names are listed so
 * they link to an existing page instead of making a duplicate; the database
 * refuses exact name/slug matches and (for drugs) a UNII or CAS already on
 * record. `?name=` prefills the name (red links in an Overview point here).
 */

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const LINK = `text-ink underline decoration-hepatica-300 underline-offset-2 hover:decoration-hepatica-600 ${FOCUS}`
const FIELD = 'lp-field block w-full rounded-md px-3 py-2 font-sans text-base leading-relaxed text-ink placeholder:text-ink/60'
const LABEL = 'mb-1.5 block font-sans text-sm font-semibold text-ink'
const H1 = { fontSize: 'var(--text-3xl)', fontFamily: 'var(--font-sans)', lineHeight: 1.15 } as const
const LEGEND = { fontSize: 'var(--text-base)', fontFamily: 'var(--font-sans)', lineHeight: 1.4 } as const
const NAME_MAX = 200
const DESCRIPTION_MAX = 2000
const SUMMARY_MAX = 500

const GROUPS: PageKindOption['group'][] = ['Drugs and supplements', 'Clinical concepts', 'Other']

export default function CreatePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user, loading: sessionLoading } = useSession()
  const [statusKey, setStatusKey] = useState(0)
  const status = useContributorStatus(user ? `${user.id}:${statusKey}` : null, sessionLoading)

  const [kindId, setKindId] = useState('')
  const [measurementType, setMeasurementType] = useState('')
  const [name, setName] = useState(() => (params.get('name') ?? '').slice(0, NAME_MAX))
  const [unii, setUnii] = useState('')
  const [cas, setCas] = useState('')
  const [description, setDescription] = useState('')
  const [summary, setSummary] = useState('Created the page')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<{ message: string; existing: string | null } | null>(null)
  const [similar, setSimilar] = useState<PageSuggestion[]>([])

  const option = PAGE_KINDS.find(k => k.id === kindId) ?? null
  const slug = slugify(name)

  useEffect(() => {
    document.title = 'Create a page · Pharmacy Commons'
  }, [])

  // Pages with similar names, so contributors find the existing page first.
  useEffect(() => {
    const q = name.trim()
    if (q.length < 3) {
      setSimilar([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      suggestPages(q, controller.signal)
        .then(setSimilar)
        .catch(() => setSimilar([]))
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [name])

  const exact = useMemo(
    () => similar.find(s => s.slug === slug || s.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null,
    [similar, slug, name],
  )

  const missing: string[] = []
  if (!option) missing.push('choose what the page is about')
  if (option?.kind === 'measurement' && !measurementType) missing.push('choose the kind of measurement')
  if (!slug) missing.push('give it a name')
  if (!summary.trim()) missing.push('add an edit summary')
  const ready = missing.length === 0 && !exact

  async function submit() {
    if (!option || !ready) return
    setSaving(true)
    setError(null)
    try {
      const created = await createPage({
        kind: option.kind,
        name,
        summary,
        description,
        subtype: subtypeFor(option, measurementType),
        unii: option.identifiers ? unii : '',
        cas: option.identifiers ? cas : '',
      })
      navigate(entityHref(created.entity_type, created.slug))
    } catch (err) {
      if (err instanceof ContributeError) {
        const existing = (err.reason === 'page_exists' || err.reason === 'identifier_exists') && err.detail ? err.detail : null
        setError({
          message: err.reason === 'rate_limited' ? 'You’ve created 20 pages today. Please try again tomorrow.' : err.message,
          existing,
        })
        if (err.reason === 'handle_required') setStatusKey(k => k + 1)
      } else {
        setError({ message: 'The page couldn’t be created. Please try again.', existing: null })
      }
    } finally {
      setSaving(false)
    }
  }

  let body: ReactNode
  switch (status.kind) {
    case 'loading':
      body = <div className="h-32 animate-pulse rounded-md bg-ink/10 motion-reduce:animate-none" aria-busy="true" />
      break
    case 'signed-out':
      body = (
        <p className="font-sans text-base text-ink">
          <Link to="/account" className={LINK}>
            Sign in
          </Link>{' '}
          and verify your NPI to create pages.
        </p>
      )
      break
    case 'unverified':
      body = (
        <p className="font-sans text-base text-ink">
          Creating pages needs a verified NPI.{' '}
          <Link to="/account" className={LINK}>
            Verify on your account page
          </Link>
          , then come back.
        </p>
      )
      break
    case 'blocked':
      body = <p className="font-sans text-base text-ink">Your account can’t create pages right now.</p>
      break
    case 'ready':
      body =
        status.handle === null ? (
          <HandleSetup onDone={() => setStatusKey(k => k + 1)} onCancel={() => navigate(-1)} />
        ) : (
          <form
            className="max-w-2xl space-y-8"
            onSubmit={e => {
              e.preventDefault()
              void submit()
            }}
          >
            <fieldset className="space-y-5">
              <legend className="mb-3 font-semibold text-ink" style={LEGEND}>
                What is the page about?
              </legend>
              {GROUPS.map(group => (
                <div key={group}>
                  <p className="mb-2 font-sans text-sm font-semibold text-ink">{group}</p>
                  <div className="flex flex-wrap gap-2">
                    {PAGE_KINDS.filter(k => k.group === group).map(k => (
                      <label key={k.id} className="relative cursor-pointer">
                        <input
                          type="radio"
                          name="page-kind"
                          value={k.id}
                          checked={kindId === k.id}
                          onChange={() => setKindId(k.id)}
                          className="peer sr-only"
                        />
                        <span className="block rounded-md px-3 py-1.5 font-sans text-sm text-ink shadow-emboss peer-checked:font-medium peer-checked:shadow-deboss peer-focus-visible:ring-2 peer-focus-visible:ring-ink/30">
                          {k.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {option && (
                <p className="font-sans text-sm text-ink" aria-live="polite">
                  {option.label}: {option.hint}.
                </p>
              )}
              {option?.kind === 'measurement' && (
                <div>
                  <p className="mb-2 font-sans text-sm font-semibold text-ink">Kind of measurement</p>
                  <div role="radiogroup" aria-label="Kind of measurement" className="flex flex-wrap gap-2">
                    {MEASUREMENT_TYPES.map(t => (
                      <label key={t} className="relative cursor-pointer">
                        <input
                          type="radio"
                          name="measurement-type"
                          value={t}
                          checked={measurementType === t}
                          onChange={() => setMeasurementType(t)}
                          className="peer sr-only"
                        />
                        <span className="block rounded-md px-3 py-1.5 font-sans text-sm text-ink shadow-emboss peer-checked:font-medium peer-checked:shadow-deboss peer-focus-visible:ring-2 peer-focus-visible:ring-ink/30">
                          {t}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </fieldset>

            <div>
              <label htmlFor="new-name" className={LABEL}>
                Name
              </label>
              <input
                id="new-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={NAME_MAX}
                autoComplete="off"
                placeholder={option ? option.hint.replace(/^e\.g\. /, '') : 'e.g. lactic acidosis'}
                className={FIELD}
              />
              <p className="mt-1 font-sans text-sm text-ink [overflow-wrap:anywhere]">
                {slug ? (
                  <>
                    Address: <span className="font-mono">/drugs/{slug}</span>. Use the generic or most widely used
                    name; brand names and synonyms can be linked from the text.
                  </>
                ) : (
                  'Use the generic or most widely used name.'
                )}
              </p>
              {similar.length > 0 && (
                <div className="lp-sunken mt-3 rounded-md px-4 py-3" aria-live="polite">
                  <p className="font-sans text-sm font-semibold text-ink">
                    {exact ? 'This page already exists:' : 'Is it one of these?'}
                  </p>
                  <ul className="mt-1.5 space-y-1 font-sans text-sm text-ink">
                    {(exact ? [exact] : similar).map(s => (
                      <li key={s.slug}>
                        <Link to={entityHref(s.entityType, s.slug)} className={LINK}>
                          {formatDrugName(s.name)}
                        </Link>{' '}
                        <span>· {kindLabel(s.entityType)}</span>
                      </li>
                    ))}
                  </ul>
                  {exact && (
                    <p className="mt-2 font-sans text-sm text-ink">Edit that page’s Overview instead of creating a second one.</p>
                  )}
                </div>
              )}
            </div>

            {option?.identifiers && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="new-unii" className={LABEL}>
                    UNII <span className="font-normal">(optional)</span>
                  </label>
                  <input
                    id="new-unii"
                    type="text"
                    value={unii}
                    onChange={e => setUnii(e.target.value.toUpperCase())}
                    maxLength={10}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="e.g. 9100L32L2N"
                    className={`${FIELD} font-mono`}
                  />
                </div>
                <div>
                  <label htmlFor="new-cas" className={LABEL}>
                    CAS number <span className="font-normal">(optional)</span>
                  </label>
                  <input
                    id="new-cas"
                    type="text"
                    value={cas}
                    onChange={e => setCas(e.target.value.trim())}
                    maxLength={12}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="e.g. 657-24-9"
                    className={`${FIELD} font-mono`}
                  />
                </div>
                <p className="font-sans text-sm text-ink sm:col-span-2">
                  Either one lets the database catch a drug already on record under another name.
                </p>
              </div>
            )}

            <div>
              <label htmlFor="new-description" className={LABEL}>
                Description <span className="font-normal">(optional, one or two sentences)</span>
              </label>
              <textarea
                id="new-description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                maxLength={DESCRIPTION_MAX}
                className={FIELD}
              />
              <p className="mt-1 font-sans text-sm text-ink">
                You can write the rest of the Overview, with headings and [[links]], once the page exists.
              </p>
            </div>

            <div>
              <label htmlFor="new-summary" className={LABEL}>
                Edit summary <span className="font-normal">(required)</span>
              </label>
              <input
                id="new-summary"
                type="text"
                value={summary}
                onChange={e => setSummary(e.target.value)}
                maxLength={SUMMARY_MAX}
                className={FIELD}
              />
            </div>

            <p className="font-sans text-sm leading-relaxed text-ink">
              Creating a page gives it a permanent PCID that is never reused. By creating it, you agree to license your
              text under{' '}
              <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" className={LINK}>
                CC BY-SA 4.0
              </a>{' '}
              and the page’s name and identifiers under CC0, as set out in the{' '}
              <Link to="/terms" className={LINK}>
                Terms of Use
              </Link>
              . You’ll be credited as @{status.handle}. Don’t include patient information.
            </p>

            {error && (
              <p role="alert" className="rounded-md border border-rose-300 bg-rose-100/40 px-3 py-2 font-sans text-sm text-ink">
                {error.message}
                {error.existing && (
                  <>
                    {' '}
                    <Link to={`/id/PCID-${error.existing}`} className={LINK}>
                      Open the existing page
                    </Link>
                    .
                  </>
                )}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={!ready || saving}>
                {saving ? 'Creating…' : 'Create page'}
              </Button>
              {!ready && missing.length > 0 && (
                <span className="font-sans text-sm text-ink">To continue, {missing.join(', ')}.</span>
              )}
            </div>
          </form>
        )
      break
  }

  return (
    <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <header className="mb-8 border-b border-ink/15 py-6">
        <h1 className="font-semibold text-ink" style={H1}>
          Create a page
        </h1>
        <p className="mt-2 max-w-2xl font-sans text-base leading-relaxed text-ink">
          New pages for drugs, supplements, herbals, conditions, symptoms, adverse effects, labs and targets. Search
          first: most drugs already have a page you can add to.
        </p>
      </header>
      {body}
    </main>
  )
}
