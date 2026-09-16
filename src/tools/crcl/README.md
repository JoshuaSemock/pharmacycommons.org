# Creatinine Clearance Calculator

A self-contained, dependency-free widget for estimating creatinine clearance and eGFR.
Vanilla JS, no build step, no framework.

## Embedding

Drop three script tags and one stylesheet onto the page, then put the mount point
wherever you want the calculator to appear:

```html
<link rel="stylesheet" href="/path/to/crcl-calculator.css">

<div data-crcl-calculator></div>

<script src="/path/to/crcl-core.js"></script>
<script src="/path/to/crcl-medications.js"></script>
<script src="/path/to/crcl-ui.js"></script>
```

`crcl-medications.js` is optional. Leave it out and the medication selector
disappears; everything else works unchanged.

You can have more than one calculator on a page — every element carrying
`data-crcl-calculator` is initialized. If you inject one after page load, call
`CrClCalculator.boot()` or `CrClCalculator.init(element)`.

`index.html` is a working demo page. Open it through a local web server rather
than `file://`.

## Files

| File | Purpose |
| --- | --- |
| `crcl-core.js` | Pure math. No DOM, no side effects. Exports on `window.CrClCore` and via `module.exports` so you can unit-test it in Node. |
| `crcl-ui.js` | Builds the form, validates input, renders results. |
| `crcl-calculator.css` | All styling. Every selector is namespaced under `.crcl`. |
| `crcl-medications.js` | Renal dosing threshold data. |
| `index.html` | Demo / integration example. |
| `REFERENCES.md` | Citation for every equation, threshold and data point, with verification status. |

## Theming

Colors are CSS custom properties defined on `.crcl`. Override them after the
stylesheet to match your site:

```css
.crcl {
  --crcl-brand: #0b5c3f;
  --crcl-accent: #0e7a54;
  --crcl-radius: 4px;
}
```

Dark mode follows `prefers-color-scheme` automatically. To pin a theme, set
`data-crcl-theme="light"` or `data-crcl-theme="dark"` on the mount element.

## What it calculates

**Cockcroft-Gault**, shown against all four weight bases so you can see the
spread rather than a single number:

- Actual body weight
- Ideal body weight (Devine 1974)
- Adjusted body weight (IBW + 0.4 × (ABW − IBW))
- Lean body weight (Janmahasatian 2005)

The headline number applies the standard selection hierarchy:

| Condition | Weight used |
| --- | --- |
| ABW < IBW | Actual |
| IBW ≤ ABW < 130% of IBW | Ideal |
| ABW ≥ 130% of IBW | Adjusted |
| Medication labeling specifies actual weight | Actual, overriding the above |

**CKD-EPI 2021** (race-free), reported both BSA-indexed and de-indexed to the
patient's own BSA, with the KDIGO GFR category (G1–G5).

**Body size**: height and weight in both imperial and metric, every derived
weight in kg and lb, BMI with the WHO/NHLBI weight-status bands, percent of
IBW, and BSA by both Mosteller and Du Bois.

**Amputations**: an EBWL (estimated body weight lost) correction, per limb.

**AKI**: KDIGO 2012 creatinine criteria and staging against an entered baseline
creatinine, plus the percent change in CrCl. Urine output criteria are not
assessed.

**Renal dose check**: matches the computed CrCl or eGFR against a medication's
dosing bands.

Deprecated equations — MDRD, CKD-EPI 2009, Jelliffe, Salazar-Corcoran — are
deliberately absent.

## Defaults

| Input | Default |
| --- | --- |
| Age | Years (Date of birth is the alternate mode) |
| Height | Inches |
| Weight | Pounds |
| Creatinine | mg/dL |
| BSA formula | Mosteller |
| Non-IDMS conversion | Off |
| Creatinine floor | Off |

Change the unit defaults by moving the `class="is-on"` marker between the two
buttons in the relevant `data-seg` block in `crcl-ui.js`, and update the
matching key in the `state` object inside `init()`. The BSA default is the
first `<option>` in the `bsaFormula` select.

## Amputations

Creatinine is a product of muscle metabolism, so an amputation lowers it
without kidney function having changed. Pick the most proximal level for each
limb — each level is cumulative and already includes everything distal to it.

| Level | % EBWL |
| --- | --- |
| Foot | 1.5% |
| Below-knee (BKA) | 3.5% |
| Above-knee (AKA) | 11% |
| Hip disarticulation | 16% |
| Hand | 0.7% |
| Forearm | 1.5% |
| Entire arm | 4% |

Two corrections follow from the total, in opposite directions:

- **Ideal body weight is scaled down** by the EBWL fraction, because the Devine
  formula assumes intact limbs. This flows through to adjusted body weight,
  percent of IBW, the weight-selection hierarchy, and the final CrCl.
- **BMI is reconstituted upward** to an intact-limb equivalent
  (`measured weight ÷ (1 − EBWL)`), because the WHO categories were derived in
  people with all their limbs. The measured BMI is shown alongside it.

Measured weight, lean body weight, and BSA are left alone — those already
reflect the body as it is.

