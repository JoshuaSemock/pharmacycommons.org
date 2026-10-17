# Days supply and quantity calculator

Route: `/tools/days-supply` · Code: `src/tools/DaysSupply.tsx`, `src/tools/dayssupply/`
Decided with Joshua 2026-09-28. Reference example: scriptcalc.com. Status: live (version 1, 2026-09-28;
version 2, refill calendar and pasted directions, 2026-10-13).

## What it is

One calculator, not one per dosage form. The form chosen in the directions picks
the rules. It answers three questions:

- **Directions + target days → quantity to dispense**, rounded up to whole packages.
- **Directions + quantity → days supply**, rounded down.
- **Days supply + fill date → earliest refill date**, at a threshold the user sets.

Audience: everyone, one version (same as med rec), written mostly for pharmacy staff.

## Decisions

1. **Directions are entered with the med rec directions builder**, not free text.
   It is the same component with the same rules: the form drives the choices, no
   abbreviations except units, and nothing from the ISMP do-not-use list. The
   directions line the builder writes goes into the output.
2. **Manufacturer and payer values are entered side by side each time.** There are
   no stored payer profiles. Where they disagree (drops per mL, doses per pen),
   the tool shows the result under each value in two columns and does not pick one.
3. **Version 1 scope:** tablets and capsules, liquids, eye and ear drops, inhalers,
   insulin, and injectables including GLP-1 pens. Tapers, topicals, and package
   lookup from NDC data come second.
4. **Everyone, mostly pharmacy.** Same wording for all users; defaults suit a
   dispensing workflow.

## Show the work

Every result lists each step with its numbers, so a reviewer can check it without
redoing it:

> Inhale two puffs every 4 to 6 hours as needed → at most 6 times a day → 12 puffs a day
> 200 puffs − 4 priming puffs = 196 puffs ÷ 12 = 16.3 → **16 days**

## Inputs

- **Directions** (builder): amount, unit, verb, route, frequency, as needed with a
  24-hour maximum, and site/laterality (left eye, right eye, both eyes; same for ears
  and nostrils).
  - Ranges use the **maximum** for days supply. The minimum is shown alongside
    ("16 to 33 days depending on use").
  - Schedules that aren't daily: every other day, weekly, every 2 weeks, monthly,
    and cycles (for example 21 days on, 7 days off).
- **Target days:** presets 28, 30, 34, 60, 84, 90, 100, plus free entry.
- **Package:** size and unit typed in version 1 (tablets, mL, drops per mL, puffs,
  units, pens, doses per pen), plus priming per first use and per dose where it
  applies.
- **Fill date** (optional) for the refill date.

## Rules by form (version 1)

| Form | Counting unit | Rules |
|---|---|---|
| Tablets, capsules | each | Half tablets allowed only when the directions say so; quantity rounds up to a whole tablet |
| Liquids | mL | mg to mL from the concentration; quantity rounds up to a bottle size when one is given |
| Eye and ear drops | drops → mL | Drops per mL, manufacturer vs. payer side by side; laterality multiplies drops; discard-after-opening limit |
| Inhalers, nasal sprays | actuations | First-use priming subtracted; as-needed maximum drives days; whole devices only |
| Insulin | units | Priming per injection (pens) added to daily units; in-use limit (days after first use) per vial or pen; whole pens or whole boxes as a setting |
| Injectables, including GLP-1 | doses | See below |

### Injectables and GLP-1 pens

- **Count doses, not milligrams.** A multi-dose pen is labeled for a fixed number
  of doses. Any drug left in the pen after those doses can't be delivered, so the
  tool uses labeled doses per pen and never divides mg in the pen by mg per dose.
- Single-dose pens and syringes: one dose each (for example, a carton of 4 used
  weekly = 28 days).
- Weekly, every-2-weeks, and monthly schedules come from the directions builder.
- **Dose escalation** (starting dose, then step up) is entered as steps, the same
  way a taper is. Each step is calculated separately, then added up. Version 1
  handles escalation for injectables only; general tapers come second.
- An in-use limit, when the product has one, is shown next to the calculated days.

## Two numbers, not one

When the product limits use, the tool shows both numbers and names the one that
controls. It does not choose silently.

- **Calculated days:** what the quantity lasts at the directed use.
- **Product limit:** discard after opening (eye drops), in-use days (insulin,
  some pens). Example: 1000-unit vial at 10 units a day → 100 days calculated,
  but the vial's in-use limit ends it sooner.

The limit is entered with the package in version 1. It comes from product data later.

## Rounding defaults

- Days supply rounds **down**.
- Quantity rounds **up** to whole packages for devices that can't be split
  (inhalers, bottles, pens, kits). Individual insulin pens vs. whole boxes is a setting.
