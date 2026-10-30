# Federal controlled substances (phase 24, 2026-10-30)

Source: `Controlled_Substances.xlsx` (745 rows, from the DEA Orange Book alphabetical list,
`c_cs_alpha.pdf`). Migrations: `db/phase24a`–`24h`; live names and versions are in each file's
header. The 745-row data load was run with `execute_sql` from the workbook and is not mirrored as
a file; the workbook is the source.

## What exists

- `public.federal_controlled_substances` — one row per (drug_name, control_status). Columns:
  `drug_name`, `brand_names`, `control_status` (Schedule I–V), generated `schedule_num`,
  `importance` (High / Medium / Low, default Low), `dea_cscn`, `narcotic`, `other_names`,
  `source_page`, `pcid`. RLS on, public read. 745 rows: High 88 · Medium 108 · Low 549.
  Importance replaces the old `moieties.mpje_relevance` metric (that column is untouched).
- 12 views `v_cs_{all,c2,c3_5,c2_5}_{high,medium,low}`, each exposing exactly Drug Name, Brand
  Names, Control Status, Importance (`security_invoker`, `GRANT SELECT`).
- Lists 10000040–10000046 (published 2026-10-30), loaded as ordinary `lists`/`list_items` so the
  Lists feature, compare view and drug-page Lists card pick them up with no frontend change:
  `federal-controlled-substances` (722) and parts `-c2` (72), `-c3-5` (237), `-c2-5` (305),
  `-high` (81), `-medium` (101), `-low` (540). One item per PCID; a substance scheduled in
  several schedules shows them in `legal_status` and appears in each matching part.
- The Georgia MPJE controlled-substances sublist (`georgia-mpje-controlled-substances`, 405
  items) was deleted at Joshua's request; `georgia-mpje` and the legend/exceptions parts remain.

## PCIDs

Every row is linked. 27 rows were linked to existing same-substance records and 12 more by exact
normalized name; the rest were minted as block-1 moieties (`term_type` 'Core moiety',
`is_controlled`, `controlled_schedule` CS-n, `statute_citation` 21 CFR § 1308.11–.15,
`primary_source` 'Pharmacy Commons lists import 2026-10-30 …').

| Batch | Migration | PCIDs | Count |
| --- | --- | --- | --- |
| High / Medium | `phase24e` | 1015695–1015737 | 43 |
| Low | `phase24g` | 1015738–1015972 | 235 |

Moiety `next_pcid` = 1015973. **Dispatch_Log / PCID_Blocks:** the database is the PCID authority;
to paste into the workbook, regenerate the batch table with

```sql
select e.pcid, e.name, e.slug, m.controlled_schedule
from entities e join moieties m using (pcid)
where m.primary_source like 'Pharmacy Commons lists import 2026-10-30%'
order by e.pcid;
```

## Linking decisions (Joshua delegated these, 2026-10-30)

Kept as built: link to an existing record only on the same substance (exact name or same
UNII/CAS); salts, esters and stereoisomers get their own record rather than being folded into a
parent; schedule rows for metabolites, "combination" and "preparation" entries are minted as
their own moieties because the DEA schedules them as separate entries. Revisit those (about 40
metabolite rows and the combination/preparation rows, e.g. "morphine combination") if you would
rather model them as formulations or drop them from lists — that is a merge/model call.

## Keeping it current

`scripts/refresh_cs_from_dea_pdf.py <c_cs_alpha.pdf>` is read-only: it parses the PDF and writes
`dea_new.csv` (new scheduling actions), `dea_missing.csv` (possibly descheduled) and
`dea_mismatch.csv` (same CSCN, different schedule). It was written without access to the live PDF
(the DEA site blocks the build sandbox); check `dea_rows.csv` first. New rows enter as
Importance = Low. After changing rows, re-run `phase24h` to rebuild the list items, then
`refresh materialized view concurrently public.moiety_hierarchy;`.

## Known caveats

- Cannabis-related schedules (marijuana vs. hemp) were not re-verified against the current DEA
  schedule actions; Joshua waived that check.
- Importance ratings come from the workbook, not from a published source.
