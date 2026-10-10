/**
 * Live data for metformin (PCID-1001923), captured 2026-10-10 from Supabase:
 * infobox_properties (10 rows), resolve_property() for each key, and
 * entity_brand_names (brand_display ?? brand_key, as src/api.ts shows them).
 * Label-derived values resolve in the browser, so their "source" is a pointer.
 */

import { REGISTRY } from '../index'
import type { InfoboxKey, PageContext } from '../types'
import metforminSource from './metformin.page.md?raw'

const DRUG_TYPES = ['moiety', 'precise_form', 'combination', 'formulation']

export const INFOBOX_KEYS: InfoboxKey[] = [
  { key: 'indications', label: 'Indications', source_kind: 'label', entity_types: DRUG_TYPES },
  { key: 'dosing', label: 'Dosing', source_kind: 'label', entity_types: DRUG_TYPES },
  { key: 'contraindications', label: 'Contraindications', source_kind: 'label', entity_types: DRUG_TYPES },
  { key: 'boxed_warning', label: 'Boxed warning', source_kind: 'label', entity_types: DRUG_TYPES },
  { key: 'epc_class', label: 'Pharmacologic class (FDA)', source_kind: 'class', entity_types: DRUG_TYPES },
  { key: 'legal_status', label: 'Legal status', source_kind: 'attribute', entity_types: DRUG_TYPES },
  { key: 'most_used', label: 'Most used', source_kind: 'list', entity_types: DRUG_TYPES },
  { key: 'do_not_crush', label: 'Do not crush', source_kind: 'list', entity_types: DRUG_TYPES },
  { key: 'acb_score', label: 'ACB score', source_kind: 'list', entity_types: DRUG_TYPES },
  { key: 'qtc_risk', label: 'QTc risk', source_kind: 'list', entity_types: DRUG_TYPES },
]

export const METFORMIN: PageContext = {
  pageType: 'drug',
  title: 'metformin',
  entityType: 'moiety',
  infoboxKeys: INFOBOX_KEYS,
  sourceBrands: ['FORTAMET', 'Glucophage', 'GLUCOPHAGE XR', 'Glumetza', 'Riomet'],
  sourceValues: {
    indications: 'FDA label (Indications and usage)',
    dosing: 'FDA label (Dosage and administration)',
    contraindications: 'FDA label (Contraindications)',
    boxed_warning: 'FDA label (Boxed warning)',
    epc_class: 'Biguanide',
    legal_status: 'Rx only (Legend); Legend',
    most_used: '3',
    do_not_crush: 'Modified-release',
    acb_score: '1',
    qtc_risk: null,
  },
  registry: REGISTRY,
}

export const METFORMIN_SOURCE: string = metforminSource
