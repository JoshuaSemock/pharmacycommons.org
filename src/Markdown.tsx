import type { ReactNode } from 'react'

/**
 * A deliberately small markdown renderer — no dependency, no lockfile change.
 *
 * Supported: ## / ### headings, paragraphs, - and 1. lists, > blockquotes,
 * ``` fenced code, --- rules, and inline **bold**, *italic*, `code`,
 * [links](url).
 *
 * Not supported: tables, images, nested lists, HTML passthrough, footnotes.
 * If a post needs those, that is the signal to add a real markdown library
 * rather than to grow this file.
 */

type Block =
  | { kind: 'heading'; level: 2 | 3 | 4; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'rule' }

function toBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i++
      continue
    }

    // Fenced code
    if (line.trimStart().startsWith('```')) {
      const buffer: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        buffer.push(lines[i])
        i++
      }
      i++ // consume closing fence
      blocks.push({ kind: 'code', text: buffer.join('\n') })
      continue
    }

    // Horizontal rule
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push({ kind: 'rule' })
      i++
      continue
    }

    // Headings
    const heading = /^(#{2,4})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 2 | 3 | 4,
        text: heading[2].trim(),
      })
      i++
      continue
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const buffer: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buffer.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      blocks.push({ kind: 'quote', text: buffer.join(' ').trim() })
      continue
    }

    // Lists
    const bullet = /^\s*[-*]\s+(.*)$/
    const numbered = /^\s*\d+[.)]\s+(.*)$/
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line)
      const pattern = ordered ? numbered : bullet
      const items: string[] = []
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(pattern.exec(lines[i])![1].trim())
        i++
      }
      blocks.push({ kind: 'list', ordered, items })
      continue
    }

    // Paragraph — accumulate until a blank line or a block-starting token
    const buffer: string[] = []
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      buffer.push(lines[i].trim())
      i++
    }
    if (buffer.length) blocks.push({ kind: 'paragraph', text: buffer.join(' ') })
    else i++ // safety: never stall
  }

  return blocks
}

function isBlockStart(line: string): boolean {
  return (
    line.trimStart().startsWith('```') ||
    /^(#{2,4})\s+/.test(line) ||
    /^\s*>\s?/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^\s*(---|\*\*\*|___)\s*$/.test(line)
  )
}

const INLINE = /(`[^`]+`)|(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  let match: RegExpExecArray | null

  INLINE.lastIndex = 0
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyPrefix}-${n++}`

    if (token.startsWith('`')) {
      out.push(
        <code
          key={key}
          className="rounded bg-sage-100 px-1 py-0.5 font-mono text-[0.9em] text-sage-800"
        >
          {token.slice(1, -1)}
        </code>
      )
    } else if (token.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)!
      const href = link[2]
      const external = /^https?:\/\//.test(href)
      out.push(
        <a
          key={key}
          href={href}
          {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
          className="text-aqua-700 underline decoration-aqua-300 underline-offset-2 hover:decoration-aqua-600"
        >
          {link[1]}
        </a>
      )
    } else if (token.startsWith('**')) {
      out.push(
        <strong key={key} className="font-medium text-sage-900">
          {token.slice(2, -2)}
        </strong>
      )
    } else {
      out.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>
      )
    }

    last = match.index + token.length
  }

  if (last < text.length) out.push(text.slice(last))
  return out
}

export default function Markdown({ source }: { source: string }) {
  const blocks = toBlocks(source)

  return (
    <div className="space-y-5">
      {blocks.map((block, idx) => {
        const key = `b${idx}`
        switch (block.kind) {
          case 'heading': {
            const size =
              block.level === 2 ? 'text-[21px]' : block.level === 3 ? 'text-[17px]' : 'text-[15px]'
            const Tag = block.level === 2 ? 'h2' : block.level === 3 ? 'h3' : 'h4'
            return (
              <Tag
                key={key}
                className={`pt-3 font-display font-semibold text-sage-900 ${size}`}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {renderInline(block.text, key)}
              </Tag>
            )
          }
          case 'paragraph':
            return (
              <p key={key} className="font-sans text-[15px] leading-relaxed text-sage-700">
                {renderInline(block.text, key)}
              </p>
            )
          case 'list': {
            const ListTag = block.ordered ? 'ol' : 'ul'
            return (
              <ListTag
                key={key}
                className={`space-y-2 pl-5 font-sans text-[15px] leading-relaxed text-sage-700 ${
                  block.ordered ? 'list-decimal' : 'list-disc'
                } marker:text-sage-400`}
              >
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>
                ))}
              </ListTag>
            )
          }
          case 'quote':
            return (
              <blockquote
                key={key}
                className="border-l-2 border-aqua-300 pl-4 font-sans text-[15px] italic leading-relaxed text-sage-600"
              >
                {renderInline(block.text, key)}
              </blockquote>
            )
          case 'code':
            return (
              <pre
                key={key}
                className="overflow-x-auto rounded-lg border border-sage-200 bg-white/70 p-4 font-mono text-[12.5px] leading-relaxed text-sage-800"
              >
                <code>{block.text}</code>
              </pre>
            )
          case 'rule':
            return <hr key={key} className="border-sage-200" />
        }
      })}
    </div>
  )
}
