/**
 * Identifiers row: SMILES (phase 34, 2026-11-03).
 * Shown only when physiochemical holds a structure for this record (moieties; PubChem or FDA GSRS).
 * The source is named beside the label, and PubChem rows link to the compound record.
 * Click the string to select all of it for copying.
 *
 * Destination: src/components/StructureIdentifier.tsx
 */

import type { ReactNode } from 'react'
import { useStructure } from '../drugPageData'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const STAMP_LINK = `lp-raised lp-press rounded-md text-ink ${FOCUS}`

export function pubchemCompoundUrl(cid: number | null): string | null {
  return cid && Number.isInteger(cid) && cid > 0 ? `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}` : null
}

export default function StructureIdentifier({ pcidCode, row }: { pcidCode: string; row: (label: string, source: string, children: ReactNode) => ReactNode }) {
  const structure = useStructure(pcidCode)
  const s = structure.data?.[0]
  if (!s) return null
  const url = s.source === 'PubChem' ? pubchemCompoundUrl(s.pubchem_cid) : null
  return (
    <>
      {row(
        'SMILES',
        s.source,
        <div className="min-w-0 space-y-1.5">
          <code className="block select-all font-mono text-sm leading-relaxed text-ink [overflow-wrap:anywhere]" data-testid="smiles">
            {s.smiles}
          </code>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" title="Open in PubChem" className={`${STAMP_LINK} inline-block px-2 py-0.5 font-mono text-sm`}>
              CID {s.pubchem_cid}
            </a>
          )}
        </div>,
      )}
    </>
  )
}