Neither correction is validated against measured clearance. Above 25% EBWL the
calculator warns that a timed urine collection is the better answer.

## Method options

Two choices are exposed under "Method options" because practice genuinely
differs, and both are off by default:

**Non-IDMS creatinine conversion.** Cockcroft-Gault was derived before
creatinine assays were standardized; IDMS calibration lowered the average
reported creatinine by roughly 12%. Converting back (`SCr × 1.065 + 0.067`)
lowers the resulting CrCl by about 10%. ClinCalc does this. Most EMRs,
Lexicomp, MDCalc and GlobalRPh feed the creatinine in as reported. Turning this
on reproduces ClinCalc's numbers exactly; leaving it off reproduces everyone
else's. Pick one and be consistent. It never affects CKD-EPI, which is derived
on IDMS creatinine.

**Creatinine floor of 1.0 mg/dL in older adults.** A common institutional
practice meant to stop Cockcroft-Gault overestimating clearance in patients
with low muscle mass. The National Kidney Foundation specifically advises
against it and the evidence does not support it, so it is off by default and
labeled as such.

## Adding medications

Append entries to the array in `crcl-medications.js`. The schema is documented
at the top of that file. A minimal entry:

```js
{
  id: 'apixaban-af',
  name: 'Apixaban',
  brand: 'Eliquis',
  category: 'Anticoagulants',
  metric: 'crcl',            // 'crcl' (Cockcroft-Gault) or 'egfr' (CKD-EPI 2021, indexed)
  weightBasis: 'standard',   // 'standard' hierarchy, or 'abw' to force actual weight
  indication: 'Nonvalvular atrial fibrillation',
  bands: [
    { min: 25,   max: null, dose: '5 mg twice daily', severity: 'ok' },
    { min: null, max: 25,   dose: 'See labeling',     severity: 'caution' }
  ],
  notes: 'Dose reduction also depends on age and weight, not renal function alone.',
  source: 'Eliquis prescribing information'
}
```

Band bounds are inclusive on `min` and exclusive on `max`; `null` means
unbounded. `severity` drives the color: `ok`, `caution`, or `avoid`. Categories
become `<optgroup>` labels automatically, sorted alphabetically.

Set `metric: 'egfr'` only when the labeling is genuinely written against eGFR —
metformin and the SGLT2 inhibitors are the common cases. Everything else should
stay on `crcl`.

**The shipped data set is a starter.** Verify every entry against current
prescribing information before putting it in front of clinicians.

## Using the math on its own

`crcl-core.js` has no DOM dependency, so you can require it directly:

```js
const Core = require('./crcl-core.js');

Core.evaluate({
  age: 78, sex: 'female',
  heightCm: Core.toCm(62, 'in'),
  weightKg: 91,
  scrMgdl: 1.4,
  stableRenal: true,
  amputations: { leftLeg: 'aka', rightLeg: 'none', leftArm: 'none', rightArm: 'none' }
});
// -> { crcl, cg: {actual, ideal, adjusted, lean}, egfrIndexed, egfrAbsolute,
//      ckdStage, bmi, bmiCategory, bsa, weights, selection, aki, warnings, notes }
```

Individual functions are exported too: `cockcroftGault`, `ckdEpi2021`,
`ibwDevine`, `adjBw`, `lbw2005`, `bmi`, `bmiCategory`, `bsaDuBois`,
`bsaMosteller`, `ckdStage`, `akiAssess`, `ageFromDob`, `ebwl`, and the unit
converters. `AMPUTATION_LEVELS`, `AMPUTATION_SITES` and `CKD_STAGES` are
exported as data if you want to drive your own UI from them.

## Validation

Checked against ClinCalc for a 78-year-old female, 62 in, 91 kg, SCr 1.4 mg/dL.
With the non-IDMS conversion enabled the Cockcroft-Gault variants match exactly
(ABW 43, IBW 24, AdjBW 31, LBW 22 mL/min), as do IBW 50.1 kg, AdjBW 66.5 kg,
LBW 47.6 kg, BMI 36.7, and eGFR 39 mL/min/1.73m². The de-indexed eGFR matches
only when BSA is set to Mosteller, which is why that is the default.

## Known limits

- Adult equations only. The calculator warns below age 18 rather than switching
  to a pediatric equation (Schwartz is not implemented).
- The EBWL percentages are the standard Osterkamp segment weights. They are
  population averages and take no account of residual limb length or of muscle
  atrophy in the remaining limbs.
- Below 60 inches the Devine IBW formula is linearly extrapolated, which is the
  usual convention but is outside the formula's validated range. The calculator
  flags it.
- Cystatin C equations (CKD-EPI 2021 cr-cys, CKD-EPI 2012 cys) are not
  implemented.
- AKI urine output criteria are not assessed.

## Sources

Every equation, coefficient, threshold and classification is cited in
[REFERENCES.md](REFERENCES.md), along with a verification status for each and a
short list of items that still need confirming before clinical release.

## Disclaimer

For use by qualified healthcare professionals. These are population estimates,
not measured clearance, and they are only valid when creatinine is at steady
state. Confirm every dose against current prescribing information.
