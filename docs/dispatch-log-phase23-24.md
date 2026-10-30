# Dispatch log: phase 23 and 24 mint batches

Paste these rows into the workbook's `Dispatch_Log` sheet (the repo has no copy of the
workbook, and the database has no dispatch-log table). **The database is the PCID
authority:** `pcid_blocks.next_pcid` already reflects every batch below (checked
2026-10-30), so `PCID_Blocks.Highest_Assigned` / `Next_PCID` in the workbook should be set to:

| Block | Kind | Next PCID | Highest assigned |
| --- | --- | --- | --- |
| 1 | Moiety | 1015973 | 1015972 |
| 2 | Combination | 2002613 | 2002612 |
| 3 | Precise form | 3001452 | 3001451 |
| 4 | Formulation | 4006894 | 4006893 |
| 5 | Class | 5004982 | 5004981 |
| 6 | Clinical concept | 6000078 | 6000077 |
| 7 | Measurement | 7000014 | 7000013 |
| 8 | Target | 8000029 | 8000028 |
| 9 | Functional group | 9000060 | 9000059 |
| 10 | List | 10000047 | 10000046 |

## Batches

Counts below were checked against `entities` on 2026-10-30 (ranges are contiguous and
fully populated).

| Date | Phase / file | Block | PCID range | Rows | What | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-29 | 23b (`db/phase23b_learn_brand_list_pcids.sql`) | 1 | 1015681–1015694 | 14 | Moieties for brand-list generics with no record (vaccines etc.) | tagged `pc.change_source = 'phase23b_brand_list'` |
| 2026-10-29 | 23b | 2 | 2002591–2002611 | 21 | Combinations for the brand list, with `has_component` triples | |
| 2026-10-29 | 23b | 4 | 4006582–4006891 | 310 | Brand formulations; `has_component` to the generic's moiety/components; `source_agency = 'Pharmacy Commons'` | |
| 2026-10-29 | 23e/23f | 4 | 4006892–4006893 | 2 | Xylocaine, Indopan brand formulations | after the merges below |
| 2026-10-29 | 23f | 2 | 2002612 | 1 | sodium nitrite/sodium thiosulfate (Nithiodote) | |
| 2026-10-29 | 23e | 1 | retired 1002968, 1009465 | 2 | Xylocaine merged into lidocaine 1003192; Indopan merged into alpha-methyltryptamine 1000313 | in `pcid_retired`; every FK re-pointed |
| 2026-10-29 | 23h (`db/phase23h_brand_names_list.sql`) | 10 | 10000039 | 1 | List `brand-names` (1,254 items) | |
| 2026-10-30 | 24e (`db/phase24e_federal_cs_link_and_mint_pcids.sql`) | 1 | within 1015695–1015737 | 43 | Federal controlled substances moieties (High/Medium importance) | live migration names are `phase19*_federal_*` |
| 2026-10-30 | 24g (`db/phase24g_federal_cs_mint_low_importance_pcids.sql`) | 1 | within 1015738–1015972 | 235 | Federal controlled substances moieties (Low importance) | 24e + 24g together = 1015695–1015972 (278 rows) |
| 2026-10-30 | 24b–24f | 10 | 10000040–10000046 | 7 | Lists `federal-controlled-substances` + six parts | published |

Not minted, for the record: phase 24i removed the Georgia MPJE lists (entity rows and PCIDs
10000020–10000024 kept, never reused).

Open check: the 24e/24g split above follows `CLAUDE.md` (43 + 235); the range boundary
between the two was not separately verified.
