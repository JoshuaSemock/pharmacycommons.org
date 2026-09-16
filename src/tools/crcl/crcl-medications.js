/* ==========================================================================
   crcl-medications.js
   Renal dosing threshold data for the CrCl calculator.

   EXPANDED STARTER DATA SET.
   Verify every entry against current prescribing information before clinical
   use.

   SCHEMA
   ------
   id          string   unique slug
   name        string   generic name
   brand       string   brand name(s), or null
   category    string   grouping used for the <optgroup>
   metric      'crcl' | 'egfr'
                         Which renal estimate the labeling is written against.
   weightBasis 'standard' | 'abw'
                         'standard' -> use ABW/IBW/AdjBW hierarchy
                         'abw'      -> labeling specifies actual body weight
   indication  string   indication these cutoffs apply to
   bands       array    { min, max, dose, severity }
                         min = inclusive lower bound
                         max = exclusive upper bound
                         null = unbounded
                         severity = 'ok' | 'caution' | 'avoid'
   notes       string   free text shown under recommendation
   source      string   citation label
   ========================================================================== */

window.CRCL_MEDICATIONS = [

  /* ======================================================= ANTICOAGULANTS */

  {
    id: 'rivaroxaban-af',
    name: 'Rivaroxaban',
    brand: 'Xarelto',
    category: 'Anticoagulants',
    metric: 'crcl',
    weightBasis: 'abw',
    indication: 'Nonvalvular atrial fibrillation',
    bands: [
      { min: 50, max: null, dose: '20 mg once daily with the evening meal', severity: 'ok' },
      { min: 15, max: 50, dose: '15 mg once daily with the evening meal', severity: 'caution' },
      { min: null, max: 15, dose: 'Avoid use', severity: 'avoid' }
    ],
    notes: 'Labeling uses Cockcroft-Gault with actual body weight.',
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
      { min: 30, max: null, dose: '150 mg twice daily', severity: 'ok' },
      { min: 15, max: 30, dose: '75 mg twice daily', severity: 'caution' },
      { min: null, max: 15, dose: 'Not recommended', severity: 'avoid' }
    ],
    notes: 'Check concomitant P-gp inhibitors and current labeling.',
    source: 'Pradaxa prescribing information'
  },

  {
    id: 'apixaban-af',
    name: 'Apixaban',
    brand: 'Eliquis',
    category: 'Anticoagulants',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Nonvalvular atrial fibrillation',
    bands: [
      {
        min: 0,
        max: null,
        dose: '5 mg twice daily unless dose-reduction criteria are met',
        severity: 'ok'
      }
    ],
    notes: 'For NVAF, reduce to 2.5 mg twice daily when at least two of: age >=80 years, body weight <=60 kg, serum creatinine >=1.5 mg/dL are present.',
    source: 'Eliquis prescribing information'
  },

  {
    id: 'edoxaban-af',
    name: 'Edoxaban',
    brand: 'Savaysa',
    category: 'Anticoagulants',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Nonvalvular atrial fibrillation',
    bands: [
      { min: 95, max: null, dose: 'Not recommended', severity: 'avoid' },
      { min: 50, max: 95, dose: '60 mg once daily', severity: 'ok' },
      { min: 15, max: 50, dose: '30 mg once daily', severity: 'caution' },
      { min: null, max: 15, dose: 'Not recommended', severity: 'avoid' }
    ],
    notes: 'NVAF labeling includes a reduced-efficacy warning at CrCl >95 mL/min.',
    source: 'Savaysa prescribing information'
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
      { min: 30, max: null, dose: '1 mg/kg q12h, or 1.5 mg/kg q24h', severity: 'ok' },
      { min: null, max: 30, dose: '1 mg/kg q24h', severity: 'caution' }
    ],
    notes: 'Dose is weight based; CrCl triggers interval adjustment.',
    source: 'Lovenox prescribing information'
  },

  {
    id: 'fondaparinux-vte',
    name: 'Fondaparinux',
    brand: 'Arixtra',
    category: 'Anticoagulants',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'VTE treatment',
    bands: [
      { min: 50, max: null, dose: 'Weight-based standard regimen', severity: 'ok' },
      { min: 30, max: 50, dose: 'Use only with caution; bleeding risk increased', severity: 'caution' },
      { min: null, max: 30, dose: 'Contraindicated', severity: 'avoid' }
    ],
    notes: 'Treatment dose depends on body weight. Review indication-specific labeling.',
    source: 'Arixtra prescribing information'
  },

  /* ===================================================== CARDIOVASCULAR */

  {
    id: 'dofetilide',
    name: 'Dofetilide',
    brand: 'Tikosyn',
    category: 'Cardiovascular',
    metric: 'crcl',
    weightBasis: 'abw',
    indication: 'Atrial fibrillation / flutter',
    bands: [
      { min: 60, max: null, dose: '500 mcg twice daily', severity: 'ok' },
      { min: 40, max: 60, dose: '250 mcg twice daily', severity: 'caution' },
      { min: 20, max: 40, dose: '125 mcg twice daily', severity: 'caution' },
      { min: null, max: 20, dose: 'Contraindicated', severity: 'avoid' }
    ],
    notes: 'Requires inpatient initiation with QT monitoring.',
    source: 'Tikosyn prescribing information'
  },

  {
    id: 'sotalol-af',
    name: 'Sotalol',
    brand: 'Betapace AF',
    category: 'Cardiovascular',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Atrial fibrillation / flutter',
    bands: [
      { min: 60, max: null, dose: 'Usual dosing; follow QT-based titration', severity: 'ok' },
      { min: 40, max: 60, dose: 'Dose every 24 hours', severity: 'caution' },
      { min: null, max: 40, dose: 'Contraindicated for Betapace AF', severity: 'avoid' }
    ],
    notes: 'Do not substitute renal dosing between different sotalol products/indications.',
    source: 'Betapace AF prescribing information'
  },

  {
    id: 'digoxin',
    name: 'Digoxin',
    brand: 'Lanoxin',
    category: 'Cardiovascular',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Heart failure / atrial fibrillation',
    bands: [
      {
        min: 50,
        max: null,
        dose: 'Individualize; usual maintenance dosing',
        severity: 'ok'
      },
      {
        min: 30,
        max: 50,
        dose: 'Use lower maintenance dose and monitor serum concentration',
        severity: 'caution'
      },
      {
        min: null,
        max: 30,
        dose: 'Use very low maintenance dose and close monitoring',
        severity: 'caution'
      }
    ],
    notes: 'Dose selection also depends on lean body weight, age, serum concentration, and interacting drugs.',
    source: 'Lanoxin prescribing information'
  },

  {
    id: 'atenolol',
    name: 'Atenolol',
    brand: 'Tenormin',
    category: 'Cardiovascular',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Hypertension / angina',
    bands: [
      { min: 35, max: null, dose: 'Usual dosing', severity: 'ok' },
      { min: 15, max: 35, dose: 'Maximum 50 mg/day', severity: 'caution' },
      { min: null, max: 15, dose: 'Maximum 25 mg/day', severity: 'caution' }
    ],
    source: 'Tenormin prescribing information'
  },

  {
    id: 'nadolol',
    name: 'Nadolol',
    brand: 'Corgard',
    category: 'Cardiovascular',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Hypertension / angina',
    bands: [
      { min: 50, max: null, dose: 'Usual interval', severity: 'ok' },
      { min: 31, max: 50, dose: 'Dose every 24 hours', severity: 'caution' },
      { min: 10, max: 31, dose: 'Dose every 24-36 hours', severity: 'caution' },
      { min: null, max: 10, dose: 'Dose every 40-60 hours', severity: 'caution' }
    ],
    source: 'Corgard prescribing information'
  },

  {
    id: 'acebutolol',
    name: 'Acebutolol',
    brand: 'Sectral',
    category: 'Cardiovascular',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Hypertension / ventricular arrhythmia',
    bands: [
      { min: 50, max: null, dose: 'Usual dosing', severity: 'ok' },
      { min: 25, max: 50, dose: 'Reduce dose or extend interval', severity: 'caution' },
      { min: null, max: 25, dose: 'Substantial dose/interval reduction', severity: 'caution' }
    ],
    notes: 'Active metabolite is substantially renally cleared.',
    source: 'Sectral prescribing information'
  },

  {
    id: 'procainamide',
    name: 'Procainamide',
    brand: 'Pronestyl',
    category: 'Cardiovascular',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Arrhythmia',
    bands: [
      { min: 50, max: null, dose: 'Usual regimen with monitoring', severity: 'ok' },
      { min: 10, max: 50, dose: 'Reduce dose and/or extend interval', severity: 'caution' },
      { min: null, max: 10, dose: 'Major reduction/extended interval; specialist monitoring', severity: 'caution' }
    ],
    notes: 'Procainamide and NAPA accumulate in renal impairment.',
    source: 'Procainamide prescribing information'
  },

  {
    id: 'disopyramide',
    name: 'Disopyramide',
    brand: 'Norpace',
    category: 'Cardiovascular',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Ventricular arrhythmia',
    bands: [
      { min: 40, max: null, dose: 'Usual regimen', severity: 'ok' },
      { min: null, max: 40, dose: 'Reduce dose/extend interval', severity: 'caution' }
    ],
    source: 'Norpace prescribing information'
  },

  /* ======================================================= ANTIDIABETICS */

  {
    id: 'metformin',
    name: 'Metformin',
    brand: 'Glucophage',
    category: 'Antidiabetic',
    metric: 'egfr',
    weightBasis: 'standard',
    indication: 'Type 2 diabetes',
    bands: [
      { min: 45, max: null, dose: 'No renal dose adjustment', severity: 'ok' },
      {
        min: 30,
        max: 45,
        dose: 'Do not initiate; if already receiving, assess risk/benefit and consider dose reduction',
        severity: 'caution'
      },
      { min: null, max: 30, dose: 'Contraindicated', severity: 'avoid' }
    ],
    notes: 'FDA labeling uses eGFR.',
    source: 'FDA metformin labeling'
  },

  {
    id: 'sitagliptin',
    name: 'Sitagliptin',
    brand: 'Januvia',
    category: 'Antidiabetic',
    metric: 'egfr',
    weightBasis: 'standard',
    indication: 'Type 2 diabetes',
    bands: [
      { min: 45, max: null, dose: '100 mg once daily', severity: 'ok' },
      { min: 30, max: 45, dose: '50 mg once daily', severity: 'caution' },
      { min: null, max: 30, dose: '25 mg once daily', severity: 'caution' }
    ],
    source: 'Januvia prescribing information'
  },

  {
    id: 'saxagliptin',
    name: 'Saxagliptin',
    brand: 'Onglyza',
    category: 'Antidiabetic',
    metric: 'egfr',
    weightBasis: 'standard',
    indication: 'Type 2 diabetes',
    bands: [
      { min: 45, max: null, dose: '2.5 or 5 mg once daily depending on indication/interaction', severity: 'ok' },
      { min: null, max: 45, dose: '2.5 mg once daily', severity: 'caution' }
    ],
    notes: 'Also reduce to 2.5 mg daily with strong CYP3A4/5 inhibitors.',
    source: 'Onglyza prescribing information'
  },

  {
    id: 'alogliptin',
    name: 'Alogliptin',
    brand: 'Nesina',
    category: 'Antidiabetic',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Type 2 diabetes',
    bands: [
      { min: 60, max: null, dose: '25 mg once daily', severity: 'ok' },
      { min: 30, max: 60, dose: '12.5 mg once daily', severity: 'caution' },
      { min: null, max: 30, dose: '6.25 mg once daily', severity: 'caution' }
    ],
    source: 'Nesina prescribing information'
  },

  {
    id: 'empagliflozin',
    name: 'Empagliflozin',
    brand: 'Jardiance',
    category: 'Antidiabetic',
    metric: 'egfr',
    weightBasis: 'standard',
    indication: 'Type 2 diabetes / heart failure / CKD',
    bands: [
      { min: 30, max: null, dose: 'Indication-specific dosing; no renal dose reduction for HF/CKD indications', severity: 'ok' },
      { min: null, max: 30, dose: 'Glycemic efficacy reduced; indication-specific use must be verified', severity: 'caution' }
    ],
    notes: 'Renal function affects glycemic efficacy and eligibility differently by indication.',
    source: 'Jardiance prescribing information'
  },

  {
    id: 'dapagliflozin',
    name: 'Dapagliflozin',
    brand: 'Farxiga',
    category: 'Antidiabetic',
    metric: 'egfr',
    weightBasis: 'standard',
    indication: 'Type 2 diabetes / heart failure / CKD',
    bands: [
      { min: 45, max: null, dose: 'Indication-specific dosing', severity: 'ok' },
      { min: null, max: 45, dose: 'Renal-function restrictions differ by indication; verify current labeling', severity: 'caution' }
    ],
    source: 'Farxiga prescribing information'
  },

  {
    id: 'canagliflozin',
    name: 'Canagliflozin',
    brand: 'Invokana',
    category: 'Antidiabetic',
    metric: 'egfr',
    weightBasis: 'standard',
    indication: 'Type 2 diabetes / CKD / cardiovascular risk reduction',
    bands: [
      { min: 60, max: null, dose: 'Usual dose; indication-specific', severity: 'ok' },
      { min: 30, max: 60, dose: 'Maximum dose generally limited to 100 mg/day', severity: 'caution' },
      { min: null, max: 30, dose: 'Do not initiate for glycemic control; indication-specific CKD use may differ', severity: 'caution' }
    ],
    source: 'Invokana prescribing information'
  },

  /* ======================================================= ANTIMICROBIALS */

  {
    id: 'nitrofurantoin',
    name: 'Nitrofurantoin',
    brand: 'Macrobid / Macrodantin',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Uncomplicated cystitis',
    bands: [
      { min: 30, max: null, dose: 'Standard short-course dosing', severity: 'ok' },
      { min: null, max: 30, dose: 'Avoid for treatment of cystitis in most references', severity: 'avoid' }
    ],
    notes: 'Verify threshold against current product labeling and applicable clinical guidance.',
    source: 'Product labeling; renal dosing references'
  },

  {
    id: 'levofloxacin-750',
    name: 'Levofloxacin',
    brand: 'Levaquin',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: '750 mg regimen',
    bands: [
      { min: 50, max: null, dose: '750 mg q24h', severity: 'ok' },
      { min: 20, max: 50, dose: '750 mg q48h', severity: 'caution' },
      { min: null, max: 20, dose: '750 mg once, then 500 mg q48h', severity: 'caution' }
    ],
    source: 'Levaquin prescribing information'
  },

  {
    id: 'ciprofloxacin-oral',
    name: 'Ciprofloxacin (oral)',
    brand: 'Cipro',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Bacterial infections',
    bands: [
      { min: 30, max: null, dose: '250-750 mg q12h depending on infection', severity: 'ok' },
      { min: null, max: 30, dose: '250-500 mg q18-24h depending on regimen', severity: 'caution' }
    ],
    source: 'Cipro prescribing information'
  },

  {
    id: 'acyclovir-iv',
    name: 'Acyclovir',
    brand: 'Zovirax',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'IV HSV/VZV treatment',
    bands: [
      { min: 50, max: null, dose: 'Usual interval', severity: 'ok' },
      { min: 25, max: 50, dose: 'Extend interval to q12h', severity: 'caution' },
      { min: 10, max: 25, dose: 'Extend interval to q24h', severity: 'caution' },
      { min: null, max: 10, dose: 'Further interval reduction; verify indication-specific regimen', severity: 'caution' }
    ],
    notes: 'Dose in mg/kg depends on indication.',
    source: 'Acyclovir prescribing information'
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
      { min: 50, max: null, dose: '1000 mg q8h x 7 days', severity: 'ok' },
      { min: 30, max: 50, dose: '1000 mg q12h', severity: 'caution' },
      { min: 10, max: 30, dose: '1000 mg q24h', severity: 'caution' },
      { min: null, max: 10, dose: '500 mg q24h', severity: 'caution' }
    ],
    source: 'Valtrex prescribing information'
  },

  {
    id: 'fluconazole',
    name: 'Fluconazole',
    brand: 'Diflucan',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Multiple fungal infections',
    bands: [
      { min: 50, max: null, dose: '100% of usual maintenance dose after loading dose', severity: 'ok' },
      { min: null, max: 50, dose: '50% of usual maintenance dose after loading dose', severity: 'caution' }
    ],
    notes: 'Hemodialysis patients generally receive dosing after dialysis.',
    source: 'Diflucan prescribing information'
  },

  {
    id: 'trimethoprim-sulfamethoxazole',
    name: 'Trimethoprim/sulfamethoxazole',
    brand: 'Bactrim / Septra',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Bacterial infections',
    bands: [
      { min: 30, max: null, dose: 'Usual regimen', severity: 'ok' },
      { min: 15, max: 30, dose: 'Reduce usual dose by 50%', severity: 'caution' },
      { min: null, max: 15, dose: 'Use not recommended in many references; verify indication', severity: 'avoid' }
    ],
    notes: 'High-dose PCP treatment requires a separate renal regimen.',
    source: 'Product labeling'
  },

  {
    id: 'cefepime',
    name: 'Cefepime',
    brand: 'Maxipime',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Bacterial infections',
    bands: [
      { min: 60, max: null, dose: 'Usual regimen according to indication', severity: 'ok' },
      { min: 30, max: 60, dose: 'Reduce dose and/or extend interval according to indication', severity: 'caution' },
      { min: 11, max: 30, dose: 'Renally adjusted regimen', severity: 'caution' },
      { min: null, max: 11, dose: 'Renally adjusted regimen; dialysis-specific dosing required', severity: 'caution' }
    ],
    notes: 'Exact dose depends on infection/severity. Neurotoxicity is associated with accumulation.',
    source: 'Maxipime prescribing information'
  },

  {
    id: 'meropenem',
    name: 'Meropenem',
    brand: 'Merrem',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Bacterial infections',
    bands: [
      { min: 50, max: null, dose: 'Usual regimen', severity: 'ok' },
      { min: 26, max: 50, dose: 'Usual dose q12h', severity: 'caution' },
      { min: 10, max: 26, dose: 'One-half usual dose q12h', severity: 'caution' },
      { min: null, max: 10, dose: 'One-half usual dose q24h', severity: 'caution' }
    ],
    source: 'Merrem prescribing information'
  },

  {
    id: 'ertapenem',
    name: 'Ertapenem',
    brand: 'Invanz',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Bacterial infections',
    bands: [
      { min: 30, max: null, dose: '1 g once daily', severity: 'ok' },
      { min: null, max: 30, dose: '500 mg once daily', severity: 'caution' }
    ],
    notes: 'Dialysis-specific supplemental dosing applies.',
    source: 'Invanz prescribing information'
  },

  {
    id: 'piperacillin-tazobactam',
    name: 'Piperacillin/tazobactam',
    brand: 'Zosyn',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Bacterial infections',
    bands: [
      { min: 40, max: null, dose: 'Usual indication-specific dose', severity: 'ok' },
      { min: 20, max: 40, dose: 'Reduce dose according to indication', severity: 'caution' },
      { min: null, max: 20, dose: 'Renally adjusted regimen', severity: 'caution' }
    ],
    notes: 'Extended-infusion and hemodialysis regimens require separate records.',
    source: 'Zosyn prescribing information'
  },

  {
    id: 'vancomycin-iv',
    name: 'Vancomycin',
    brand: 'Vancocin',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Serious systemic infections',
    bands: [
      {
        min: 60,
        max: null,
        dose: 'Individualize using weight, renal function and therapeutic drug monitoring',
        severity: 'ok'
      },
      {
        min: null,
        max: 60,
        dose: 'Individualize interval/dose using therapeutic drug monitoring',
        severity: 'caution'
      }
    ],
    notes: 'Modern IV vancomycin dosing generally uses AUC-guided therapeutic drug monitoring.',
    source: 'Vancomycin consensus monitoring guidance'
  },

  {
    id: 'gentamicin',
    name: 'Gentamicin',
    brand: 'Garamycin',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Systemic bacterial infections',
    bands: [
      { min: 60, max: null, dose: 'Individualize with therapeutic drug monitoring', severity: 'ok' },
      { min: null, max: 60, dose: 'Extend interval and individualize with therapeutic drug monitoring', severity: 'caution' }
    ],
    notes: 'Exact regimen depends on conventional versus extended-interval dosing.',
    source: 'Gentamicin prescribing information'
  },

  {
    id: 'amoxicillin',
    name: 'Amoxicillin',
    brand: 'Amoxil',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Bacterial infections',
    bands: [
      { min: 30, max: null, dose: 'Usual indication-specific regimen', severity: 'ok' },
      { min: 10, max: 30, dose: 'Reduce dose/extend interval according to indication', severity: 'caution' },
      { min: null, max: 10, dose: 'Further interval adjustment required', severity: 'caution' }
    ],
    source: 'Amoxicillin prescribing information'
  },

  {
    id: 'amoxicillin-clavulanate',
    name: 'Amoxicillin/clavulanate',
    brand: 'Augmentin',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Bacterial infections',
    bands: [
      { min: 30, max: null, dose: 'Usual regimen according to formulation', severity: 'ok' },
      { min: 10, max: 30, dose: 'Use renal-adjusted formulation/regimen; avoid 875 mg tablet', severity: 'caution' },
      { min: null, max: 10, dose: 'Renally adjusted regimen; avoid 875 mg tablet', severity: 'caution' }
    ],
    source: 'Augmentin prescribing information'
  },

  {
    id: 'cephalexin',
    name: 'Cephalexin',
    brand: 'Keflex',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Bacterial infections',
    bands: [
      { min: 60, max: null, dose: 'Usual regimen', severity: 'ok' },
      { min: 30, max: 60, dose: 'Reduce dose/interval according to indication', severity: 'caution' },
      { min: 15, max: 30, dose: 'Further dose/interval reduction', severity: 'caution' },
      { min: null, max: 15, dose: 'Renally adjusted regimen', severity: 'caution' }
    ],
    source: 'Keflex prescribing information'
  },

  {
    id: 'cefdinir',
    name: 'Cefdinir',
    brand: 'Omnicef',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Bacterial infections',
    bands: [
      { min: 30, max: null, dose: 'Usual regimen', severity: 'ok' },
      { min: null, max: 30, dose: '300 mg once daily', severity: 'caution' }
    ],
    source: 'Cefdinir prescribing information'
  },

  {
    id: 'cefazolin',
    name: 'Cefazolin',
    brand: 'Ancef',
    category: 'Antimicrobials',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Bacterial infections',
    bands: [
      { min: 55, max: null, dose: 'Usual indication-specific regimen', severity: 'ok' },
      { min: 35, max: 55, dose: 'Reduce frequency', severity: 'caution' },
      { min: 11, max: 35, dose: 'Reduce dose and/or frequency', severity: 'caution' },
      { min: null, max: 11, dose: 'Major renal adjustment / dialysis regimen', severity: 'caution' }
    ],
    source: 'Cefazolin prescribing information'
  },

  /* ========================================================== ANTIVIRALS */

  {
    id: 'oseltamivir-treatment',
    name: 'Oseltamivir',
    brand: 'Tamiflu',
    category: 'Antivirals',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Influenza treatment',
    bands: [
      { min: 61, max: null, dose: '75 mg twice daily for 5 days', severity: 'ok' },
      { min: 31, max: 61, dose: '30 mg twice daily for 5 days', severity: 'caution' },
      { min: 11, max: 31, dose: '30 mg once daily for 5 days', severity: 'caution' },
      { min: null, max: 11, dose: 'Dialysis/severe-renal-impairment regimen required', severity: 'caution' }
    ],
    source: 'Tamiflu prescribing information'
  },

  {
    id: 'peramivir',
    name: 'Peramivir',
    brand: 'Rapivab',
    category: 'Antivirals',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Acute uncomplicated influenza',
    bands: [
      { min: 50, max: null, dose: '600 mg IV once', severity: 'ok' },
      { min: 30, max: 50, dose: '200 mg IV once', severity: 'caution' },
      { min: 10, max: 30, dose: '100 mg IV once', severity: 'caution' },
      { min: null, max: 10, dose: 'Dialysis-specific regimen', severity: 'caution' }
    ],
    source: 'Rapivab prescribing information'
  },

  {
    id: 'entecavir',
    name: 'Entecavir',
    brand: 'Baraclude',
    category: 'Antivirals',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Chronic hepatitis B',
    bands: [
      { min: 50, max: null, dose: '0.5 mg once daily for usual indication', severity: 'ok' },
      { min: 30, max: 50, dose: '0.25 mg once daily or 0.5 mg every 48 hours', severity: 'caution' },
      { min: 10, max: 30, dose: '0.15 mg once daily or 0.5 mg every 72 hours', severity: 'caution' },
      { min: null, max: 10, dose: '0.05 mg once daily or 0.5 mg every 5-7 days; dialysis-specific timing', severity: 'caution' }
    ],
    source: 'Baraclude prescribing information'
  },

  {
    id: 'lamivudine-hiv',
    name: 'Lamivudine',
    brand: 'Epivir',
    category: 'Antivirals',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'HIV infection',
    bands: [
      { min: 50, max: null, dose: '300 mg/day or 150 mg twice daily', severity: 'ok' },
      { min: 30, max: 50, dose: '150 mg once daily', severity: 'caution' },
      { min: 15, max: 30, dose: '100 mg once daily', severity: 'caution' },
      { min: 5, max: 15, dose: '50 mg once daily', severity: 'caution' },
      { min: null, max: 5, dose: '25 mg once daily', severity: 'caution' }
    ],
    source: 'Epivir prescribing information'
  },

  {
    id: 'emtricitabine',
    name: 'Emtricitabine',
    brand: 'Emtriva',
    category: 'Antivirals',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'HIV infection',
    bands: [
      { min: 50, max: null, dose: '200 mg once daily', severity: 'ok' },
      { min: 30, max: 50, dose: '200 mg every 48 hours', severity: 'caution' },
      { min: 15, max: 30, dose: '200 mg every 72 hours', severity: 'caution' },
      { min: null, max: 15, dose: '200 mg every 96 hours; dialysis-specific timing', severity: 'caution' }
    ],
    source: 'Emtriva prescribing information'
  },

  {
    id: 'valganciclovir',
    name: 'Valganciclovir',
    brand: 'Valcyte',
    category: 'Antivirals',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'CMV treatment / prophylaxis',
    bands: [
      { min: 60, max: null, dose: '900 mg twice daily for treatment; indication-specific prophylaxis dose', severity: 'ok' },
      { min: 40, max: 60, dose: '450 mg twice daily for treatment', severity: 'caution' },
      { min: 25, max: 40, dose: '450 mg once daily for treatment', severity: 'caution' },
      { min: 10, max: 25, dose: '450 mg every 2 days for treatment', severity: 'caution' },
      { min: null, max: 10, dose: 'Avoid tablets / use formulation-specific specialist dosing', severity: 'avoid' }
    ],
    notes: 'Treatment and maintenance/prophylaxis tables differ.',
    source: 'Valcyte prescribing information'
  },

  {
    id: 'nirmatrelvir-ritonavir',
    name: 'Nirmatrelvir/ritonavir',
    brand: 'Paxlovid',
    category: 'Antivirals',
    metric: 'egfr',
    weightBasis: 'standard',
    indication: 'COVID-19 treatment',
    bands: [
      { min: 60, max: null, dose: 'Standard dose regimen twice daily for 5 days', severity: 'ok' },
      { min: 30, max: 60, dose: 'Reduced nirmatrelvir dose with ritonavir twice daily for 5 days', severity: 'caution' },
      { min: null, max: 30, dose: 'Use current severe-renal-impairment regimen if applicable', severity: 'caution' }
    ],
    notes: 'Verify current product labeling because the severe-renal-impairment regimen has changed over time.',
    source: 'Paxlovid prescribing information'
  },

  /* =========================================================== NEUROLOGY */

  {
    id: 'gabapentin',
    name: 'Gabapentin',
    brand: 'Neurontin',
    category: 'Neurology / Pain',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Neuropathic pain / seizures',
    bands: [
      { min: 60, max: null, dose: '900-3600 mg/day in divided doses', severity: 'ok' },
      { min: 30, max: 60, dose: '400-1400 mg/day in divided doses', severity: 'caution' },
      { min: 15, max: 30, dose: '200-700 mg/day', severity: 'caution' },
      { min: null, max: 15, dose: '100-300 mg/day; further reduction may be required', severity: 'caution' }
    ],
    notes: 'Hemodialysis requires a supplemental post-dialysis dose.',
    source: 'Neurontin prescribing information'
  },

  {
    id: 'pregabalin',
    name: 'Pregabalin',
    brand: 'Lyrica',
    category: 'Neurology / Pain',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Neuropathic pain / seizures',
    bands: [
      { min: 60, max: null, dose: 'Usual indication-specific dose', severity: 'ok' },
      { min: 30, max: 60, dose: 'Reduce total daily dose according to indication', severity: 'caution' },
      { min: 15, max: 30, dose: 'Reduce total daily dose according to indication', severity: 'caution' },
      { min: null, max: 15, dose: 'Further dose reduction; dialysis supplemental dose may be required', severity: 'caution' }
    ],
    notes: 'Dose must be selected from the indication-specific table.',
    source: 'Lyrica prescribing information'
  },

  {
    id: 'levetiracetam',
    name: 'Levetiracetam',
    brand: 'Keppra',
    category: 'Neurology / Pain',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Seizures',
    bands: [
      { min: 80, max: null, dose: '500-1500 mg twice daily', severity: 'ok' },
      { min: 50, max: 80, dose: '500-1000 mg twice daily', severity: 'caution' },
      { min: 30, max: 50, dose: '250-750 mg twice daily', severity: 'caution' },
      { min: null, max: 30, dose: '250-500 mg twice daily', severity: 'caution' }
    ],
    notes: 'Hemodialysis patients require a supplemental post-dialysis dose.',
    source: 'Keppra prescribing information'
  },

  {
    id: 'topiramate',
    name: 'Topiramate',
    brand: 'Topamax',
    category: 'Neurology / Pain',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Seizures / migraine prevention',
    bands: [
      { min: 70, max: null, dose: 'Usual dosing', severity: 'ok' },
      {
        min: null,
        max: 70,
        dose: 'Use approximately one-half the usual adult starting and maintenance dose; titrate more slowly',
        severity: 'caution'
      }
    ],
    notes: 'Hemodialysis may require a supplemental dose.',
    source: 'Topamax prescribing information'
  },

  {
    id: 'amantadine',
    name: 'Amantadine',
    brand: 'Symmetrel',
    category: 'Neurology / Pain',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Parkinsonism / influenza A',
    bands: [
      { min: 50, max: null, dose: 'Usual dosing', severity: 'ok' },
      { min: 30, max: 50, dose: 'Reduce dose or extend interval', severity: 'caution' },
      { min: 15, max: 30, dose: 'Further dose/interval reduction', severity: 'caution' },
      { min: null, max: 15, dose: 'Very low dose/extended interval', severity: 'caution' }
    ],
    notes: 'Substantial renal clearance; toxicity can occur with accumulation.',
    source: 'Amantadine prescribing information'
  },

  {
    id: 'memantine',
    name: 'Memantine',
    brand: 'Namenda',
    category: 'Neurology / Pain',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Moderate-to-severe Alzheimer disease',
    bands: [
      { min: 50, max: null, dose: 'Usual target dose', severity: 'ok' },
      { min: null, max: 50, dose: 'Use lower target dose; severe renal impairment has a lower maximum', severity: 'caution' }
    ],
    notes: 'Exact maximum depends on formulation and renal impairment severity.',
    source: 'Namenda prescribing information'
  },

  {
    id: 'pramipexole',
    name: 'Pramipexole',
    brand: 'Mirapex',
    category: 'Neurology / Pain',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Parkinson disease',
    bands: [
      { min: 60, max: null, dose: 'Usual titration', severity: 'ok' },
      { min: 30, max: 60, dose: 'Start lower and titrate more slowly', severity: 'caution' },
      { min: null, max: 30, dose: 'Further reduction and slower titration', severity: 'caution' }
    ],
    source: 'Mirapex prescribing information'
  },

  /* ============================================================ PSYCHIATRY */

  {
    id: 'lithium',
    name: 'Lithium',
    brand: 'Lithobid / Eskalith',
    category: 'Psychiatry',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Bipolar disorder',
    bands: [
      { min: 60, max: null, dose: 'Individualize to serum concentration and clinical response', severity: 'ok' },
      { min: null, max: 60, dose: 'Use lower dose and/or longer interval with close serum concentration and renal monitoring', severity: 'caution' }
    ],
    notes: 'No simple universal CrCl-to-dose table; requires therapeutic drug monitoring.',
    source: 'Lithium prescribing information'
  },

  {
    id: 'venlafaxine',
    name: 'Venlafaxine',
    brand: 'Effexor XR',
    category: 'Psychiatry',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Depression / anxiety disorders',
    bands: [
      { min: 70, max: null, dose: 'Usual dose', severity: 'ok' },
      { min: 30, max: 70, dose: 'Reduce total daily dose by 25-50%', severity: 'caution' },
      { min: null, max: 30, dose: 'Reduce total daily dose by 50% or more', severity: 'caution' }
    ],
    source: 'Effexor XR prescribing information'
  },

  {
    id: 'desvenlafaxine',
    name: 'Desvenlafaxine',
    brand: 'Pristiq',
    category: 'Psychiatry',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Major depressive disorder',
    bands: [
      { min: 50, max: null, dose: '50 mg once daily', severity: 'ok' },
      { min: 30, max: 50, dose: '50 mg once daily; dose escalation generally not recommended', severity: 'caution' },
      { min: null, max: 30, dose: '50 mg once daily; dose escalation not recommended', severity: 'caution' }
    ],
    notes: 'Renal impairment may require less frequent dosing in some labeling contexts.',
    source: 'Pristiq prescribing information'
  },

  /* =============================================================== PAIN */

  {
    id: 'morphine',
    name: 'Morphine',
    brand: null,
    category: 'Neurology / Pain',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Pain',
    bands: [
      { min: 50, max: null, dose: 'Usual dosing', severity: 'ok' },
      { min: 10, max: 50, dose: 'Reduce dose and/or extend interval; individualize', severity: 'caution' },
      { min: null, max: 10, dose: 'Avoid when possible; use an alternative opioid', severity: 'avoid' }
    ],
    notes: 'Active/toxic glucuronide metabolites accumulate with renal impairment.',
    source: 'Renal opioid dosing references'
  },

  {
    id: 'tramadol',
    name: 'Tramadol',
    brand: 'Ultram',
    category: 'Neurology / Pain',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Immediate-release pain treatment',
    bands: [
      { min: 30, max: null, dose: 'Usual dosing, subject to product maximum', severity: 'ok' },
      { min: null, max: 30, dose: '50-100 mg every 12 hours; maximum 200 mg/day', severity: 'caution' }
    ],
    notes: 'Extended-release products should not be used when CrCl <30 mL/min.',
    source: 'Ultram prescribing information'
  },

  {
    id: 'hydromorphone',
    name: 'Hydromorphone',
    brand: 'Dilaudid',
    category: 'Neurology / Pain',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Pain',
    bands: [
      { min: 50, max: null, dose: 'Usual dosing', severity: 'ok' },
      { min: 10, max: 50, dose: 'Start at reduced dose and titrate carefully', severity: 'caution' },
      { min: null, max: 10, dose: 'Use substantially reduced dose and close monitoring', severity: 'caution' }
    ],
    notes: 'Hydromorphone metabolite can accumulate in renal impairment.',
    source: 'Renal opioid dosing references'
  },

  {
    id: 'codeine',
    name: 'Codeine',
    brand: null,
    category: 'Neurology / Pain',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Pain / cough',
    bands: [
      { min: 50, max: null, dose: 'Usual dosing', severity: 'ok' },
      { min: 10, max: 50, dose: 'Reduce dose and/or extend interval', severity: 'caution' },
      { min: null, max: 10, dose: 'Avoid when possible', severity: 'avoid' }
    ],
    notes: 'Active metabolites can accumulate in renal impairment.',
    source: 'Renal opioid dosing references'
  },

  /* ======================================================== GOUT / RHEUM */

  {
    id: 'allopurinol',
    name: 'Allopurinol',
    brand: 'Zyloprim',
    category: 'Gout / Rheumatology',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Gout / hyperuricemia',
    bands: [
      { min: 50, max: null, dose: 'Start low and titrate to serum urate target', severity: 'ok' },
      { min: 10, max: 50, dose: 'Start low and titrate slowly with monitoring', severity: 'caution' },
      { min: null, max: 10, dose: 'Start very low and titrate slowly with close monitoring', severity: 'caution' }
    ],
    notes: 'Treat-to-target titration is preferred over rigid historic maintenance-dose ceilings.',
    source: 'ACR gout guideline; allopurinol prescribing information'
  },

  {
    id: 'colchicine-gout',
    name: 'Colchicine',
    brand: 'Colcrys',
    category: 'Gout / Rheumatology',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Gout flare / prophylaxis',
    bands: [
      { min: 30, max: null, dose: 'Usual regimen according to indication', severity: 'ok' },
      { min: null, max: 30, dose: 'Dose/repeat-course restrictions apply; severe renal impairment requires individualized dosing', severity: 'caution' }
    ],
    notes: 'CYP3A4/P-gp interactions can substantially increase toxicity in renal impairment.',
    source: 'Colcrys prescribing information'
  },

  {
    id: 'methotrexate-rheum',
    name: 'Methotrexate',
    brand: 'Rheumatrex / Trexall',
    category: 'Gout / Rheumatology',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Rheumatologic disease',
    bands: [
      { min: 60, max: null, dose: 'Usual regimen with routine monitoring', severity: 'ok' },
      { min: 30, max: 60, dose: 'Reduce dose and monitor closely', severity: 'caution' },
      { min: null, max: 30, dose: 'Generally avoid depending on regimen', severity: 'avoid' }
    ],
    notes: 'High-dose oncology regimens require a separate protocol.',
    source: 'Methotrexate prescribing information'
  },

  /* ================================================================ GI */

  {
    id: 'famotidine',
    name: 'Famotidine',
    brand: 'Pepcid',
    category: 'Gastrointestinal',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Acid-related disorders',
    bands: [
      { min: 60, max: null, dose: 'Usual regimen', severity: 'ok' },
      { min: null, max: 60, dose: 'Reduce dose and/or extend interval according to indication', severity: 'caution' }
    ],
    notes: 'Exact renal adjustment differs by indication and dosage form.',
    source: 'Pepcid prescribing information'
  },

  {
    id: 'metoclopramide',
    name: 'Metoclopramide',
    brand: 'Reglan',
    category: 'Gastrointestinal',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Gastroparesis / GERD',
    bands: [
      { min: 60, max: null, dose: 'Usual indication-specific dose', severity: 'ok' },
      { min: 30, max: 60, dose: 'Reduce dose', severity: 'caution' },
      { min: 15, max: 30, dose: 'Reduce dose substantially', severity: 'caution' },
      { min: null, max: 15, dose: 'Further reduction required', severity: 'caution' }
    ],
    notes: 'Accumulation increases risk of extrapyramidal effects.',
    source: 'Reglan prescribing information'
  },

  /* ============================================================= ONCOLOGY */

  {
    id: 'pemetrexed',
    name: 'Pemetrexed',
    brand: 'Alimta',
    category: 'Oncology',
    metric: 'crcl',
    weightBasis: 'abw',
    indication: 'Non-small cell lung cancer / mesothelioma',
    bands: [
      { min: 45, max: null, dose: 'Full dose according to regimen', severity: 'ok' },
      { min: null, max: 45, dose: 'Not recommended', severity: 'avoid' }
    ],
    notes: 'Labeling uses Cockcroft-Gault with actual body weight.',
    source: 'Alimta prescribing information'
  },

  {
    id: 'carboplatin',
    name: 'Carboplatin',
    brand: 'Paraplatin',
    category: 'Oncology',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Oncology',
    bands: [
      { min: 60, max: null, dose: 'Dose using indication-specific Calvert formula', severity: 'ok' },
      { min: null, max: 60, dose: 'Dose using renal function in Calvert formula; protocol-specific', severity: 'caution' }
    ],
    notes: 'Dose (mg) = target AUC × (GFR + 25).',
    source: 'Carboplatin prescribing information'
  },

  {
    id: 'capecitabine',
    name: 'Capecitabine',
    brand: 'Xeloda',
    category: 'Oncology',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Oncology',
    bands: [
      { min: 50, max: null, dose: 'Usual starting dose according to regimen', severity: 'ok' },
      { min: 30, max: 50, dose: 'Reduce starting dose to 75% of usual', severity: 'caution' },
      { min: null, max: 30, dose: 'Contraindicated', severity: 'avoid' }
    ],
    source: 'Xeloda prescribing information'
  },

  {
    id: 'fludarabine',
    name: 'Fludarabine',
    brand: 'Fludara',
    category: 'Oncology',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Oncology',
    bands: [
      { min: 70, max: null, dose: 'Usual regimen', severity: 'ok' },
      { min: 30, max: 70, dose: 'Dose reduction required', severity: 'caution' },
      { min: null, max: 30, dose: 'Contraindicated / not recommended', severity: 'avoid' }
    ],
    source: 'Fludara prescribing information'
  },

  /* ====================================================== BONE / MINERAL */

  {
    id: 'zoledronic-acid-nononc',
    name: 'Zoledronic acid (non-oncologic)',
    brand: 'Reclast',
    category: 'Bone / Mineral',
    metric: 'crcl',
    weightBasis: 'abw',
    indication: 'Osteoporosis / Paget disease',
    bands: [
      { min: 35, max: null, dose: '5 mg IV once yearly', severity: 'ok' },
      { min: null, max: 35, dose: 'Contraindicated', severity: 'avoid' }
    ],
    notes: 'Labeling uses Cockcroft-Gault with actual body weight. Oncologic zoledronic acid has different dosing.',
    source: 'Reclast prescribing information'
  },

  {
    id: 'alendronate',
    name: 'Alendronate',
    brand: 'Fosamax',
    category: 'Bone / Mineral',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Osteoporosis',
    bands: [
      { min: 35, max: null, dose: 'Usual regimen', severity: 'ok' },
      { min: null, max: 35, dose: 'Not recommended', severity: 'avoid' }
    ],
    source: 'Fosamax prescribing information'
  },

  {
    id: 'risedronate',
    name: 'Risedronate',
    brand: 'Actonel',
    category: 'Bone / Mineral',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Osteoporosis',
    bands: [
      { min: 30, max: null, dose: 'Usual regimen', severity: 'ok' },
      { min: null, max: 30, dose: 'Not recommended', severity: 'avoid' }
    ],
    source: 'Actonel prescribing information'
  },

  /* ================================================================ UROLOGY */

  {
    id: 'trospium',
    name: 'Trospium',
    brand: 'Sanctura',
    category: 'Urologic',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Overactive bladder',
    bands: [
      { min: 30, max: null, dose: 'Usual dosing according to formulation', severity: 'ok' },
      { min: null, max: 30, dose: 'Reduce immediate-release dose to 20 mg once daily at bedtime', severity: 'caution' }
    ],
    notes: 'Extended-release formulation is not recommended in severe renal impairment.',
    source: 'Sanctura prescribing information'
  },

  {
    id: 'mirabegron',
    name: 'Mirabegron',
    brand: 'Myrbetriq',
    category: 'Urologic',
    metric: 'egfr',
    weightBasis: 'standard',
    indication: 'Overactive bladder',
    bands: [
      { min: 30, max: null, dose: 'Usual dose according to formulation', severity: 'ok' },
      { min: 15, max: 30, dose: 'Maximum dose 25 mg once daily', severity: 'caution' },
      { min: null, max: 15, dose: 'Not recommended', severity: 'avoid' }
    ],
    source: 'Myrbetriq prescribing information'
  },

  /* ============================================================ ADDITIONAL */

  {
    id: 'baclofen',
    name: 'Baclofen',
    brand: 'Lioresal',
    category: 'Neurology / Pain',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Spasticity',
    bands: [
      { min: 80, max: null, dose: 'Usual dosing with titration', severity: 'ok' },
      { min: 30, max: 80, dose: 'Reduce dose and titrate cautiously', severity: 'caution' },
      { min: null, max: 30, dose: 'Avoid when possible because of accumulation and neurotoxicity', severity: 'avoid' }
    ],
    notes: 'Severe toxicity has been reported in advanced CKD.',
    source: 'Renal dosing literature'
  },

  {
    id: 'zoledronic-acid-oncologic',
    name: 'Zoledronic acid (oncologic)',
    brand: 'Zometa',
    category: 'Bone / Mineral',
    metric: 'crcl',
    weightBasis: 'standard',
    indication: 'Multiple myeloma / bone metastases',
    bands: [
      { min: 60, max: null, dose: '4 mg IV', severity: 'ok' },
      { min: 50, max: 60, dose: '3.5 mg IV', severity: 'caution' },
      { min: 40, max: 50, dose: '3.3 mg IV', severity: 'caution' },
      { min: 30, max: 40, dose: '3.0 mg IV', severity: 'caution' },
      { min: null, max: 30, dose: 'Not recommended', severity: 'avoid' }
    ],
    notes: 'Different product/indication from Reclast.',
    source: 'Zometa prescribing information'
  }

];
