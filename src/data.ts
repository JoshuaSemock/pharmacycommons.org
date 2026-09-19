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
  negligible: { bg: 'bg-sage-100', text: 'text-sage-700', border: 'border-sage-300', label: 'Negligible' },
  low: { bg: 'bg-aqua-100', text: 'text-aqua-700', border: 'border-aqua-300', label: 'Low' },
  moderate: { bg: 'bg-amber-100', text: 'text-sage-800', border: 'border-amber-400', label: 'Moderate' },
  high: { bg: 'bg-coral-100', text: 'text-coral-600', border: 'border-coral-400', label: 'High' },
}
