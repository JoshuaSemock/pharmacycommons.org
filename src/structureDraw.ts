/**
 * Draw a molecule from its SMILES in the browser (phase 35, 2026-11-03).
 * RDKit.js (WASM) is imported on first use, so it only downloads on a page that has a structure.
 * Nothing is stored: each SMILES is drawn on demand and the result is cached in memory for the session.
 * The drawing is one ink colour (no heteroatom colours: the site is colourless letterpress) and comes in a light-theme
 * and a dark-theme variant, picked in CSS, because an <img> cannot read the page's colour variables.
 *
 * Destination: src/structureDraw.ts
 */

/** Past these the drawing is unreadable and slow, so the page says so instead of drawing. */
export const MAX_ATOMS = 250
export const MAX_FRAGMENTS = 8

/** The ink for each theme (--color-ink in src/index.css: neutral-800 on the light page, neutral-50 on the dark page). */
export const INK = { light: '#3a3a3a', dark: '#faf9f5' } as const

export type Drawing =
  | { ok: true; light: string; dark: string }
  | { ok: false; reason: 'too_large' | 'too_many_parts' | 'unreadable' }

/** Number of dot-separated parts in a SMILES string (salts, hydrates, mixtures). */
export function fragmentCount(smiles: string): number {
  return smiles.split('.').filter(p => p.trim() !== '').length
}

/** Every colour RDKit paints (atoms by element, stroke, fill) becomes the one ink colour. */
export function inkSvg(svg: string, ink: string): string {
  return svg.replace(/#[0-9A-Fa-f]{6}\b/g, ink)
}

/** A drawing as an image source. The SVG is RDKit's own output, loaded through <img>, where scripts cannot run. */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const DRAW_OPTIONS = JSON.stringify({
  width: 320,
  height: 240,
  padding: 0.08,
  bondLineWidth: 1.6,
  clearBackground: false,
  addStereoAnnotation: false,
})

type RDKitMol = {
  is_valid(): boolean
  get_num_atoms(): number
  get_svg_with_highlights(details: string): string
  delete(): void
}
type RDKitModule = { get_mol(smiles: string): RDKitMol | null }

let modulePromise: Promise<RDKitModule> | null = null

function loadRdkit(): Promise<RDKitModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const [{ default: init }, { default: wasmUrl }] = await Promise.all([
        import('@rdkit/rdkit'),
        import('@rdkit/rdkit/RDKit_minimal.wasm?url'),
      ])
      return (await init({ locateFile: () => wasmUrl })) as RDKitModule
    })()
    // A failed load (offline, blocked) must be retryable on the next page.
    modulePromise.catch(() => {
      modulePromise = null
    })
  }
  return modulePromise
}

const cache = new Map<string, Promise<Drawing>>()

/** Draw `smiles`; never throws. Calls for the same SMILES share one result. */
export function drawStructure(smiles: string): Promise<Drawing> {
  const key = smiles.trim()
  let hit = cache.get(key)
  if (!hit) {
    hit = render(key)
    cache.set(key, hit)
  }
  return hit
}

async function render(smiles: string): Promise<Drawing> {
  if (fragmentCount(smiles) > MAX_FRAGMENTS) return { ok: false, reason: 'too_many_parts' }
  try {
    const rdkit = await loadRdkit()
    const mol = rdkit.get_mol(smiles)
    if (!mol) return { ok: false, reason: 'unreadable' }
    try {
      if (!mol.is_valid()) return { ok: false, reason: 'unreadable' }
      if (mol.get_num_atoms() > MAX_ATOMS) return { ok: false, reason: 'too_large' }
      const svg = mol.get_svg_with_highlights(DRAW_OPTIONS)
      return { ok: true, light: svgDataUri(inkSvg(svg, INK.light)), dark: svgDataUri(inkSvg(svg, INK.dark)) }
    } finally {
      mol.delete()
    }
  } catch (err) {
    console.error('Could not draw structure', err)
    cache.delete(smiles)
    return { ok: false, reason: 'unreadable' }
  }
}
