/**
 * Collapsible, highlighted JSON for the Developers console.
 *
 * - Objects and arrays fold; the first two levels start open.
 * - Clicking a key copies its JSONPath ($.brands[0].name).
 * - A "PCID-…" string loads that record in the console; a URL opens in a new tab.
 * - Long arrays show their first 50 items, with a button for the rest.
 *
 * Colors are the site palette on a dark code surface (see CODE_SURFACE).
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useState } from 'react'
import { PCID_RE, jsonPath } from './client.ts'

type Props = {
  value: unknown
  onPcid?: (pcid: string) => void
  onCopyPath?: (path: string) => void
  /** Levels opened on first render. */
  openDepth?: number
}

const ARRAY_PAGE = 50

export default function JsonView({ value, onPcid, onCopyPath, openDepth = 2 }: Props) {
  return (
    <div role="tree" aria-label="Response body" className="font-mono text-[12.5px] leading-[1.6]">
      <Node value={value} path={[]} depth={0} openDepth={openDepth} onPcid={onPcid} onCopyPath={onCopyPath} last />
    </div>
  )
}

type NodeProps = {
  name?: string | number
  value: unknown
  path: (string | number)[]
  depth: number
  openDepth: number
  last: boolean
  onPcid?: (pcid: string) => void
  onCopyPath?: (path: string) => void
}

function Key({ name, path, onCopyPath }: { name: string | number; path: (string | number)[]; onCopyPath?: (p: string) => void }) {
  if (typeof name === 'number') return null
  return (
    <>
      <button
        type="button"
        title={`Copy path ${jsonPath(path)}`}
        onClick={() => onCopyPath?.(jsonPath(path))}
        className="rounded-sm text-hepatica-300 hover:bg-white/10 hover:text-hepatica-200 focus-visible:outline-1 focus-visible:outline-hepatica-300"
      >
        "{name}"
      </button>
      <span className="text-neutral-400">: </span>
    </>
  )
}

function Scalar({ value, onPcid }: { value: unknown; onPcid?: (p: string) => void }) {
  if (value === null) return <span className="text-sky-300">null</span>
  if (typeof value === 'boolean') return <span className="text-sky-300">{String(value)}</span>
  if (typeof value === 'number') return <span className="text-salmon-300">{String(value)}</span>
  const s = String(value)
  if (PCID_RE.test(s) && onPcid) {
    return (
      <button
        type="button"
        onClick={() => onPcid(s)}
        title={`Load ${s} in the console`}
        className="rounded-sm text-mint-300 underline decoration-mint-300/40 underline-offset-2 hover:bg-white/10 hover:decoration-mint-300"
      >
        "{s}"
      </button>
    )
  }
  if (/^https?:\/\/\S+$/.test(s)) {
    return (
      <a href={s} target="_blank" rel="noreferrer" className="break-all text-mint-300 underline decoration-mint-300/40 underline-offset-2 hover:decoration-mint-300">
        "{s}"
      </a>
    )
  }
  return <span className="break-words text-mint-200">{JSON.stringify(s)}</span>
}

function Node({ name, value, path, depth, openDepth, last, onPcid, onCopyPath }: NodeProps) {
  const isArray = Array.isArray(value)
  const isObject = value !== null && typeof value === 'object'
  const [open, setOpen] = useState(depth < openDepth)
  const [showAll, setShowAll] = useState(false)
  const comma = last ? '' : <span className="text-neutral-500">,</span>
  const indent = { paddingLeft: depth === 0 ? 0 : '1.1rem' }

  if (!isObject) {
    return (
      <div style={indent} role="treeitem" aria-selected={false}>
        {name !== undefined && <Key name={name} path={path} onCopyPath={onCopyPath} />}
        <Scalar value={value} onPcid={onPcid} />
        {comma}
      </div>
    )
  }

  const entries: [string | number, unknown][] = isArray
    ? (value as unknown[]).map((v, i) => [i, v])
    : Object.entries(value as Record<string, unknown>)
  const [openBr, closeBr] = isArray ? ['[', ']'] : ['{', '}']
  const count = entries.length
  const shown = isArray && !showAll ? entries.slice(0, ARRAY_PAGE) : entries

  if (count === 0) {
    return (
      <div style={indent} role="treeitem" aria-selected={false}>
        {name !== undefined && <Key name={name} path={path} onCopyPath={onCopyPath} />}
        <span className="text-neutral-400">{openBr + closeBr}</span>
        {comma}
      </div>
    )
  }

  return (
    <div style={indent} role="treeitem" aria-expanded={open} aria-selected={false}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Collapse' : 'Expand'}
        className="-ml-4 mr-0.5 inline-block w-3.5 text-center text-neutral-500 hover:text-neutral-200"
      >
        {open ? '▾' : '▸'}
      </button>
      {name !== undefined && <Key name={name} path={path} onCopyPath={onCopyPath} />}
      <span className="text-neutral-400">{openBr}</span>
      {!open && (
        <>
          <button type="button" onClick={() => setOpen(true)} className="mx-1 rounded bg-white/10 px-1.5 text-[11px] text-neutral-300 hover:bg-white/20">
            {isArray ? `${count} item${count === 1 ? '' : 's'}` : `${count} field${count === 1 ? '' : 's'}`}
          </button>
          <span className="text-neutral-400">{closeBr}</span>
          {comma}
        </>
      )}
      {open && (
        <>
          <div role="group">
            {shown.map(([k, v], i) => (
              <Node
                key={k}
                name={k}
                value={v}
                path={[...path, k]}
                depth={depth + 1}
                openDepth={openDepth}
                last={i === entries.length - 1}
                onPcid={onPcid}
                onCopyPath={onCopyPath}
              />
            ))}
            {isArray && !showAll && count > ARRAY_PAGE && (
              <div style={{ paddingLeft: '1.1rem' }}>
                <button type="button" onClick={() => setShowAll(true)} className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-neutral-200 hover:bg-white/20">
                  Show {count - ARRAY_PAGE} more
                </button>
              </div>
            )}
          </div>
          <span className="text-neutral-400">{closeBr}</span>
          {comma}
        </>
      )}
    </div>
  )
}
