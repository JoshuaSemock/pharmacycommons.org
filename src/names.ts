/**
 * Pharmacy Commons — display rules for names
 *
 *   Drug names are lower case:   "METFORMIN HYDROCHLORIDE" → "metformin hydrochloride"
 *   Brand names are capitalized: "GLUCOPHAGE XR"           → "Glucophage XR"
 *
 * Data is stored as it came from each source (FDA and the workbook use upper
 * case, RxNorm uses proper case); these helpers only change what's displayed.
 */

/** Roman numerals kept upper case inside drug names: "factor VIII", "interferon type II". */
const ROMAN = new Set(['II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII', 'XIII'])

/**
 * "METFORMIN HYDROCHLORIDE" → "metformin hydrochloride".
 * Keeps Roman numerals ("factor VIII"), letter+number codes ("vitamin B12", "(2S)")
 * and stereo descriptors in parentheses ("(R)-", "(S)-", "(E)-") upper case.
 */
export function formatDrugName(name: string | null | undefined): string {
  if (!name) return ''
  const lowered = name.replace(/[A-Za-z0-9]+/g, tok => {
    const up = tok.toUpperCase()
    if (ROMAN.has(up)) return up
    if (/^[A-Za-z]\d+[A-Za-z]?$/.test(tok)) return up // B12, D3, K1
    if (/^\d+[RSEZ]$/i.test(tok)) return up // 2S, 3R
    return tok.toLowerCase()
  })
  // (r) (s) (e) (z) (r,s) (rs) → upper case
  return lowered.replace(/\(([rsez](?:\s*,\s*[rsez])*|rs|sr)\)/g, m => m.toUpperCase())
}

/** Suffixes and abbreviations that stay upper case in brand names. */
const BRAND_UPPER = new Set([
  'XR', 'ER', 'SR', 'CR', 'XL', 'LA', 'DR', 'ODT', 'HCT', 'IR', 'CD', 'HP', 'DS', 'PM', 'AM', 'OTC',
  'XT', 'EC', 'SA', 'TR', 'MR', 'ES', 'EZ', 'IV', 'IM', 'SC', 'PFS', 'HFA', 'MDI', 'ADT', 'LQ', 'SL',
  'II', 'III', 'VI', 'XII', 'DHA', 'EPA', 'PE', 'SF', 'SE', 'LS', 'BID', 'TID', 'QD',
])

function capitalizeToken(tok: string): string {
  const up = tok.toUpperCase()
  if (BRAND_UPPER.has(up)) return up
  if (/\d/.test(tok)) return up // "104", "50/50", "B12"
  const lower = tok.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/**
 * "GLUCOPHAGE XR" → "Glucophage XR", "DEPO-SUBQ PROVERA 104" → "Depo-Subq Provera 104",
 * "CHILDREN'S ADVIL" → "Children's Advil". Names that already have lower-case
 * letters (RxNorm casing, e.g. "GlucoVance") are kept, only the first letter is
 * forced upper case.
 */
export function formatBrandName(name: string | null | undefined): string {
  if (!name) return ''
  const s = name.trim()
  if (/[a-z]/.test(s)) return s.charAt(0).toUpperCase() + s.slice(1)
  return s.replace(/[A-Za-z0-9]+(?:['’][A-Za-z]+)*/g, capitalizeToken)
}

/** "metformin (Glucophage)" */
export function drugWithBrand(name: string, brand: string | null | undefined): string {
  const drug = formatDrugName(name)
  return brand ? `${drug} (${formatBrandName(brand)})` : drug
}
