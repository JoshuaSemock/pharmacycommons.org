import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import { entityHref, linkKey, newPageHref, propertyKey, remarkWiki } from '../wiki'
import type { LinkedPage, PropertyValue } from '../pageContent'

/**
 * Renders community-written page text (phase 15, docs/user-edits.md).
 *
 * Markdown (CommonMark + GFM tables/lists/strikethrough) plus:
 *   [[target]] / [[target|text]]  → a link to the page the database resolved,
 *                                   or a "no page yet" red link
 *   {{key}} / {{key:target}}      → a live value chip from resolve_property()
 *
 * Headings get anchor ids (rehype-slug, prefixed section-) so sections can be
 * linked: /drugs/metformin#section-renal-dosing.
 *
 * Safety: no raw HTML (no rehype-raw), images render as their alt text only
 * (images are off in v1), and outside links open with rel="nofollow ugc
 * noopener". Headings are demoted one level so a contributor's "##" sits
 * under the section's own h2.
 *
 * `links` and `properties` come from usePageContent(); they are what the
 * database stored when the text was saved, so names are never re-resolved
 * here. A link or value missing from them (unsaved text, unknown key)
 * renders as plain text.
 */

const BODY = 'font-sans text-base leading-[1.7] text-ink'

/** Contributor headings get ids like #section-renal-dosing, so a section can be linked to. */
export const SECTION_ID_PREFIX = 'section-'
const LINK =
  'text-ink underline decoration-hepatica-300 underline-offset-2 hover:decoration-hepatica-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const HEADING = { fontFamily: 'var(--font-sans)', lineHeight: 1.3 } as const

type Props = {
  source: string
  links: Map<string, LinkedPage | null>
  properties: Map<string, PropertyValue>
  /** Opens the FDA label on this page (for {{dosing}} and other label-derived values). */
  labelAnchor?: string
}

export default function WikiMarkdown({ source, links, properties, labelAnchor }: Props) {
  const components: Components = {
    h1: ({ id, children }) => (
      <h3 id={id} className="pt-4 font-sans font-semibold text-ink" style={{ ...HEADING, fontSize: 'var(--text-lg)' }}>
        {children}
      </h3>
    ),
    h2: ({ id, children }) => (
      <h3 id={id} className="pt-4 font-sans font-semibold text-ink" style={{ ...HEADING, fontSize: 'var(--text-lg)' }}>
        {children}
      </h3>
    ),
    h3: ({ id, children }) => (
      <h4 id={id} className="pt-3 font-sans font-semibold text-ink" style={{ ...HEADING, fontSize: 'var(--text-base)' }}>
        {children}
      </h4>
    ),
    h4: ({ id, children }) => (
      <h5 id={id} className="pt-2 font-sans font-medium text-ink" style={{ ...HEADING, fontSize: 'var(--text-base)' }}>
        {children}
      </h5>
    ),
    h5: ({ id, children }) => <p id={id} className={`${BODY} font-medium`}>{children}</p>,
    h6: ({ id, children }) => <p id={id} className={`${BODY} font-medium`}>{children}</p>,
    p: ({ children }) => <p className={BODY}>{children}</p>,
    a: ({ href, children }) => <OutsideOrInternalLink href={href}>{children}</OutsideOrInternalLink>,
    strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    del: ({ children }) => <del className="text-ink line-through">{children}</del>,
    ul: ({ children }) => <ul className={`list-disc space-y-2 pl-5 marker:text-ink ${BODY}`}>{children}</ul>,
    ol: ({ children }) => <ol className={`list-decimal space-y-2 pl-5 marker:text-ink ${BODY}`}>{children}</ol>,
    li: ({ children }) => <li className="pl-1 [&>ol]:mt-2 [&>ul]:mt-2">{children}</li>,
    blockquote: ({ children }) => <blockquote className="border-l-2 border-ink/25 pl-4 italic [&_p]:italic">{children}</blockquote>,
    pre: ({ children }) => (
      <pre className="lp-sunken overflow-x-auto rounded-md p-4 font-mono text-sm leading-relaxed text-ink [&_code]:bg-transparent [&_code]:p-0">
        {children}
      </pre>
    ),
    code: ({ children }) => <code className="rounded bg-mint-100 px-1 py-0.5 font-mono text-[0.88em] text-ink">{children}</code>,
    hr: () => <hr className="my-2 border-ink/15" />,
    table: ({ children }) => (
      <div className="overflow-x-auto border-y border-ink/15">
        <table className="w-full border-collapse font-sans text-sm">{children}</table>
      </div>
    ),
    tr: ({ children }) => <tr className="border-b border-ink/15 last:border-0">{children}</tr>,
    th: ({ children }) => <th className="px-3 py-2 text-left font-semibold text-ink">{children}</th>,
    td: ({ children }) => <td className="px-3 py-2 align-top text-ink">{children}</td>,
    img: ({ alt }) => (alt ? <span className="italic">[{alt}]</span> : null),
    span: ({ node: _node, children, ...props }) => {
      const data = props as Record<string, unknown>
      const link = data['data-pc-link']
      if (typeof link === 'string') return <WikiLink target={link} links={links}>{children}</WikiLink>
      const prop = data['data-pc-prop']
      if (typeof prop === 'string') {
        const target = typeof data['data-pc-target'] === 'string' ? (data['data-pc-target'] as string) : ''
        const value = properties.get(propertyKey(prop, target))
        return value ? <PropertyChip value={value} labelAnchor={labelAnchor} /> : <span>{children}</span>
      }
      return <span>{children}</span>
    },
  }

  return (
    <div className="space-y-4">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkWiki]} rehypePlugins={[[rehypeSlug, { prefix: SECTION_ID_PREFIX }]]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  )
}

