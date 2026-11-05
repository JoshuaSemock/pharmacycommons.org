/**
 * Structure drawing at the top of Quick facts (phase 35, 2026-11-03).
 * Drawn in the browser from the stored SMILES (src/structureDraw.ts); nothing is stored.
 * A moiety page shows its own drawing, named; a salt, brand or combination page shows one per component moiety,
 * each named and linked. Components with no structure on file are listed by name. Renders nothing when
 * no component has a structure (biologics, never-fetched moieties) or while the data loads.
 *
 * Destination: src/components/StructureDrawing.tsx
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStructures } from '../drugPageData'
import type { ComponentStructure } from '../drugPageData'
import { drawStructure } from '../structureDraw'
import type { Drawing } from '../structureDraw'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const NOTE: Record<'too_large' | 'too_many_parts' | 'unreadable', string> = {
  too_large: 'Too large to draw. The SMILES is under Identifiers.',
  too_many_parts: 'Too many parts to draw. The SMILES is under Identifiers.',
  unreadable: 'Could not draw this structure.',
}

function useDrawing(smiles: string): Drawing | null {
  const [state, setState] = useState<{ smiles: string; drawing: Drawing } | null>(null)
  useEffect(() => {
    let live = true
    drawStructure(smiles).then(drawing => {
      if (live) setState({ smiles, drawing })
    })
    return () => {
      live = false
    }
  }, [smiles])
  return state && state.smiles === smiles ? state.drawing : null
}

/** One drawing in a fixed-size well, so the box does not jump while RDKit loads. A lone structure gets a shorter well (2026-11-03). */
function Drawn({ name, smiles, compact }: { name: string; smiles: string; compact: boolean }) {
  const drawing = useDrawing(smiles)
  return (
    <div className={`flex w-full items-center justify-center ${compact ? 'h-40' : 'aspect-[4/3]'}`} data-testid="structure-well">
      {!drawing ? (
        <span className="block h-3/4 w-3/4 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" aria-hidden="true" />
      ) : drawing.ok ? (
        <>
          <img src={drawing.light} alt={`Structure of ${name}`} className="max-h-full max-w-full dark:hidden" />
          <img src={drawing.dark} alt="" aria-hidden="true" className="hidden max-h-full max-w-full dark:block" />
        </>
      ) : (
        <span className="px-3 text-center text-sm text-ink/70">{NOTE[drawing.reason]}</span>
      )}
    </div>
  )
}

export default function StructureDrawing({ pcidCode }: { pcidCode: string }) {
  const structures = useStructures(pcidCode)
  const rows = structures.data ?? []
  const drawable = rows.filter((r): r is ComponentStructure & { smiles: string } => r.smiles !== null)
  if (drawable.length === 0) return null

  const missing = rows.filter(r => r.smiles === null)
  const single = rows.length === 1
  const self = Number(/^PCID-(\d+)$/.exec(pcidCode)?.[1] ?? 0)

  return (
    <figure className="lp-rule-b m-0 px-4 py-3" aria-label="Chemical structure" data-testid="structure-drawing">
      <div className={single ? '' : 'grid grid-cols-1 gap-3 sm:grid-cols-2'}>
        {drawable.map(r => (
          <div key={r.moiety_pcid} className="lp-sunken min-w-0 rounded-md p-2">
            <Drawn name={r.name} smiles={r.smiles} compact={single} />
            <figcaption className="mt-1 text-center text-sm">
              {r.moiety_pcid === self ? (
                <span className="text-ink">{r.name}</span>
              ) : (
                <Link to={`/drugs/${r.slug}`} className={`rounded-md text-ink underline-offset-2 hover:underline ${FOCUS}`}>
                  {r.name}
                </Link>
              )}
            </figcaption>
          </div>
        ))}
      </div>
      {missing.length > 0 && (
        <p className="mt-2 text-sm text-ink/70" data-testid="structure-missing">
          No structure on file: {missing.map(m => m.name).join(', ')}
        </p>
      )}
    </figure>
  )
}
