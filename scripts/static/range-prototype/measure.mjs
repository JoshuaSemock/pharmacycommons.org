// Runs the query cases in headless Chrome against server.mjs and prints time, requests and bytes.
// Usage: node measure.mjs <port> [chrome path]
import { chromium } from 'playwright-core'
const port = process.argv[2] ?? 4190
const edges = (p) => [`network edges for ${p}`, `select 'cm' k, class_pcid, member_pcid from class_members where member_pcid = ?1
  union all select 'cm', class_pcid, member_pcid from class_members where class_pcid = ?1
  union all select 'cs', subject_pcid, object_pcid from clinical_statements where subject_pcid = ?1 or object_pcid = ?1
  union all select 'li', list_pcid, member_pcid from list_items where member_pcid = ?1 or list_pcid = ?1`, [p]]
const cases = [
  ['route bundle /drugs/metformin (21 KB gz)', 'select length(bundle) n from routes where hash = ?', ['c4a5ebda6c72c9643730']],
  ['route bundle /drugs/warfarin (25 KB gz)', 'select length(bundle) n from routes where hash = ?', ['87ca159046ae1276e228']],
  ['API document PCID-1001923', 'select length(doc) n from docs where pcid = ?', [1001923]],
  edges(1001923),
  edges(1002962),
  ['class hub 5002869 (6,817 members) with names', `select e.name from class_members cm join entities e on e.pcid = cm.member_pcid where cm.class_pcid = ? order by lower(e.name) limit 40`, [5002869]],
  ['search prefix "metf" (index range)', `select pcid, name from search_index where key >= 'metf' and key < 'metg' limit 20`, []],
  ['search substring "%formin%" (full scan)', `select pcid, name from search_index where key like '%formin%' limit 20`, []],
]
const browser = await chromium.launch({ executablePath: process.argv[3] ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.goto(`http://127.0.0.1:${port}/`)
const res = await page.evaluate(c => window.run(c), cases)
console.table(res)
await browser.close()
