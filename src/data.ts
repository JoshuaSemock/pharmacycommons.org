/**
 * Pharmacy Commons — UI color/label mapping for environmental risk
 *
 * Phase 3: the mock `DRUGS` array (hand-written entries carrying `API-00NN`
 * identifiers from the pre-Supabase prototype) and the unused `CATEGORIES`
 * array have been removed now that the frontend queries Supabase directly
 * (see api.ts, catalog.ts). This file keeps only what's actually still
 * consumed: the `EcoRisk` type and its display colors, used by
 * DrugDetail.tsx's environmental-risk panel.
 */

export type EcoRisk = 'negligible' | 'low' | 'moderate' | 'high'

export const ECO_RISK_COLORS: Record<EcoRisk, { bg: string; text: string; border: string; label: string }> = {
  negligible: { bg: '', text: 'text-ink', border: '', label: 'Negligible' },
  low: { bg: 'bg-sky-50', text: 'text-ink', border: '', label: 'Low' },
  moderate: { bg: 'bg-marigold-100', text: 'text-ink', border: '', label: 'Moderate' },
  high: { bg: 'bg-rose-100', text: 'text-ink', border: '', label: 'High' },
}
