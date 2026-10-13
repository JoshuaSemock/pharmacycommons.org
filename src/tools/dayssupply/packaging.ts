/**
 * Days supply and quantity — curated packaging facts (public.product_packaging,
 * db/phase18_product_packaging.sql).
 *
 * One row per product per source, so a manufacturer figure and a payer figure
 * for the same product sit side by side instead of one being picked. The
 * calculator uses them to fill in the Package fields; the person can still
 * change any value, and every value shown carries its source.
 *
 * The pure part (grouping rows into products, turning a product's rows into
 * Package values and a source list) is tested in packaging.test.ts. The fetch
 * is separate and fails quietly: before the table exists, or when it has no
 * rows for a medication, nothing is offered and the fields are typed in.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getSupabase } from '@/db'
import type { Basis, Container, Pack } from './calc'

export type ValueSource = 'manufacturer' | 'payer' | 'general_default'

export type PackagingRow = {
  id: number
  entity_pcid: number
  product_name: string | null
  ndc: string | null
  basis: Basis
  container: Container | null
  package_size: number | null
  volume_ml: number | null
  drops_per_ml: number | null
  actuations: number | null
  prime_actuations: number | null
  units_per_container: number | null
  prime_units: number | null
  doses_per_container: number | null
  containers_per_box: number | null
  in_use_days: number | null
  value_source: ValueSource
  payer_name: string | null
  source_name: string
  source_url: string | null
  source_checked: string | null
  note: string | null
}

const COLUMNS =
  'id, entity_pcid, product_name, ndc, basis, container, package_size, volume_ml, drops_per_ml, actuations, prime_actuations, units_per_container, prime_units, doses_per_container, containers_per_box, in_use_days, value_source, payer_name, source_name, source_url, source_checked, note'

const cache = new Map<number, Promise<PackagingRow[]>>()

/**
 * Packaging rows for a moiety and for every formulation, combination or precise
 * form nested under it (moiety_hierarchy). Resolves to [] on any failure.
 */
export function loadPackaging(moietyPcid: number): Promise<PackagingRow[]> {
  let p = cache.get(moietyPcid)
  if (!p) {
    p = fetchPackaging(moietyPcid).catch(() => [])
    cache.set(moietyPcid, p)
  }
  return p
}

async function fetchPackaging(moietyPcid: number): Promise<PackagingRow[]> {
  const sb = await getSupabase()
  const members = await sb.from('moiety_hierarchy').select('member_pcid').eq('moiety_pcid', moietyPcid)
  const ids = [moietyPcid, ...((members.data ?? []) as { member_pcid: number }[]).map(m => m.member_pcid)]
  const { data, error } = await sb.from('product_packaging').select(COLUMNS).in('entity_pcid', ids).order('product_name')
  if (error || !data) return []
  return data as unknown as PackagingRow[]
}

/** The rows that describe one product (a label name, an NDC, one calculator basis). */
export type ProductGroup = { key: string; label: string; basis: Basis; rows: PackagingRow[] }

export function groupProducts(rows: PackagingRow[]): ProductGroup[] {
  const map = new Map<string, ProductGroup>()
  for (const r of rows) {
    const key = [r.entity_pcid, r.product_name ?? '', r.ndc ?? '', r.basis].join('|')
    let g = map.get(key)
    if (!g) {
      g = { key, label: r.product_name ?? 'Any product', basis: r.basis, rows: [] }
      map.set(key, g)
    }
    g.rows.push(r)
  }
  return [...map.values()]
}

const sourceText = (r: PackagingRow): string =>
  r.value_source === 'payer' ? `payer (${r.payer_name})` : r.value_source === 'general_default' ? 'general default' : 'manufacturer'

export type Provenance = { field: string; value: string; source: string; sourceName: string; url: string | null; checked: string | null }

/**
 * Package values for one product, plus where each came from. Manufacturer
 * values win over general defaults; a payer figure for drops per mL goes to
 * the payer field so both results show side by side.
 */
export function packFromRows(rows: PackagingRow[]): { pack: Partial<Pack>; provenance: Provenance[] } {
  const pack: Partial<Pack> = {}
  const provenance: Provenance[] = []
  const take = (field: string, value: number | null, row: PackagingRow, unit = '') => {
    if (value == null) return
    provenance.push({ field, value: `${value}${unit}`, source: sourceText(row), sourceName: row.source_name, url: row.source_url, checked: row.source_checked })
  }
  const best = (pick: (r: PackagingRow) => number | null): PackagingRow | undefined =>
    rows.find(r => r.value_source === 'manufacturer' && pick(r) != null) ?? rows.find(r => r.value_source === 'general_default' && pick(r) != null)

  const num = (n: number | null | undefined): string => (n == null ? '' : String(n))

  const size = best(r => r.package_size)
  if (size) {
    pack.size = num(size.package_size)
    take('Package size', size.package_size, size)
  }
  const vol = best(r => r.volume_ml)
  if (vol) {
    pack.mL = num(vol.volume_ml)
    take('Bottle size', vol.volume_ml, vol, ' mL')
  }
  const dpm = best(r => r.drops_per_ml)
  if (dpm) {
    pack.dropsPerMl = num(dpm.drops_per_ml)
    take('Drops per mL', dpm.drops_per_ml, dpm)
  }
  const payer = rows.find(r => r.value_source === 'payer' && r.drops_per_ml != null)
  if (payer) {
    pack.dropsPerMlPayer = num(payer.drops_per_ml)
    take('Drops per mL, payer', payer.drops_per_ml, payer)
  }
  const act = best(r => r.actuations)
  if (act) {
    pack.actuations = num(act.actuations)
    take('Puffs or sprays per device', act.actuations, act)
  }
  const pa = best(r => r.prime_actuations)
  if (pa) {
    pack.prime = num(pa.prime_actuations)
    take('Spent priming', pa.prime_actuations, pa)
  }
  const cont = rows.find(r => r.container != null)
  if (cont?.container) pack.container = cont.container
  const units = best(r => r.units_per_container)
  if (units) {
    pack.unitsPer = num(units.units_per_container)
    take('Units per container', units.units_per_container, units)
  }
  const pu = best(r => r.prime_units)
  if (pu) {
    pack.primeUnits = num(pu.prime_units)
    take('Units to prime each injection', pu.prime_units, pu)
  }
  const doses = best(r => r.doses_per_container)
  if (doses) {
    pack.dosesPer = num(doses.doses_per_container)
    take('Doses per container', doses.doses_per_container, doses)
  }
  const box = best(r => r.containers_per_box)
  if (box) {
    pack.perBox = num(box.containers_per_box)
    take('Per box', box.containers_per_box, box)
  }
  const use = best(r => r.in_use_days)
  if (use) {
    pack.inUseDays = num(use.in_use_days)
    take('Use within', use.in_use_days, use, ' days')
  }
  return { pack, provenance }
}