- The amount left over at the end is shown.

## Output

- Quantity (with unit and package count), days supply, maximum daily use,
  amount left over, and refill date.
- A copyable line in plain language, no abbreviations:
  "Dispense 1 inhaler (200 actuations); 16-day supply."
- Opioid results link to the MME tool (separate, planned).

## Privacy

Nothing is sent anywhere. The calculation runs in the browser; nothing is saved
between visits unless we add that deliberately.

## Tests

Worked examples from the planning discussion become unit tests
(`dayssupply.test.ts`):

- Albuterol HFA, 200 puffs, two puffs every 4 to 6 hours as needed → 12 puffs a day
  maximum → 16 days (before priming is subtracted).
- 30 mL drops, both eyes, one drop twice daily = 4 drops a day. At 16 drops/mL (payer)
  → 480 drops → 120 days. At 20 drops/mL (manufacturer) → 600 drops → 150 days.
  Both shown, each checked against any discard-after-opening limit.
- A directions line from every form passes the ISMP do-not-use check med rec already runs.

## Version 2 (2026-10-13)

Decided with Joshua 2026-10-12, from a three-part plan for a "dual-mode calendar and sig parser".

- **Two cards on one sheet.** *Supply* (medication, directions, package, days or
  quantity, result) above *Refill calendar*. Two columns on wide screens, stacked on
  phones.
- **Paste directions, builder stays the source of truth.** A text box reads typed or
  pasted directions (`dayssupply/parse.ts`) and *proposes* builder values: form (from
  the dosing unit), amount or range, how often, as needed and what for, a stated
  24-hour maximum, route. The person sees what was read and what wasn't, then chooses
  "Fill in the builder"; nothing is calculated from raw text.
  - Common abbreviations are accepted as input (tab, cap, gtt, po, prn, bid, tid, qid,
    q4h, q4–6h) and the builder writes full words.
  - ISMP error-prone abbreviations (qd, qod, qhs, hs, u, IU, OD/OS/OU, AD/AS/AU, SC/SQ/
    sub q, cc) are never interpreted; the person is told which part to choose by hand.
  - "Every 4 to 6 hours" is counted at every 4 hours (the most it allows), and says so.
  - Teaspoons and tablespoons become 5 and 15 mL, with a note to check the device.
  - mg is read as the dose only for injections; elsewhere it is the strength and skipped.
  - Tapers ("… then …") are recognised; only the first step is read, with a note.
