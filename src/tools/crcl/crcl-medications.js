/* ==========================================================================
   crcl-medications.js
   Renal dosing threshold data for the CrCl calculator.

   >>> THIS IS A STARTER DATA SET. Verify every entry against current
   >>> prescribing information before clinical use. Entries are structured so
   >>> the full Drug Matrix table can be bulk-imported later.

   SCHEMA
   ------
   id          string   unique slug
   name        string   generic name
   brand       string   brand name(s), or null
   category    string   grouping used for the <optgroup>
   metric      'crcl' | 'egfr'
                        Which renal estimate the labeling is written against.
                        'crcl' -> Cockcroft-Gault (mL/min)
                        'egfr' -> CKD-EPI 2021, BSA-normalized (mL/min/1.73m2)
   weightBasis 'standard' | 'abw'
                        'standard' -> use the ABW/IBW/AdjBW hierarchy
                        'abw'      -> labeling specifies ACTUAL body weight
                                      regardless of body habitus
   indication  string   indication these cutoffs apply to, or omit
   bands       array of { min, max, dose, severity }
                        min = inclusive lower bound, max = exclusive upper
                        bound, null = unbounded. Units match `metric`.
                        severity: 'ok' | 'caution' | 'avoid'
   notes       string   free text shown under the recommendation, optional
   source      string   citation label, optional
   ========================================================================== */

