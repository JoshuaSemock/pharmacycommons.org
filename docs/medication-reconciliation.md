# Medication reconciliation tool

Route: `/tools/medication-reconciliation` · Code: `src/tools/MedicationReconciliation.tsx`, `src/tools/medrec/`
Decided with Joshua 2026-09-27.

## What it is

One complete list of what a person takes, for patients, clinicians and students
alike (one version, no audience toggle):

- **Allergies and intolerances:** allergy to what, type (allergy, intolerance,
  side effect), what the reaction was, and how severe it was, told as what
  happened (stopped the medication, went to the ER, used epinephrine, admitted…).
  Reaction and severity both offer "Other (write in)". "No known drug allergies"
  is an explicit checkbox, so "none" is distinguishable from "not asked".
- **Medications and products:** prescription, over the counter, supplement,
  herbal, alternative medicine. Shown as a table, one column per field, with the
  directions as their own column.
- **Substance use:** caffeine (mg per day), nicotine and tobacco (pack-years),
  alcohol (standard drinks per week, optional AUDIT-C), recreational substances.
- **Printable list:** what Print or save as PDF prints (landscape).

## Privacy

Nothing is sent to Supabase or anywhere else. The list lives in `localStorage`
(`pc-medrec-v1`) as a working copy, and is saved and reopened as a CSV file. The
only network use is the public catalog fetch behind the name search and a one-time
download of the clinical lists (below). Both are whole public datasets, matched in
the browser, so no request ever names a medication on someone's list.

## Directions (sig) rules

- No sig shorthand and no abbreviations except units of measure (mg, mcg, g, mL,
  mEq). Nothing from the ISMP do-not-use list: "units" spelled out, "once daily"
  not QD, no trailing zeros, leading zero on decimals. `medrec.test.ts` checks the
  example list against the list.
- Counted amounts are words ("two tablets"); measured amounts are numerals
  ("5 mL", "18 units").
- The dose in parentheses and the 24-hour maximum are **calculated** from strength ×
  quantity × administrations per day, so they cannot disagree. A hand-set maximum
  (e.g. an OTC label's six tablets) overrides the calculation.
- The form drives the choices: eye drops → Instill · drops · into both eyes;
  creams → Apply · a thin layer, no count; inhalers → Inhale · puffs. This keeps
  impossible directions from being written.
- Order: verb · amount · (dose) · route · frequency · duration · reason, then extra
  instructions, then the maximum. As needed reads "up to twice daily as needed for
  anxiety"; its duration reads "for up to 10 days".

## PCIDs

Picking a name from the search stores its PCID (moieties only, matching site
search). The CSV carries it (`pcid` column), duplicate checks match by PCID, and
the allergy-vs-medication check matches by PCID or name. Free text is always
allowed; many supplements, herbals and allergens are not in the catalog.

## Clinical lists (2026-10-03)

`src/tools/medrec/clinicalLists.ts`. Lists that say something clinical about a drug
feed the tool; every other list (most-used, Notable Drugs, Georgia MPJE) is ignored.
The registry, `CLINICAL_LISTS`, is keyed by list slug with how each list combines:

| Slug | Combines | Shows |
| --- | --- | --- |
| `anticholinergic-burden` | sum | marker "ACB n"; total in Check before you finish (3 or more = warning, 1 to 2 = note); total and contributors on the printable list |
| `arrhythmia-risk` | count | marker "QT risk"; 2 or more QT drugs = caution, 1 = note; Brugada listed separately |
| `do-not-crush` | each | marker "Do not crush"; warning when the route is a feeding tube, note otherwise, nothing when the form is already extended-release |

Adding a clinical list is one registry line (plus wording in `markerText`,
`markerDetail` and `clinicalFlags` if it needs its own).

- **Matching:** by PCID, then by typed name ignoring case and a trailing salt
  ("hydroxyzine hydrochloride" → hydroxyzine). Only moiety entries are used;
  product- and combination-level entries (20 combinations and 9 precise forms on Do
  Not Crush) need product data the tool does not record yet.
- **What counts:** medications marked taking or taking differently. Creams,
  ointments, gels and lotions are left out of the anticholinergic total (the scales
  describe systemic exposure); eye drops still count.
- **Not stored in the CSV.** List data is matched again whenever a list is opened,
  so scores are always current and the CSV stays a record of what the person takes.
  If the lists fail to load, the tool works as before without these flags.
- Markers in the table open a short explanation with a link to the list, so the
  detail works on touch screens as well as on hover.

## CSV format (version 1)

One file, one row per item, `record_type` first: `list`,
`no_known_drug_allergies`, `allergy`, `medication`, `<substance>_status`,
`caffeine`, `nicotine`, `alcohol`, `recreational`. Columns are shared; each type
fills what it needs. `directions` is for people reading the file and is
recalculated on import. Unknown row types are counted and skipped. Text starting
with `=`, `+` or `@` is prefixed with `'` so Excel does not run it. Add columns at
the end only.

## Next

- Reconciliation proper: compare the home list with new orders and mark each
  continue, change or stop.
- Strength and form choices from product data once formulations link to moieties.
- Class-level checks (therapeutic duplication by ATC or `class_members`,
  allergy class vs drug) using the stored PCIDs.
- Product-level clinical list matching (do-not-crush by formulation) once the tool
  records the product, not just the drug.