- **Work shown open.** The result's steps are always visible in the debossed result
  well, not folded away (e.g. "200 puffs − 4 to prime = 196 … 1 inhaler × 196 ÷ 16 a
  day = 12.25 days → 12 days by use").
- **Refill calendar**, two modes:
  - *Next fill date:* fill date + days supply = the date the next fill is due (the
    first day not covered), with a flat ink stamp relative to today ("In 14 days",
    "Today", "3 days ago") and the covered range. Run-out date only (Joshua,
    2026-10-12); the earlier "earliest refill at 75%" line and its threshold field
    were removed.
  - *Days since fill:* fill date and today's date (today by default, editable) → days
    passed, percent of the supply passed, and a stamp for a fill on that date ("7 days
    early", "Due today", "3 days late"). This is refill timing for one fill, not
    adherence (that needs several fills).
  - The days supply flows down from the Supply card and can be overridden; "Use the
    calculated N days" puts it back. With manufacturer and payer drops-per-mL results,
    the person picks which one feeds the calendar.
- **Colorless.** Stamps are flat ink (`Stamp`), not colored text; the marigold fills
  on the in-use-limit note and "Still needed" were removed (design-system rules 1–2).
- Tests: `parse.test.ts` (13) and the refill-calendar block in `dayssupply.test.ts`.

## Version 3 (2026-10-13)

Two more cards below the refill calendar, chosen by Joshua 2026-10-13 from the second-phase list. Each has its own engine (pure, tested) and a card that only renders it. The Supply and Refill calendar cards are untouched.

### Step schedules (tapers, weekday doses, dose step-ups)

Code: `src/tools/dayssupply/schedule.ts` (engine, `schedule.test.ts`), `ScheduleCard.tsx` (card).

- **Steps run one after another.** Each lasts a whole number of days and is either *the same amount each time* (amount per dose, then every day / every other day / weekly / every 2 weeks / every 4 weeks, and doses per day when given daily) or *different on each weekday* (total on Sunday to Saturday, counted from the weekday the step starts on; the next step carries on from where the last one ended).
- **Dose counts, not division.** The first dose is on day 1 of a step, so a weekly dose for 28 days is 4 doses (days 1, 8, 15, 22) and for 21 days is 3. The count is `ceil(days / every)`.
- **One product or one per step.** Default: use units are added across steps and the total is rounded up to whole packages once (prednisone 10 mg tablets: 30 tablets, 28 per bottle, 2 bottles). Tick *each step is a different product* (a separate pen for each GLP-1 strength) and every step is rounded up to whole packages by itself, then the package counts are added; a step can have its own package size. A partly used pen is never carried into the next strength.
- **Output:** dispense, days supply (the sum of the steps), left over, a line per step ("Days 4 to 6: 3 tablets once a day for 3 days"), the arithmetic open, and a copyable line.
- **Use-within limit (2026-10-13).** A shared "use within (days after opening)" field, and in different-product mode one per step. A package used continuously for a step lasts at most that many days, so the packages for a step are the larger of `ceil(units / package size)` and `ceil(step days / limit)`; in one-product mode the same test runs over the whole course. When the limit raises the count, the work and a note say so (the limit sets the quantity). A limit with loose units (no package size) does nothing, because there is no package to throw away.
- **Not included:** a fill date with an end date per step. A schedule gives a fixed course, so there is no "days for a quantity" direction.
- The three examples (prednisone taper, warfarin by weekday, weekly GLP-1 step-up) show how steps are entered; they are not dosing recommendations.

### Cream or ointment (fingertip units), an estimate

Code: `src/tools/dayssupply/topical.ts` (engine, `topical.test.ts`), `TopicalCard.tsx` (card).

- One fingertip unit is about 0.5 g, and one application's amount is the sum of units for the areas treated. Grams per application × applications per day × days = grams; with a package size it rounds up to whole tubes and says how many days one tube lasts.
- **Two published tables, shown, not merged** (project principle: show disagreement). FPnotebook: face and neck 2.5, each side of trunk 3.5, arm 3, hand 1, leg 6, foot 2. GPnotebook: scalp 3, face and neck 2.5, trunk front 8 and back 8, buttocks 4, whole arm with hand 4, hand 1, whole leg with foot 8, foot 2, genitalia 0.5. They differ most on the trunk (7 vs 16 units for front plus back), so a chip picks which one is used and the source is linked beside it. Checked 2026-10-13 against both pages. The unit itself: Long and Finlay, Clin Exp Dermatol 1991;16:444-7.
- Grams per unit defaults to 0.5 and is editable (GPnotebook quotes about 0.43 g for women and 0.49 g for men).
- **Adults only.** Children's amounts depend on age and are not in the tool.
- Every result carries a flat ink "Estimate" stamp and the line "Real use varies with skin, thickness and the product."

### Package facts table (`product_packaging`)

`db/phase18_product_packaging.sql` defines `product_packaging`: one row per product per source for drops per mL, bottle volume, priming, use-within days, doses per pen, units per pen and pens per box, keyed to a PCID (moiety or formulation). `value_source` is `manufacturer`, `payer` (needs `payer_name`) or `general_default`, with `source_name`, `source_url` and `source_checked` on every row, so a 20 vs 16 drops per mL disagreement is two rows. `container` (pen or vial) is recorded for insulin and injectables. Public read, no client writes.

**Status: applied 2026-10-13** by Joshua in the SQL editor (`apply_migration` was cancelled twice; recorded by hand in `schema_migrations` as 20261014003500 and 20261014003501; 3 rows, RLS on, public read only). First seed rows are in `db/phase18b_product_packaging_seed.sql`, each read from the FDA label on 2026-10-13: Lantus SoloStar (300 units, 2-unit safety test, 5 pens per carton, 28 days after first use), ProAir HFA (200 actuations, 3 priming sprays) and Xalatan (2.5 mL, 6 weeks after opening; drops per mL is not stated, so it is left out and the row's note says the label's 1.5 mcg per drop implies about 33 per mL).

**On the page (changed 2026-10-13).** `PackagingPicker.tsx` is a dropdown, not a search: "Products with known package facts" lists every product in `product_packaging` whose facts match the form chosen (A to Z), independent of the medication typed in the name field. `loadAllPackaging()` in `packaging.ts` reads the whole table once and caches it. Choosing a product and pressing "Fill in the package" sets the fields, and the box then lists every value with its source and check date. A manufacturer value wins over a general default; a payer drops-per-mL figure goes to the payer field so both results show. If the table has no rows for the chosen form, nothing appears. Tests: `packaging.test.ts`.

**Coverage (2026-10-13).** Live: 82 rows, checked 2026-10-13 (drops 49, inhaler 21, insulin 8, injection 4; every row has a source URL). Applied by Joshua in the SQL editor and recorded by hand as 20261014003502 / 03 / 04 / 05: `db/phase18c_packaging_pens_seed.sql` (11 insulin and GLP-1/GIP pen rows), `phase18d_packaging_inhalers_seed.sql` (20 inhaler rows) and `phase18e_packaging_eye_drops_seed.sql` (41 eye-drop bottle rows, one per fill size). Every figure comes from the label text in `label_section_text` (How Supplied) with a DailyMed link; nothing is inferred. The cache fills when a label is opened, or by calling the `label-text` function with `?setid=` (done for one manufacturer label per brand on 2026-10-13: 168 labels added). and `phase18f_packaging_ear_drops_seed.sql` (7 ear-drop bottle rows). Not covered: drops per mL (no label states it), ear-drop combination generics and single-dose vials, injectable vials, Respimat/Aerosphere counts held in tables, repackager labels. Priming is not collected for most pens and inhalers; Joshua's call (2026-10-13) is that days supply counting does not usually include it. Only brands with a cached manufacturer label were read.

## Calendar view (2026-10-13)

Asked for by Joshua 2026-10-13. The *Refill calendar* card now comes **first** on the page, above *Supply*; the days supply still flows into it from the Supply card (override unchanged).

- **Scrollable calendar** (`dayssupply/CalendarView.tsx`, date logic and tests in `calendar.ts` / `calendar.test.ts`). Sunday-first weeks, opens centred on today with 5 weeks before, the current week and 6 after; scrolling to either edge adds 8 more weeks, so it has no end. Today is underlined and dotted.
- **Start date** is today by default (change it with the date field; "Back to today" resets). Clicking a date sets the end: the dates between are pressed in, the ends are raised and labelled, and the result gives the days between. The start day is not counted (Oct 13 → Oct 20 = 7 days). Clicking another date moves the end; a date before the start counts backwards.
- **Count days from the start**: a number of days *before* or *after* the start date, with presets 28, 30, 60, 84, 90 and the calculated days supply. The date is drawn on the calendar. Before: "a fill dated after Jul 15 is less than 90 days before Oct 13" (so early for a 90-day supply); after: the next fill is due that day. The note states days only; the refill threshold and payer rules are not applied here.
- Selected dates use the foil mint of the search bars (`.lp-foil-set`, see `design-system.md`): raised ends, pressed-in range.

## Second phase (what is left)

- ~~Tapers and alternating doses (prednisone steps, warfarin by weekday).~~ Done in version 3.
- ~~Topicals by fingertip units × body area, labeled as an estimate.~~ Done in version 3, adults.
- Package lookup: pick a product and fill in package size from FDA NDC Directory
  package descriptions (for example "200 AEROSOL, METERED in 1 INHALER"), with the
  source shown. Checked 2026-10-12: `fda_products.pcid` is set on 10,631 of 12,261 rows
  (formulation PCIDs, e.g. ProAir HFA → PCID-4004649), but `fda_products.ndc` is empty
  and Drugs@FDA carries no package sizes, so this needs a new NDC Directory package
  ingest joined on application number. Search stays moiety-only: pick the moiety, then
  a product under it. Drops per mL, priming, in-use days and doses per pen are not in
  the NDC Directory; they need the curated table below.
- ~~Drops per mL and in-use limits stored per product in Supabase, with the source on each row~~ Table and reader are built and applied (version 3); it holds three rows so far and needs more.

## What version 1 does differently from the plan above

- **Directions builder:** the page uses med rec's vocabularies (`medrec/model.ts`)
  and sentence engine (`medrec/sig.ts`) directly, with its own form fields. The
  med rec editor itself was not extracted into a shared component, so the live
  med rec tool is untouched. Extracting it is a later clean-up.
- **Manufacturer vs. payer:** side-by-side results for drops per mL only. Doses
  per pen are entered once.
- **Dose escalation** (GLP-1 starting dose, then step up) is not in version 1. It
  moves to the second phase with tapers. Each step can be calculated on its own
  meanwhile, since each step is usually a separate product and fill.
- **Refill threshold** defaulted to 75% of the days supply and was editable (removed in version 2).
- The engine is `src/tools/dayssupply/calc.ts`, tested in `dayssupply.test.ts`;
  the page is `src/tools/DaysSupply.tsx` with `src/tools/dayssupply/Results.tsx`.

## Open

- ~~"81" in the original list of target days~~ meant 84 (Joshua, 2026-10-13); the presets already have 84.
- A taper that also uses the directions builder and package fields (the schedule card counts in simple units).
- Children's fingertip unit amounts.
