# Dispatch log: phase 37, MedlinePlus Definitions of Health Terms (2026-11-05)

Source: 5 MedlinePlus definition XML files (Fitness, General Health, Minerals, Nutrition, Vitamins; last updated 2026-06-09). 97 entries, 85 unique terms. Licence: public domain (U.S. Government work); acknowledge "Source: MedlinePlus, National Library of Medicine". Registered as `data_sources.medlineplus`.

Applied to Supabase: `db/phase37a_term_definitions.sql` (table `term_definitions`, RLS public read, data source row) and `db/phase37b_medlineplus_definitions_load.sql` (mints and definitions).

| Block | Minted | PCID range | Type | Next PCID after batch |
|---|---|---|---|---|
| 6 clinical | 39 | 6000079-6000117 (alphabetical, Aerobic Exercise to Water-Soluble Vitamins) | concept_type "Health Term" | 6000118 |
| 7 measurement | 19 | 7000014-7000032 (alphabetical, Activity Count to Weight (Body Mass)) | Vital Sign, Derived Calculation, Serum Lab Panel, Diagnostic Measure, Health Measure | 7000033 |

Attached to existing PCIDs (19): Amino Acids 1003103, Blood Pressure 7000005, Calcium 1003121, Cholesterol 1007103, Electrolytes 1015640, Iodine 1009755, Iron 1009810, Magnesium 1003197, Niacin 1003209, Phosphorus 1012256, Potassium 1003226, Selenium 1013249, Sodium 1003242, Triglycerides 7000013, Vitamin A 1003265, Vitamin D 1014602, Vitamin E 1003266, Vitamin K 1002947, Zinc 1003270.

Definition rows: 89 (one per term per source file, so duplicates keep each file's provenance).

Held for Joshua (not loaded): Carbohydrates, Enzymes, Folate, Sugar, Vitamin B12, Vitamin B6, Vitamin C, Vitamins.

Workbook to do: add the 58 minted rows to the block 6 and block 7 entity sheets, set `PCID_Blocks.Highest_Assigned` to 6000117 and 7000032, and paste this log into `Dispatch_Log`.
