// Builds a real publish_page() payload from the metformin fixture with the shared parser,
// for the TS ↔ SQL contract check (contract_16b.sql). Run from db/phase15_test:
//   deno run -q --allow-read make_payload_16b.ts > /tmp/payload.json
// (jsr is not used; npm:mdast-util-from-markdown is fetched by Deno.)
import { parsePageSource } from '../../supabase/functions/_shared/pageSource/parse.ts'
import { assignSectionIds } from '../../supabase/functions/_shared/pageSource/merge.ts'
import { buildPayload, citationOrder } from '../../supabase/functions/_shared/pageSource/publish.ts'
import type { SourceMeta } from '../../supabase/functions/_shared/pageSource/resolve.ts'
const registry = JSON.parse(Deno.readTextFileSync('../../src/pageSource/registry.json'))
const T = ['moiety', 'precise_form', 'combination', 'formulation']
const keys = ['indications','dosing','contraindications','boxed_warning','epc_class','legal_status','most_used','do_not_crush','acb_score','qtc_risk'].map(k => ({ key: k, label: k, source_kind: 'x', entity_types: T }))
// Stub page 1001900 is named "Metformin" with brands GLUCOPHAGE (Glucophage) and FORTAMET.
const ctx = { pageType: 'drug' as const, title: 'metformin', entityType: 'moiety', infoboxKeys: keys, sourceBrands: ['FORTAMET', 'Glucophage'], sourceValues: {}, registry }
let src = Deno.readTextFileSync('../../src/pageSource/fixtures/metformin.page.md')
src = src.replace(/GLUCOPHAGE XR {11}# source\nGlumetza {16}# source\nRiomet {18}# source\n/, '')
src = src.replace('FORTAMET                # source', '~~FORTAMET~~ [@pmid:20393934] test strike')
const r = parsePageSource(src, ctx)
if (!r.ok) { console.error(JSON.stringify(r.diagnostics, null, 1)); Deno.exit(1) }
let n = 0
const model = assignSectionIds(r.model, () => `s-${++n}`)
const sources = new Map<string, SourceMeta>(citationOrder(model).map(c => [c.key, { key: c.key, kind: c.kind, title: 'T ' + c.key, authors: null, container: null, year: 2020, volume: null, issue: null, pages: null, doi: null, pmid: null, setid: null, url: null, resolved: true }]))
const p = buildPayload({ model, extracted: r.extracted, changed: ['lead'], summary: 'Full metformin page', sources })
console.log(JSON.stringify(p))
