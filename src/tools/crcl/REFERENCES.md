# References

Every equation, coefficient, threshold and classification used by the
calculator, mapped to its source. Written so that any number the tool displays
can be traced back to a citable origin.

## How to read this

Each item carries a verification status:

| Status | Meaning |
| --- | --- |
| **[V]** | Verified numerically — the implementation was checked against an independent calculator or against the published worked values, and matches. |
| **[P]** | Primary source identified and the coefficients are standard and well established, but no independent numerical cross-check was run. |
| **[S]** | Supplied by the requester, or taken from a secondary source. Confirm against the primary literature before clinical release. |
| **[?]** | Provenance uncertain. Flagged in the text. Do not treat as settled. |

Numerical verification was performed against ClinCalc for a single reference
case: 78-year-old female, 62 in, 91 kg, SCr 1.4 mg/dL. See
[Validation](#validation) for the matched values.

---

## 1. Renal function equations

| Output | Equation | Source | Status |
| --- | --- | --- | --- |
| Creatinine clearance | Cockcroft-Gault 1976 | Cockcroft & Gault, *Nephron* 1976 | **[V]** |
| eGFR | CKD-EPI 2021 creatinine, race-free | Inker et al., *N Engl J Med* 2021 | **[V]** |

### Cockcroft-Gault

```
CrCl (mL/min) = [(140 − age) × weight(kg)] / (72 × SCr mg/dL) × 0.85 if female
```

Cockcroft DW, Gault MH. Prediction of creatinine clearance from serum
creatinine. *Nephron.* 1976;16(1):31-41. doi:10.1159/000180580

The original derivation used **actual** body weight in 249 white male subjects.
The 0.85 female factor was estimated rather than measured, and the paper itself
noted that a correction was likely needed in obesity — which is the origin of
every weight-basis variant below.

### CKD-EPI 2021 (creatinine, race-free)

```
eGFR = 142 × min(SCr/κ, 1)^α × max(SCr/κ, 1)^−1.200 × 0.9938^age × 1.012 if female

κ = 0.7 (female), 0.9 (male)
α = −0.241 (female), −0.302 (male)
```

Inker LA, Eneanya ND, Coresh J, et al. New Creatinine- and Cystatin C-Based
Equations to Estimate GFR without Race. *N Engl J Med.*
2021;385(19):1737-1749. doi:10.1056/NEJMoa2102953

Requires an IDMS-standardized creatinine. Reported as mL/min/1.73 m².

### De-indexing eGFR for drug dosing

```
eGFR_BSAadj (mL/min) = eGFR (mL/min/1.73m²) × BSA / 1.73
```

The recommendation to de-index before using eGFR for medication decisions
comes from: **[S]**

- Kidney Disease: Improving Global Outcomes (KDIGO) CKD Work Group. KDIGO 2024
  Clinical Practice Guideline for the Evaluation and Management of Chronic
  Kidney Disease. *Kidney Int.* 2024;105(4S):S117-S314.
  doi:10.1016/j.kint.2023.10.018
- Navaneethan SD, Bansal N, Cavanaugh KL, et al. KDOQI US Commentary on the
  KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of
  CKD. *Am J Kidney Dis.* 2025;85(2):135-176. doi:10.1053/j.ajkd.2024.08.003

---

## 2. Body weight equations

| Output | Equation | Source | Status |
| --- | --- | --- | --- |
| Ideal body weight | Devine 1974 | Devine, *Drug Intell Clin Pharm* 1974 | **[V]** |
| Adjusted body weight | 40% correction factor | Winter et al., *Pharmacotherapy* 2012 | **[V]** |
| Lean body weight | Janmahasatian 2005 | Janmahasatian et al., *Clin Pharmacokinet* 2005 | **[V]** |

### Ideal body weight (Devine)

```
Male:   IBW = 50.0 kg + 2.3 × (height in inches − 60)
Female: IBW = 45.5 kg + 2.3 × (height in inches − 60)
```

Devine BJ. Gentamicin therapy. *Drug Intell Clin Pharm.* 1974;8:650-655.

Below 60 inches the formula is linearly extrapolated downward. This is the
convention used by most clinical calculators but sits outside the formula's
validated range; the calculator flags it. **[S]**

### Adjusted body weight

```
AdjBW = IBW + 0.4 × (ABW − IBW)
```

Winter MA, Guhr KN, Berg GM. Impact of various body weights and serum
creatinine concentrations on the bias and accuracy of the Cockcroft-Gault
equation. *Pharmacotherapy.* 2012;32(7):604-612.
doi:10.1002/j.1875-9114.2012.01098.x

Correction factors of 20–40% appear in practice. The 40% factor is used here
because it showed the least bias against measured creatinine clearance in the
Winter analysis.

### Lean body weight (Janmahasatian 2005)

```
Male:   LBW = (9270 × ABW) / (6680 + 216 × BMI)
Female: LBW = (9270 × ABW) / (8780 + 244 × BMI)
```

Janmahasatian S, Duffull SB, Ash S, Ward LC, Kirkpatrick CM, Green B.
Quantification of lean bodyweight. *Clin Pharmacokinet.*
2005;44(10):1051-1065. **[P]**

---

## 3. Weight-selection hierarchy

The rule that decides which weight the headline CrCl uses:

| Condition | Weight | Rationale |
| --- | --- | --- |
| ABW < IBW | Actual | Using IBW would overestimate renal function |
| IBW ≤ ABW < 130% IBW | Ideal | — |
| ABW ≥ 130% IBW | Adjusted | Using ABW would overestimate renal function |

Primary basis: Winter et al. 2012 (above), which quantified the bias of each
weight descriptor across the body-size spectrum.

Practical statement of the hierarchy, and the list of products whose labeling
overrides it: **[S]**

- *Medications That Always Use Actual Body Weight to Calculate Creatinine
  Clearance.* Pharmacy Times.
  https://www.pharmacytimes.com/view/medications-that-always-use-actual-body-weight-to-calculate-creatinine-clearance

The 130% threshold is the one stated in that source ("30% over ideal body
weight"). Note that 120% also appears in the literature and in some
institutional protocols — the threshold is configurable via
`obesityThreshold` in `evaluate()`. **[S]**

Supporting evidence that mis-selecting the weight causes real dosing errors:

- Seig A, Nappi J. Evaluation of dosing practices of rivaroxaban and
  dabigatran. *J Pharm Technol.* 2015;31(4):149-154. **[S]**

Evidence that inconsistent weight selection is itself a source of variability:

- Nemecek BD, St. Peter WL, Hong LT, Anderson ER, El Nekidy WS. Current
  Practices in Estimating Kidney Function: Insights From a Cross-Sectional
  Survey. *J Am Coll Clin Pharm.* 2025;8(11):1136-1142. doi:10.1002/jac5.70123
- Pai MP. Drug dosing based on weight and body surface area: mathematical
  assumptions and limitations in obese adults. *Pharmacotherapy.*
  2012;32(9):856-868. doi:10.1002/j.1875-9114.2012.01108.x

---

## 4. Body surface area

| Formula | Expression | Source | Status |
| --- | --- | --- | --- |
| Mosteller *(default)* | `BSA = √(height_cm × weight_kg / 3600)` | Mosteller, *N Engl J Med* 1987 | **[V]** |
| Du Bois | `BSA = 0.007184 × height_cm^0.725 × weight_kg^0.425` | Du Bois & Du Bois, *Arch Intern Med* 1916 | **[V]** |

- Mosteller RD. Simplified calculation of body-surface area. *N Engl J Med.*
  1987;317(17):1098. doi:10.1056/NEJM198710223171717
- Du Bois D, Du Bois EF. A formula to estimate the approximate surface area if
  height and weight be known. *Arch Intern Med.* 1916;17:863-871.

Mosteller is the default because it reproduces ClinCalc's de-indexed eGFR on
the reference case; Du Bois gives a value roughly 4% lower in that patient.
Both are offered because neither is universally preferred.

---

## 5. Classifications and thresholds

### BMI weight-status categories **[P]**

| BMI (kg/m²) | Category |
| --- | --- |
| < 16.0 | Severe thinness |
| 16.0–16.9 | Moderate thinness |
| 17.0–18.4 | Underweight |
| 18.5–24.9 | Normal weight |
| 25.0–29.9 | Overweight |
| 30.0–34.9 | Obesity, class I |
| 35.0–39.9 | Obesity, class II |
| ≥ 40.0 | Obesity, class III |

World Health Organization. *Obesity: preventing and managing the global
epidemic.* WHO Technical Report Series 894. Geneva: WHO; 2000. Consistent with
the NHLBI/NIH classification used in US practice.

### KDIGO GFR categories **[S]**

| Category | eGFR (mL/min/1.73m²) | Description |
| --- | --- | --- |
| G1 | ≥ 90 | Normal or high |
| G2 | 60–89 | Mildly decreased |
| G3a | 45–59 | Mildly to moderately decreased |
| G3b | 30–44 | Moderately to severely decreased |
| G4 | 15–29 | Severely decreased |
| G5 | < 15 | Kidney failure |

KDIGO 2024 CKD guideline (full citation in §1).

The calculator reports a **GFR category**, not a CKD diagnosis. KDIGO requires
the abnormality to persist for more than three months, and full staging also
requires an albuminuria category (A1–A3), which this tool does not collect.
The older K/DOQI 2002 five-stage system did not subdivide stage 3; the G3a/G3b
split is retained here because it carries different prognostic and dosing
implications.

- National Kidney Foundation. K/DOQI clinical practice guidelines for chronic
  kidney disease: evaluation, classification, and stratification. *Am J Kidney
  Dis.* 2002;39(2 Suppl 1):S1-266. *(historical context only)*

### KDIGO AKI definition and staging **[P]**

AKI is present if **any** of:

- SCr rise ≥ 0.3 mg/dL within 48 hours
- SCr rise to ≥ 1.5 × baseline, known or presumed within the prior 7 days
- Urine output < 0.5 mL/kg/h for ≥ 6 hours — **not assessed by this tool**

| Stage | Creatinine criterion |
| --- | --- |
| 1 | 1.5–1.9 × baseline, **or** ≥ 0.3 mg/dL increase |
| 2 | 2.0–2.9 × baseline |
| 3 | ≥ 3.0 × baseline, **or** increase to ≥ 4.0 mg/dL, **or** initiation of RRT |

Kidney Disease: Improving Global Outcomes (KDIGO) Acute Kidney Injury Work
Group. KDIGO Clinical Practice Guideline for Acute Kidney Injury. *Kidney Int
Suppl.* 2012;2(1):1-138.

Implementation note: the ≥ 4.0 mg/dL stage-3 criterion is applied only after
the AKI definition has already been met by the ratio or delta criterion. It is
not used to stage a chronically elevated creatinine. RRT initiation is not an
input, so stage 3 by that route is never triggered automatically.

---

## 6. Amputation / EBWL

> **This section needs verification before clinical release.** The percentages
> implemented are the table supplied by the requester. They are consistent in
> structure with the segment-weight figures commonly attributed to Osterkamp,
> but published and circulated variants of that table differ from one another
> — particularly for below-knee and whole-limb values. The specific numbers
> below were **not** independently confirmed against the primary paper.

| Level | % EBWL | Status |
| --- | --- | --- |
| Foot | 1.5% | **[S]** |
| Below-knee (BKA) | 3.5% | **[?]** |
| Above-knee (AKA) | 11% | **[?]** |
| Hip disarticulation | 16% | **[S]** |
| Hand | 0.7% | **[S]** |
| Forearm | 1.5% | **[?]** |
| Entire arm | 4% | **[?]** |

Usual primary citation for amputee segment weights:

- Osterkamp LK. Current perspective on assessment of human body proportions of
  relevance to amputees. *J Am Diet Assoc.* 1995;95(2):215-218. **[?]**

### How the correction is applied

```
IBW_amputee  = IBW_Devine × (1 − EBWL)          ← flows into CrCl
BMI_corrected = [weight / (1 − EBWL)] / height²  ← display and categorization only
```

Rationale: Devine IBW assumes intact limbs, so it is scaled **down**. The WHO
BMI categories were derived in people with all their limbs, so measured weight
is reconstituted **upward** to an intact-limb equivalent before categorizing.
Measured weight, lean body weight and BSA are left untouched — those already
describe the body as it is.

The physiological premise — that creatinine is a product of muscle metabolism,
so limb loss lowers it independently of kidney function — is well established:

- Drayer DE. Pharmacologically active drug metabolites. *Clin Pharmacokinet.*
  1976;1:426-443. *(general principle)*

Neither correction has been validated against measured creatinine clearance in
amputees. The calculator says so in its output, and warns above 25% EBWL that a
timed urine collection is preferable.

---

## 7. Method options

### Non-IDMS creatinine conversion (off by default)

```
SCr_non-IDMS = SCr_IDMS × 1.065 + 0.067
```

**[?] The specific coefficients are ClinCalc's published implementation.** They
were verified numerically — enabling this reproduces ClinCalc's output exactly
on the reference case — but the primary derivation of these two constants was
not traced. Confirm before relying on them.

The underlying problem is well documented. Cockcroft-Gault was derived before
creatinine assays were standardized; IDMS calibration lowered the average
reported creatinine by roughly 12%, so a modern SCr fed into Cockcroft-Gault
yields a higher CrCl than the same patient would have produced in the
pharmacokinetic studies that set the dosing thresholds: **[S]**

- Killeen AA, Ashwood ER, Ventura CB, Styer P. Recent trends in performance and
  current state of creatinine assays. *Arch Pathol Lab Med.*
  2013;137(4):496-502. doi:10.5858/arpa.2012-0134-CP
- Piéroni L, Delanaye P, Boutten A, et al. A multicentric evaluation of
  IDMS-traceable creatinine enzymatic assays. *Clin Chim Acta.*
  2011;412(23-24):2070-2075. doi:10.1016/j.cca.2011.07.012

Practice is genuinely split: ClinCalc applies the conversion; most EMRs,
Lexicomp, MDCalc and GlobalRPh use the creatinine as reported. The option is
off by default to match the majority.

### Creatinine floor of 1.0 mg/dL in older adults (off by default)

Implemented because it remains common institutional practice, and **labeled in
the interface as advised against**, on the basis of: **[S]**

- Dowling TC, Wang ES, Ferrucci L, Sorkin JD. Glomerular filtration rate
  equations overestimate creatinine clearance in older individuals enrolled in
  the Baltimore Longitudinal Study on Aging: impact on renal drug dosing.
  *Pharmacotherapy.* 2013;33(9):912-921. doi:10.1002/phar.1282
- Winter et al. 2012 (above)
- National Kidney Foundation KDOQI. *Cockcroft-Gault Equation for Estimating
  Creatinine Clearance.*
  https://www.kidney.org/professionals/kdoqi/cockcroft-gault-equation-estimating-creatinine-clearance

---

## 8. Position on Cockcroft-Gault vs. eGFR

The interpretation note advising that eGFR (BSA-adjusted) is now preferred for
medication decisions in adults reflects: **[S]**

- National Kidney Foundation Workgroup for Implementation of Race-Free
  eGFR-Based Medication-Related Decisions. *Moving Forward from Cockcroft and
  Gault Creatinine Clearance to Race-Free Estimated Glomerular Filtration Rate
  to Improve Medication-Related Decision-Making in Adults Across Healthcare
  Settings.* *Am J Health Syst Pharm.* 2025;82(12):644.
  https://academic.oup.com/ajhp/article/82/12/644/7903007
- US FDA, Center for Drug Evaluation and Research. *Pharmacokinetics in
  Patients with Impaired Renal Function — Study Design, Data Analysis, and
  Impact on Dosing.* Guidance for Industry. March 2024.
- Crass RL, Pai MP. Estimating renal function in drug development: time to take
  the fork in the road. *J Clin Pharmacol.* 2019;59(2):159-167.
  doi:10.1002/jcph.1314

Cockcroft-Gault is nonetheless retained as the headline output because the
overwhelming majority of current product labeling is still written against it.
Both are shown so the divergence is visible rather than hidden.

### Race-agnostic equations only

Race coefficients are not implemented anywhere in this tool, per:

- Delgado C, Baweja M, Crews DC, et al. A Unifying Approach for GFR Estimation:
  Recommendations of the NKF-ASN Task Force on Reassessing the Inclusion of
  Race in Diagnosing Kidney Disease. *Am J Kidney Dis.* 2022;79(2):268-288.e1.
  doi:10.1053/j.ajkd.2021.08.003

---

## 9. Equations deliberately excluded

Omitted as deprecated, per the NKF-ASN Task Force and KDIGO 2024:

| Equation | Reason for exclusion |
| --- | --- |
| MDRD (4-variable) | Contains a race coefficient; superseded |
| CKD-EPI 2009 | Contains a race coefficient; superseded by CKD-EPI 2021 |
| CKD-EPI 2012 cr-cys | Contains a race coefficient |
| Jelliffe 1973 | Deprecated |
| Salazar-Corcoran 1988 | Deprecated |

Also **not implemented** (not deprecated — simply out of scope):

| Equation | Note |
| --- | --- |
| CKD-EPI 2021 cr-cys | Race-free and recommended; requires cystatin C, which the tool does not collect |
| CKD-EPI 2012 cys | Race-free and recommended; same reason |
| Schwartz (pediatric) | Under 18 the tool warns rather than switching equations |

---

## 10. Medication dosing thresholds

Every entry in `crcl-medications.js` carries its own `source` field. Primary
sources are the current US prescribing information for each product, except:

| Entry | Source | Status |
| --- | --- | --- |
| Metformin | FDA 2016 labeling change (moved from SCr to eGFR) | **[S]** |
| Nitrofurantoin | AGS Beers Criteria; product labeling | **[S]** |
| Allopurinol | ACR gout guideline; Aronoff *Drug Prescribing in Renal Failure* | **[S]** |
| Morphine | Munar & Singh, *Am Fam Physician* 2007;75(10):1487-1496 | **[S]** |
| Gabapentin | Neurontin prescribing information | **[S]** |

Background references for the renal-dosing entries generally:

- Munar MY, Singh H. Drug dosing adjustments in patients with chronic kidney
  disease. *Am Fam Physician.* 2007;75(10):1487-1496.
- Aronoff GR. *Drug Prescribing in Renal Failure: Dosing Guidelines for
  Adults.* 4th ed. Philadelphia: American College of Physicians; 1999.
- Livornese LL Jr, Slavin D, Gilbert B, Robbins P, Santoro J. Use of
  antibacterial agents in renal failure. *Infect Dis Clin North Am.*
  2004;18:551-579.

> **The shipped medication set is a starter data set.** The Munar/Singh and
> Aronoff sources are old enough that their GFR bands (>50, 10–50, <10
> mL/min/1.73m²) no longer align with current labeling or with KDIGO
> categories. Every entry should be re-confirmed against current prescribing
> information before clinical release.

---

## Validation

Reference case: **78-year-old female, 62 in, 91 kg, SCr 1.4 mg/dL.**
Compared against ClinCalc.

| Output | This tool | ClinCalc | Match |
| --- | --- | --- | --- |
| Ideal body weight | 50.1 kg | 50.1 kg | yes |
| Adjusted body weight | 66.5 kg | 66.5 kg | yes |
| Lean body weight (2005) | 47.6 kg | 47.6 kg | yes |
| BMI | 36.7 kg/m² | 36.7 kg/m² | yes |
| BSA (Mosteller) | 2.00 m² | 2 m² | yes |
| eGFR, indexed | 39 mL/min/1.73m² | 39 mL/min/1.73m² | yes |
| eGFR, patient BSA | 45 mL/min | 45 mL/min | yes |
| CG, actual BW * | 43 mL/min | 43 mL/min | yes |
| CG, ideal BW * | 24 mL/min | 24 mL/min | yes |
| CG, adjusted BW * | 31 mL/min | 31 mL/min | yes |
| CG, lean BW * | 22 mL/min | 22 mL/min | yes |

\* Cockcroft-Gault values match only with the non-IDMS conversion **enabled**,
since ClinCalc applies it. With the default setting (off) the same case yields
48 / 26 / 35 / 25 mL/min, matching MDCalc and GlobalRPh instead.

Sixteen regression assertions cover these values plus the EBWL totals, the
linear IBW scaling, the BMI reconstitution, the >25% EBWL warning, and the
absence of amputation output when no amputation is selected.

---

## Outstanding verification

Before clinical release, confirm:

1. **The seven EBWL percentages** against Osterkamp 1995 directly. Circulated
   versions of this table disagree. — §6
2. **The IDMS conversion coefficients** (1.065, 0.067). Numerically consistent
   with ClinCalc, primary derivation untraced. — §7
3. **Every medication dosing band** against current prescribing information.
   — §10
4. **The 130% obesity threshold** against your institution's protocol; 120%
   is also in use. — §3
