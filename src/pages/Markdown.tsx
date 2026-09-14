import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'

/**
 * Markdown rendering for blog posts.
 *
 * remark-gfm adds tables, strikethrough, task lists, footnotes, and autolinks
 * on top of CommonMark. rehype-slug puts ids on headings so posts can be deep
 * linked (/blog/some-post#the-section).
 *
 * Raw HTML in markdown is NOT enabled — no rehype-raw. Posts are authored in
 * the repo, but leaving HTML off keeps the door shut in case post bodies ever
 * come from the revisions queue rather than from git.
 *
 * Every element below is mapped explicitly to project tokens. There is no
 * prose/typography plugin in the stack, so unmapped elements fall back to
 * browser defaults and will look wrong — add a mapping rather than a global
 * stylesheet.
 */

/** Lets the `code` mapping tell fenced blocks apart from inline spans. */
const InsidePre = createContext(false)

function CodeBlockWrapper({ children }: { children?: ReactNode }) {
  return (
    <InsidePre.Provider value={true}>
      <pre className="overflow-x-auto rounded-lg border border-sage-200 bg-white/70 p-4 font-mono text-[12.5px] leading-relaxed text-sage-800">
        {children}
      </pre>
    </InsidePre.Provider>
  )
}

function CodeSpan({ children }: { children?: ReactNode }) {
  const insidePre = useContext(InsidePre)
  if (insidePre) return <code>{children}</code>
  return (
    <code className="rounded bg-sage-100 px-1 py-0.5 font-mono text-[0.9em] text-sage-800">
      {children}
    </code>
  )
}

function Anchor({ href, children }: { href?: string; children?: ReactNode }) {
  const className =
    'text-aqua-700 underline decoration-aqua-300 underline-offset-2 hover:decoration-aqua-600'

  // Internal route — keep it a client-side navigation.
  if (href && href.startsWith('/')) {
    return (
      <Link to={href} className={className}>
        {children}
      </Link>
    )
  }

  // Same-page fragment.
  if (href && href.startsWith('#')) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    )
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  )
}

const components: Components = {
  h1: ({ children, ...props }) => (
    <h2
      {...props}
      className="pt-4 font-display text-[24px] font-semibold text-sage-900"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {children}
    </h2>
  ),
  h2: ({ children, ...props }) => (
    <h2
      {...props}
      className="scroll-mt-28 pt-4 font-display text-[21px] font-semibold text-sage-900"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3
      {...props}
      className="scroll-mt-28 pt-3 font-display text-[17px] font-semibold text-sage-900"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4
      {...props}
      className="scroll-mt-28 pt-2 font-sans text-[15px] font-medium text-sage-900"
    >
      {children}
    </h4>
  ),

  p: ({ children }) => (
    <p className="font-sans text-[15px] leading-relaxed text-sage-700">{children}</p>
  ),

  a: ({ href, children }) => <Anchor href={href}>{children}</Anchor>,

  strong: ({ children }) => <strong className="font-medium text-sage-900">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => (
    <del className="text-sage-600 line-through decoration-sage-400">{children}</del>
  ),

  ul: ({ children }) => (
    <ul className="list-disc space-y-2 pl-5 font-sans text-[15px] leading-relaxed text-sage-700 marker:text-sage-400">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal space-y-2 pl-5 font-sans text-[15px] leading-relaxed text-sage-700 marker:text-sage-400">
      {children}
    </ol>
  ),
  // Nested lists need their own margin; the outer space-y does not reach them.
  li: ({ children }) => <li className="[&>ul]:mt-2 [&>ol]:mt-2 [&>ul]:mb-1 [&>ol]:mb-1">{children}</li>,

  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-aqua-300 pl-4 font-sans text-[15px] italic leading-relaxed text-sage-600 [&>p]:text-sage-600">
      {children}
    </blockquote>
  ),

  pre: ({ children }) => <CodeBlockWrapper>{children}</CodeBlockWrapper>,
  code: ({ children }) => <CodeSpan>{children}</CodeSpan>,

  hr: () => <hr className="border-sage-200" />,

  table: ({ children }) => (
    <div className="overflow-x-auto rounded-lg border border-sage-200 bg-white/70">
      <table className="w-full border-collapse font-sans text-[13.5px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-sage-100">{children}</thead>,
  tr: ({ children }) => <tr className="border-b border-sage-200 last:border-0">{children}</tr>,
  th: ({ children, ...props }) => (
    <th
      {...props}
      className="px-3 py-2 text-left font-medium text-sage-900"
      style={{ textAlign: (props.style?.textAlign as 'left' | 'center' | 'right') ?? 'left' }}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td {...props} className="px-3 py-2 align-top text-sage-700">
      {children}
    </td>
  ),

  img: ({ src, alt }) => (
    <figure className="space-y-2">
      <img
        src={typeof src === 'string' ? src : undefined}
        alt={alt ?? ''}
        loading="lazy"
        className="w-full rounded-lg border border-sage-200"
      />
      {alt && (
        <figcaption className="font-sans text-[12.5px] text-sage-600">{alt}</figcaption>
      )}
    </figure>
  ),

  // GFM task list checkboxes.
  input: ({ type, checked, disabled }) =>
    type === 'checkbox' ? (
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        readOnly
        className="mr-1.5 align-middle accent-aqua-600"
      />
    ) : null,

  // Footnote section produced by remark-gfm.
  section: ({ children, ...props }) => {
    const isFootnotes = (props as { 'data-footnotes'?: boolean })['data-footnotes']
    return isFootnotes ? (
      <section className="border-t border-sage-200 pt-6 font-sans text-[13px] text-sage-600 [&_h2]:text-[15px] [&_ol]:text-[13px]">
        {children}
      </section>
    ) : (
      <section>{children}</section>
    )
  },
}

export default function Markdown({ source }: { source: string }) {
  return (
    <div className="space-y-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
