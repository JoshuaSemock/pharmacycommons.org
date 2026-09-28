# Days supply and quantity calculator

Route: `/tools/days-supply` · Code: `src/tools/DaysSupply.tsx`, `src/tools/dayssupply/`
Decided with Joshua 2026-09-28. Reference example: scriptcalc.com. Status: planned.

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

## Second phase

- Tapers and alternating doses (prednisone steps, warfarin by weekday).
- Topicals by fingertip units × body area, labeled as an estimate.
- Package lookup: pick a product and fill in package size from FDA NDC Directory
  package descriptions (for example "200 AEROSOL, METERED in 1 INHALER"), with the
  source shown. Needs `fda_products` linked to moieties first.
- Drops per mL and in-use limits stored per product in Supabase, with the source
  on each row (manufacturer, a named payer, general default), so disagreements are
  stored and shown.

## Open

- "81" was in the original list of target days. Is it a real standard length, or
  did it mean 84? Free entry covers it for now.
