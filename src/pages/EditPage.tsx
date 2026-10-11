import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getDrugBySlug } from '../api'
import type { DrugDetail } from '../api.generated'
import { isConceptKind } from '../concepts'
import { formatDrugName } from '../names'
import PageEditor from '../pageEditor/PageEditor'
import { publishedNotice, useEditAccess } from '../pageEditor/access'

/**
 * /drugs/:slug/edit — the whole page in the full-page editor
 * (docs/page-editor.md §4: "Edit page"). Section edits open in place on the
 * page itself; this route is for adding, removing and reordering sections.
 */

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const LINK = `text-ink underline decoration-hepatica-300 underline-offset-2 hover:decoration-hepatica-600 ${FOCUS}`

export default function EditPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [drug, setDrug] = useState<DrugDetail | null | 'missing'>(null)
  const access = useEditAccess()

  useEffect(() => {
    if (!slug) return
    const controller = new AbortController()
    getDrugBySlug(slug, { signal: controller.signal })
      .then(d => setDrug(d ?? 'missing'))
      .catch(() => !controller.signal.aborted && setDrug('missing'))
    return () => controller.abort()
  }, [slug])

  const name = drug && drug !== 'missing' ? (isConceptKind(drug.block_kind) ? drug.name.trim() : formatDrugName(drug.name)) : ''
  useEffect(() => {
    document.title = name ? `Editing ${name} · Pharmacy Commons` : 'Pharmacy Commons'
  }, [name])

  if (drug === null || access.status.kind === 'loading') return <div className="flex justify-center py-32 font-sans text-ink">Loading…</div>
  if (drug === 'missing') return <Message>That page doesn’t exist.</Message>

  const back = `/drugs/${drug.slug}`
  const s = access.status
  if (s.kind === 'signed-out') return <Message>
      <Link to="/account" className={LINK}>Sign in</Link> with a verified NPI to edit pages.
    </Message>
  if (s.kind === 'unverified') return <Message>
      Editing needs a verified NPI. <Link to="/account" className={LINK}>Verify yours on your Account page</Link>.
    </Message>
  if (s.kind === 'blocked') return <Message>Your account can’t edit pages right now.</Message>

  return (
    <div className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 py-4 font-sans text-sm text-ink">
        <Link to={back} className={`lp-press inline-flex items-center rounded-md px-2 py-0.5 ${FOCUS}`}>
          {name}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-ink">Edit page</span>
      </nav>
      <h1 className="mb-6 font-sans font-semibold leading-tight text-ink">Editing {name}</h1>
      <PageEditor
        pcid={Number(drug.pcid_code.replace(/^PCID-/, ''))}
        name={name}
        status={s}
        onHandleSet={access.refresh}
        onClose={() => navigate(back)}
        onPublished={r => navigate(back, { state: { notice: publishedNotice(r.status) } })}
      />
    </div>
  )
}

function Message({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-page px-4 py-24 text-center font-sans text-base text-ink sm:px-6">{children}</div>
}
