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
 * linked (/blog/some-post#the-section) and so the "On this page" rail can find
 * them.
 *
 * Raw HTML in markdown is NOT enabled — no rehype-raw. Posts are authored in
 * the repo, but leaving HTML off keeps the door shut in case post bodies ever
 * come from the revisions queue rather than from git.
 *
 * Every element below is mapped explicitly to project tokens. There is no
 * prose/typography plugin in the stack, so unmapped elements fall back to
 * browser defaults and will look wrong — add a mapping rather than a global
 * stylesheet.
 *
 * react-markdown passes the hast `node` to every component. It is destructured
 * out below before spreading props, otherwise React writes node="[object Object]"
 * onto the DOM element.
 *
 * Type scale: body on text-base (16px), h4 on text-base, h3 on text-xl (phi^1,
 * 25.89px), h2 on text-2xl (phi^1.5, 32.93px). Sizes come from the site-wide
 * --text-* tokens in index.css rather than being hardcoded here, so tuning the
 * ratio there updates this page too.
 */

const BODY = 'font-sans text-base leading-[1.7] text-sage-700'

/** Lets the `code` mapping tell fenced blocks apart from inline spans. */
const InsidePre = createContext(false)

/** Lets paragraphs inside a blockquote take the quote's type instead of body type. */
const InsideQuote = createContext(false)

function Paragraph({ children }: { children?: ReactNode }) {
  const insideQuote = useContext(InsideQuote)
  return <p className={insideQuote ? undefined : BODY}>{children}</p>
}

function CodeBlockWrapper({ children }: { children?: ReactNode }) {
  return (
    <InsidePre.Provider value={true}>
      <pre className="overflow-x-auto rounded-lg border border-sage-200 bg-white/70 p-4 font-mono text-sm leading-relaxed text-sage-800">
        {children}
      </pre>
    </InsidePre.Provider>
  )
}

function CodeSpan({ children }: { children?: ReactNode }) {
  const insidePre = useContext(InsidePre)
  if (insidePre) return <code>{children}</code>
  return (
    <code className="rounded bg-sage-100 px-1 py-0.5 font-mono text-[0.88em] text-sage-800">
      {children}
    </code>
  )
}

function Anchor({ href, children }: { href?: string; children?: ReactNode }) {
  const className =
    'text-aqua-700 underline decoration-aqua-300 underline-offset-2 hover:decoration-aqua-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-500'

  // Internal route — keep it a client-side navigation.
  if (href && href.startsWith('/')) {
    return (
      <Link to={href} className={className}>
        {children}
      </Link>
    )
  }

  // Same-page fragment. PageFrame picks up the hash change and corrects the
  // scroll position for the sticky nav.
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
  // A post's title is already the page h1; demote any h1 in the body.
  h1: ({ node: _node, children, ...props }) => (
    <h2
      {...props}
      className="scroll-mt-32 pt-6 font-display text-2xl font-semibold leading-tight text-sage-900"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {children}
    </h2>
  ),
  h2: ({ node: _node, children, ...props }) => (
    <h2
      {...props}
      className="scroll-mt-32 pt-6 font-display text-xl font-semibold leading-snug text-sage-900"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {children}
    </h2>
  ),
  h3: ({ node: _node, children, ...props }) => (
    <h3
      {...props}
      className="scroll-mt-32 pt-3 font-display text-lg font-semibold leading-snug text-sage-900"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {children}
    </h3>
  ),
  h4: ({ node: _node, children, ...props }) => (
    <h4
      {...props}
      className="scroll-mt-32 pt-2 font-sans text-base font-medium text-sage-900"
    >
      {children}
    </h4>
  ),

  p: ({ children }) => <Paragraph>{children}</Paragraph>,

  a: ({ href, children }) => <Anchor href={href}>{children}</Anchor>,

  strong: ({ children }) => <strong className="font-medium text-sage-900">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => (
    <del className="text-sage-600 line-through decoration-sage-400">{children}</del>
  ),

  ul: ({ children }) => (
    <ul className={`list-disc space-y-3 pl-5 marker:text-sage-400 ${BODY}`}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className={`list-decimal space-y-3 pl-5 marker:text-sage-400 ${BODY}`}>{children}</ol>
  ),
  // Nested lists need their own margin; the outer space-y does not reach them.
  li: ({ children }) => (
    <li className="pl-1 [&>ol]:mt-2 [&>ol]:mb-1 [&>ul]:mt-2 [&>ul]:mb-1">{children}</li>
  ),

  // Set in Fraunces so a pulled line reads as a different voice from the body.
  blockquote: ({ children }) => (
    <InsideQuote.Provider value={true}>
      <blockquote
        className="my-8 space-y-3 border-l-2 border-aqua-400 py-1 pl-5 font-display text-lg leading-[1.5] text-sage-800 italic"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {children}
      </blockquote>
    </InsideQuote.Provider>
  ),

  pre: ({ children }) => <CodeBlockWrapper>{children}</CodeBlockWrapper>,
  code: ({ children }) => <CodeSpan>{children}</CodeSpan>,

  hr: () => <hr className="my-4 border-sage-200" />,

  table: ({ children }) => (
    <div className="overflow-x-auto rounded-lg border border-sage-200 bg-white/70">
      <table className="w-full border-collapse font-sans text-md">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-sage-100">{children}</thead>,
  tr: ({ children }) => <tr className="border-b border-sage-200 last:border-0">{children}</tr>,
  th: ({ node: _node, children, ...props }) => (
    <th
      {...props}
      className="px-3 py-2 text-left font-medium text-sage-900"
      style={{ textAlign: (props.style?.textAlign as 'left' | 'center' | 'right') ?? 'left' }}
    >
      {children}
    </th>
  ),
  td: ({ node: _node, children, ...props }) => (
    <td {...props} className="px-3 py-2 align-top text-sage-700">
      {children}
    </td>
  ),

  img: ({ src, alt }) => (
    <figure className="my-8 space-y-2">
      <img
        src={typeof src === 'string' ? src : undefined}
        alt={alt ?? ''}
        loading="lazy"
        className="w-full rounded-lg border border-sage-200"
      />
      {alt && <figcaption className="font-sans text-sm text-sage-600">{alt}</figcaption>}
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

  // Footnote section produced by remark-gfm. data-toc-skip keeps its
  // "Footnotes" heading out of the On this page rail.
  section: ({ children, ...props }) => {
    const isFootnotes = (props as { 'data-footnotes'?: boolean })['data-footnotes']
    return isFootnotes ? (
      <section
        data-toc-skip=""
        className="mt-12 border-t border-sage-200 pt-6 font-sans text-md text-sage-600 [&_h2]:pt-0 [&_h2]:text-base [&_ol]:text-md [&_p]:text-md"
      >
        {children}
      </section>
    ) : (
      <section>{children}</section>
    )
  },
}

export default function Markdown({ source }: { source: string }) {
  return (
    <div className="space-y-6">
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