function OutsideOrInternalLink({ href, children }: { href?: string; children?: ReactNode }) {
  if (href && href.startsWith('/') && !href.startsWith('//')) {
    return (
      <Link to={href} className={LINK}>
        {children}
      </Link>
    )
  }
  if (href && href.startsWith('#')) {
    return (
      <a href={href} className={LINK}>
        {children}
      </a>
    )
  }
  return (
    <a href={href} target="_blank" rel="nofollow ugc noopener noreferrer" className={LINK}>
      {children}
    </a>
  )
}

function WikiLink({
  target,
  links,
  children,
}: {
  target: string
  links: Map<string, LinkedPage | null>
  children?: ReactNode
}) {
  const page = links.get(linkKey(target))
  if (page) {
    return (
      <Link to={entityHref(page.entityType, page.slug)} className={LINK} title={page.name}>
        {children}
      </Link>
    )
  }
  // Red link: saved but no page matches yet. It offers to create the page
  // (/new checks sign-in and verification). Unsaved text in a preview stays plain.
  if (page === null) {
    return (
      <Link
        to={newPageHref(target)}
        className="underline decoration-ink/40 decoration-dashed underline-offset-2 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40"
        title={`No page for “${target}” yet. Create it`}
      >
        {children}
      </Link>
    )
  }
  return (
    <span
      className="underline decoration-ink/40 decoration-dashed underline-offset-2"
      title={page === null ? `No page for “${target}” yet` : target}
    >
      {children}
    </span>
  )
}

function PropertyChip({ value, labelAnchor }: { value: PropertyValue; labelAnchor?: string }) {
  const chip = 'lp-sunken rounded px-1.5 py-0.5 font-sans text-[0.94em] text-ink'
  const on = value.target ? ` (${value.target.name})` : ''

  // Label- and class-derived values aren't stored as one value; point to where they are.
  if (value.resolve === 'client') {
    const text = value.origin === 'label' ? `see FDA label: ${value.label.toLowerCase()}` : `see ${value.label}`
    if (value.target) {
      return (
        <Link to={entityHref(value.target.entityType, value.target.slug)} className={LINK}>
          {text}
          {on}
        </Link>
      )
    }
    return labelAnchor && value.origin === 'label' ? (
      <a href={`#${labelAnchor}`} className={LINK}>
        {text}
      </a>
    ) : (
      <span>{text}</span>
    )
  }

  const shown = value.value ?? 'not recorded'
  const source =
    value.origin === 'community'
      ? `${value.label}${on}: community value. Source: ${value.citation ?? 'not given'}`
      : value.origin === 'list'
        ? `${value.label}${on}, from the list “${value.list_slug ?? ''}”`
        : `${value.label}${on}`

  const inner = (
    <span className={chip} title={source}>
      {shown}
      {value.target && <span className="sr-only">{on}</span>}
    </span>
  )
  return value.origin === 'list' && value.list_slug && value.value !== null ? (
    <Link to={`/lists/${value.list_slug}`} className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40">
      {inner}
    </Link>
  ) : (
    inner
  )
}