window.CRCL_MEDICATIONS = [

  /* --------------------------------------------------------- Anticoagulants */
  {
    id: 'rivaroxaban-af',
    name: 'Rivaroxaban',
    brand: 'Xarelto',
    category: 'Anticoagulants',
    metric: 'crcl',
    weightBasis: 'abw',
    indication: 'Nonvalvular atrial fibrillation',
    bands: [
      { min: 50,   max: null, dose: '20 mg once daily with the evening meal', severity: 'ok' },
      { min: 15,   max: 50,   dose: '15 mg once daily with the evening meal', severity: 'caution' },
      { min: null, max: 15,   dose: 'Avoid use', severity: 'avoid' }
    ],
    notes: 'Labeling uses Cockcroft-Gault with ACTUAL body weight. Substituting IBW can trigger an inappropriate dose reduction.',
    source: 'Xarelto prescribing information'
  },
  {
    id: 'dabigatran-af',
    name: 'Dabigatran',
    brand: 'Pradaxa',
    category: 'Anticoagulants',
    metric: 'crcl',
    weightBasis: 'abw',
    indication: 'Nonvalvular atrial fibrillation',
    bands: [
      { min: 30,   max: null, dose: '150 mg twice daily', severity: 'ok' },
      { min: 15,   max: 30,   dose: '75 mg twice daily', severity: 'caution' },
      { min: null, max: 15,   dose: 'Not recommended (including dialysis)', severity: 'avoid' }
    ],
    notes: 'Labeling uses Cockcroft-Gault with ACTUAL body weight. Check for concomitant P-gp inhibitors, which change the CrCl 15-30 recommendation.',
    source: 'Pradaxa prescribing information'
  },
  {
    id: 'enoxaparin-treatment',
    name: 'Enoxaparin',
    brand: 'Lovenox',
    category: 'Anticoagulants',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Treatment dosing',
    bands: [
      { min: 30,   max: null, dose: '1 mg/kg q12h, or 1.5 mg/kg q24h', severity: 'ok' },
      { min: null, max: 30,   dose: '1 mg/kg q24h', severity: 'caution' }
    ],
    notes: 'The dose itself is calculated on actual body weight; the CrCl cutoff is the adjustment trigger. Consider anti-Xa monitoring in severe impairment.',
    source: 'Lovenox prescribing information'
  },

  /* --------------------------------------------------------- Cardiovascular */
  {
    id: 'dofetilide',
    name: 'Dofetilide',
    brand: 'Tikosyn',
    category: 'Cardiovascular',
    metric: 'crcl',
    weightBasis: 'abw',
    indication: 'Atrial fibrillation / flutter',
    bands: [
      { min: 60,   max: null, dose: '500 mcg twice daily', severity: 'ok' },
      { min: 40,   max: 60,   dose: '250 mcg twice daily', severity: 'caution' },
      { min: 20,   max: 40,   dose: '125 mcg twice daily', severity: 'caution' },
      { min: null, max: 20,   dose: 'Contraindicated', severity: 'avoid' }
    ],
    notes: 'Labeling uses Cockcroft-Gault with ACTUAL body weight. Requires inpatient initiation with QTc monitoring.',
    source: 'Tikosyn prescribing information'
  },

  /* ----------------------------------------------------------- Antidiabetic */
  {
    id: 'metformin',
    name: 'Metformin',
    brand: 'Glucophage',
    category: 'Antidiabetic',
    metric: 'egfr',
    weightBasis: 'standard',
    bands: [
      { min: 45,   max: null, dose: 'No dose adjustment', severity: 'ok' },
      { min: 30,   max: 45,   dose: 'Do not initiate. If already on therapy, assess risk/benefit and consider dose reduction', severity: 'caution' },
      { min: null, max: 30,   dose: 'Contraindicated', severity: 'avoid' }
    ],
    notes: 'One of the few agents whose FDA labeling moved from Cockcroft-Gault to eGFR. Hold before iodinated contrast if eGFR 30-60.',
    source: 'FDA 2016 labeling change'
  },
  {
    id: 'empagliflozin',
    name: 'Empagliflozin',
    brand: 'Jardiance',
    category: 'Antidiabetic',
    metric: 'egfr',
    weightBasis: 'standard',
    indication: 'Glycemic control',
    bands: [
      { min: 30,   max: null, dose: 'No dose adjustment', severity: 'ok' },
      { min: 20,   max: 30,   dose: 'Glucose-lowering effect reduced; cardiorenal indications may still apply', severity: 'caution' },
      { min: null, max: 20,   dose: 'Not recommended for glycemic control', severity: 'avoid' }
    ],
    notes: 'SGLT2 inhibitors use eGFR, not Cockcroft-Gault. Cutoffs differ by indication (glycemic vs. heart failure vs. CKD) - confirm which applies.',
    source: 'Jardiance prescribing information'
  },

  /* ---------------------------------------------------------- Antimicrobials */
  {
    id: 'nitrofurantoin',
    name: 'Nitrofurantoin',
    brand: 'Macrobid / Macrodantin',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Uncomplicated cystitis',
    bands: [
      { min: 60,   max: null, dose: '100 mg twice daily x 5 days', severity: 'ok' },
      { min: 30,   max: 60,   dose: 'Short courses acceptable; efficacy falls as CrCl declines', severity: 'caution' },
      { min: null, max: 30,   dose: 'Avoid - inadequate urinary concentrations and toxic metabolite accumulation', severity: 'avoid' }
    ],
    notes: 'The historic cutoff was CrCl <60. Current Beers and ACOG guidance supports short courses down to CrCl 30.',
    source: 'Beers Criteria; product labeling'
  },
  {
    id: 'levofloxacin-750',
    name: 'Levofloxacin',
    brand: 'Levaquin',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: '750 mg q24h regimen',
    bands: [
      { min: 50,   max: null, dose: '750 mg q24h', severity: 'ok' },
      { min: 20,   max: 50,   dose: '750 mg q48h', severity: 'caution' },
      { min: null, max: 20,   dose: '750 mg x1, then 500 mg q48h', severity: 'caution' }
    ],
    notes: 'The 500 mg q24h regimen has its own separate cutoffs - confirm which regimen the indication requires.',
    source: 'Levaquin prescribing information'
  },
  {
    id: 'ciprofloxacin-oral',
    name: 'Ciprofloxacin (oral)',
    brand: 'Cipro',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    bands: [
      { min: 30,   max: null, dose: '250-750 mg q12h (usual dosing)', severity: 'ok' },
      { min: null, max: 30,   dose: '250-500 mg q18-24h', severity: 'caution' }
    ],
    source: 'Cipro prescribing information'
  },
  {
    id: 'valacyclovir-zoster',
    name: 'Valacyclovir',
    brand: 'Valtrex',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Herpes zoster',
    bands: [
      { min: 50,   max: null, dose: '1000 mg q8h x 7 days', severity: 'ok' },
      { min: 30,   max: 50,   dose: '1000 mg q12h', severity: 'caution' },
      { min: 10,   max: 30,   dose: '1000 mg q24h', severity: 'caution' },
      { min: null, max: 10,   dose: '500 mg q24h', severity: 'caution' }
    ],
    notes: 'Ensure adequate hydration. CNS toxicity is exposure-related in renal impairment.',
    source: 'Valtrex prescribing information'
  },

  /* -------------------------------------------------------- Neurology / Pain */
  {
    id: 'gabapentin',
    name: 'Gabapentin',
    brand: 'Neurontin',
    category: 'Neurology / Pain',
    metric: 'crcl',
    weightBasis: 'standard',
    bands: [
      { min: 60,   max: null, dose: '300-1200 mg three times daily', severity: 'ok' },
      { min: 30,   max: 60,   dose: '200-700 mg twice daily', severity: 'caution' },
      { min: 15,   max: 30,   dose: '200-700 mg once daily', severity: 'caution' },
      { min: null, max: 15,   dose: '100-300 mg once daily', severity: 'avoid' }
    ],
    notes: 'Sedation and myoclonus are common signs of accumulation in CKD.',
    source: 'Neurontin prescribing information'
  },
  {
    id: 'morphine',
    name: 'Morphine',
    brand: null,
    category: 'Neurology / Pain',
    metric: 'crcl',
    weightBasis: 'standard',
    bands: [
      { min: 50,   max: null, dose: 'Usual dosing', severity: 'ok' },
      { min: 10,   max: 50,   dose: 'Reduce dose 50-75% and extend the interval', severity: 'caution' },
      { min: null, max: 10,   dose: 'Avoid - use an alternative opioid', severity: 'avoid' }
    ],
    notes: 'Morphine-6-glucuronide accumulates and causes respiratory depression. The same concern applies to codeine, tramadol, and meperidine.',
    source: 'Munar & Singh, Am Fam Physician 2007'
  },

  /* ------------------------------------------------------------------ Other */
  {
    id: 'allopurinol',
    name: 'Allopurinol',
    brand: 'Zyloprim',
    category: 'Other',
    metric: 'crcl',
    weightBasis: 'standard',
    bands: [
      { min: 50,   max: null, dose: 'Start 100 mg daily; titrate to urate target', severity: 'ok' },
      { min: 10,   max: 50,   dose: 'Start 50 mg daily; titrate slowly', severity: 'caution' },
      { min: null, max: 10,   dose: 'Start 50 mg every other day; titrate with close monitoring', severity: 'caution' }
    ],
    notes: 'ACR guidance supports titrating above historic renal dose caps to reach the urate target, provided titration is slow. Oxypurinol half-life rises from about 24 h to about 125 h in renal failure.',
    source: 'ACR gout guideline; Aronoff, Drug Prescribing in Renal Failure'
  },
  {
    id: 'pemetrexed',
    name: 'Pemetrexed',
    brand: 'Alimta',
    category: 'Other',
    metric: 'crcl',
    weightBasis: 'abw',
    bands: [
      { min: 45,   max: null, dose: 'Full dose', severity: 'ok' },
      { min: null, max: 45,   dose: 'Not recommended', severity: 'avoid' }
    ],
    notes: 'Labeling uses Cockcroft-Gault with ACTUAL body weight.',
    source: 'Alimta prescribing information'
  },
  {
    id: 'zoledronic-acid-nononc',
    name: 'Zoledronic acid (non-oncologic)',
    brand: 'Reclast',
    category: 'Other',
    metric: 'crcl',
    weightBasis: 'abw',
    indication: 'Osteoporosis / Paget disease',
    bands: [
      { min: 35,   max: null, dose: '5 mg IV once yearly', severity: 'ok' },
      { min: null, max: 35,   dose: 'Contraindicated', severity: 'avoid' }
    ],
    notes: 'Labeling uses Cockcroft-Gault with ACTUAL body weight. The oncologic formulation (Zometa) has different thresholds.',
    source: 'Reclast prescribing information'
  }
];
