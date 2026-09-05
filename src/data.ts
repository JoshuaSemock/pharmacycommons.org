export type EcoRisk = 'negligible' | 'low' | 'moderate' | 'high'
export type DPD = 'low' | 'moderate' | 'high'
export type EntryType = 'drug' | 'substance'
export type Schedule = 'Rx' | 'OTC' | 'Controlled II' | 'Controlled III' | 'Controlled IV' | 'Substance'

// A single ingredient reference inside a formulation. Every formulation lists
// ALL of its active ingredients so combination products (e.g. diphenoxylate/
// atropine, amlodipine/atorvastatin) route correctly from each component's
// own drug page, not just a single "primary" ingredient.
export interface FormulationIngredient {
  apiUid: string
  slug: string
  name: string
  roleNote?: string // e.g. "Beta-lactamase inhibitor", "Abuse-deterrent additament"
}

export interface DrugFormulation {
  brand: string
  form: string
  strength: string
  manufacturer: string
  ndc?: string
  ingredients: FormulationIngredient[]
}

// interactingDrugUid/Slug are only present when the interacting agent is
// itself an entry in Drug_Matrix (a real drug OR a modeled substance like
// alcohol). Interactions with a drug CLASS (e.g. "NSAIDs", "Strong CYP3A4
// inhibitors") aren't a single Drug_Matrix record, so those stay text-only
// (no uid/slug) and render as plain text instead of a link.
export interface DrugInteraction {
  interactingDrugUid?: string
  interactingDrugSlug?: string
  interactingDrugName: string
  severity: 'minor' | 'moderate' | 'major'
  mechanism: string
}

export interface Drug {
  id: string // URL slug — stable, human-readable, never the raw UID
  apiUid: string // real Drug_Matrix UID (API-XXXX). Resolved server-side; the frontend should only need `id`.
  name: string
  synonym?: string
  entryType: EntryType
  isStub?: boolean // true = minimal/pending-curation entry, not yet fully profiled
  schedule: Schedule
  therapeuticArea: string
  classification: {
    mechanism: string[]
    physiologicEffect: string[]
    chemicalClass: string[] // pluralized — some compounds have hybrid chemical classifications
    additionalTags?: string[] // escape hatch for drug classes needing more than the 3 core dimensions
  }
  hierarchy: {
    ingredient: { name: string; cas: string; inchikey: string }
    saltForms: Array<{ name: string; cas: string }>
    formulations: DrugFormulation[]
  }
  clinical: {
    indications: string[]
    dosing: string
    halfLife: string
    proteinBinding: string
    metabolism: string
    bioavailability: string
    renalExcretion: string
    interactions: DrugInteraction[]
  }
  eco: {
    mec: number
    pec: number
    rq: number
    risk: EcoRisk
    dpd: DPD
    excretionRoute: string
    primaryConcern: string
    notes: string
  }
  description: string
}

export const DRUGS: Drug[] = [
  {
    id: 'metformin',
    apiUid: 'API-0001',
    name: 'Metformin',
    entryType: 'drug',
    schedule: 'Rx',
    therapeuticArea: 'Endocrinology',
    description: 'Second-line antidiabetic for type 2 diabetes mellitus. Traditionally used as a first-line oral medication, guidelines now recommend more effective therapies at initiation, except for in pre-diabetes or when only reduction in blood glucose is indicated. Glucose dependent reduction of hepatic glucose production and improvement of insulin sensitivity.',
    classification: {
      mechanism: ['AMPK Activator', 'Hepatic Gluconeogenesis Inhibitor', 'Mitochondrial Complex I Inhibitor'],
      physiologicEffect: ['Decreased Blood Glucose', 'Improved Insulin Sensitivity', 'Reduced Hepatic Glucose Output'],
      chemicalClass: ['Biguanide'],
    },
    hierarchy: {
      ingredient: { name: 'Metformin', cas: '657-24-9', inchikey: 'XZWYZXLIPXDOLR-UHFFFAOYSA-N' },
      saltForms: [
        { name: 'Metformin hydrochloride', cas: '1115-70-4' },
      ],
      formulations: [
        { brand: 'Glucophage', form: 'Tablet', strength: '500 mg, 850 mg, 1000 mg', manufacturer: 'Bristol-Myers Squibb', ingredients: [{ apiUid: 'API-0001', slug: 'metformin', name: 'Metformin' }] },
        { brand: 'Glucophage XR', form: 'Extended-release tablet', strength: '500 mg, 750 mg', manufacturer: 'Bristol-Myers Squibb', ingredients: [{ apiUid: 'API-0001', slug: 'metformin', name: 'Metformin' }] },
        { brand: 'Glumetza', form: 'Extended-release tablet', strength: '500 mg, 1000 mg', manufacturer: 'Bausch Health', ingredients: [{ apiUid: 'API-0001', slug: 'metformin', name: 'Metformin' }] },
        { brand: 'Fortamet', form: 'Extended-release tablet', strength: '500 mg, 1000 mg', manufacturer: 'Shionogi USA', ingredients: [{ apiUid: 'API-0001', slug: 'metformin', name: 'Metformin' }] },
        { brand: 'Riomet', form: 'Oral solution', strength: '500 mg/5 mL', manufacturer: 'Sun Pharma', ingredients: [{ apiUid: 'API-0001', slug: 'metformin', name: 'Metformin' }] },
      ],
    },
    clinical: {
      indications: ['Type 2 diabetes mellitus (second-line)', 'Prediabetes (off-label)', 'Polycystic ovary syndrome (off-label)', 'Weight management adjunct (off-label)'],
      dosing: 'Initial: 500 mg twice daily or 850 mg once daily with meals. Titrate by 500 mg weekly. Max: 2550 mg/day in divided doses. Standard dose 1000 mg twice daily with extended release formulation.',
      halfLife: '4–9 hours (plasma); 17.6 hours (blood)',
      proteinBinding: 'Negligible',
      metabolism: 'Not metabolized. Excreted unchanged.',
      bioavailability: '50–60% (fasting state)',
      renalExcretion: '>90% unchanged via renal tubular secretion',
      interactions: [
        { interactingDrugUid: 'API-0012', interactingDrugSlug: 'iodinated-contrast-media', interactingDrugName: 'Iodinated contrast media', severity: 'major', mechanism: 'Temporary renal impairment increases risk of lactic acidosis' },
        { interactingDrugUid: 'SUB-0001', interactingDrugSlug: 'alcohol', interactingDrugName: 'Alcohol', severity: 'moderate', mechanism: 'Potentiates lactic acidosis risk; inhibits hepatic gluconeogenesis' },
        { interactingDrugUid: 'API-0011', interactingDrugSlug: 'cimetidine', interactingDrugName: 'Cimetidine', severity: 'moderate', mechanism: 'Inhibits renal tubular secretion, increases metformin plasma levels by ~40%' },
        { interactingDrugName: 'Carbonic anhydrase inhibitors', severity: 'moderate', mechanism: 'Increased risk of metabolic acidosis and lactic acidosis' },
      ],
    },
    eco: {
      mec: 0.04,
      pec: 2.1,
      rq: 52.5,
      risk: 'high',
      dpd: 'high',
      excretionRoute: 'Renal — excreted unchanged (>90%)',
      primaryConcern: 'Aquatic invertebrates and fish endocrine disruption; widespread contamination of surface water and groundwater',
      notes: 'Metformin is among the most frequently detected pharmaceuticals in global waterways. Its high water solubility, minimal protein binding, and lack of hepatic metabolism mean virtually all consumed drug enters wastewater. Guanylurea, a primary transformation product, is more persistent and detected at higher concentrations than the parent compound. Studies report intersex in fish at environmental concentrations.',
    },
  },
  {
    id: 'sertraline',
    apiUid: 'API-0002',
    name: 'Sertraline',
    entryType: 'drug',
    schedule: 'Rx',
    therapeuticArea: 'Psychiatry',
    description: 'Selective serotonin reuptake inhibitor (SSRI) with broad-spectrum efficacy across mood and anxiety disorders. Considered a first-line therapy option for major depressive disorder, however the failure rate typically requires further augmentation of therapy when used at normal doses.',
    classification: {
      mechanism: ['Selective Serotonin Reuptake Inhibitor (SSRI)', 'Sigma-1 Receptor Agonist'],
      physiologicEffect: ['Increased Synaptic Serotonin', 'Anxiolytic Effect', 'Antidepressant Effect'],
      chemicalClass: ['Naphthalenamine'],
    },
    hierarchy: {
      ingredient: { name: 'Sertraline', cas: '79617-96-2', inchikey: 'VGKDLMBJGBXTGI-SJCJKPOMSA-N' },
      saltForms: [
        { name: 'Sertraline hydrochloride', cas: '79559-97-0' },
      ],
      formulations: [
        { brand: 'Zoloft', form: 'Tablet', strength: '25 mg, 50 mg, 100 mg', manufacturer: 'Pfizer', ingredients: [{ apiUid: 'API-0002', slug: 'sertraline', name: 'Sertraline' }] },
        { brand: 'Zoloft', form: 'Oral concentrate', strength: '20 mg/mL', manufacturer: 'Pfizer', ingredients: [{ apiUid: 'API-0002', slug: 'sertraline', name: 'Sertraline' }] },
      ],
    },
    clinical: {
      indications: ['Major depressive disorder (MDD)', 'Obsessive-compulsive disorder (OCD)', 'Panic disorder', 'Post-traumatic stress disorder (PTSD)', 'Social anxiety disorder', 'Premenstrual dysphoric disorder'],
      dosing: 'MDD/OCD: Initial 50 mg/day. Range 50–200 mg/day. Panic/PTSD/social anxiety: Initial 25 mg/day, increase to 50 mg after 1 week.',
      halfLife: '26 hours (sertraline); 62–104 hours (N-desmethylsertraline)',
      proteinBinding: '98%',
      metabolism: 'Extensive hepatic metabolism via CYP2C19, CYP2C9, CYP2D6, CYP3A4',
      bioavailability: '44% (oral)',
      renalExcretion: '<0.2% unchanged in urine',
      interactions: [
        { interactingDrugName: 'MAO inhibitors', severity: 'major', mechanism: 'Risk of serotonin syndrome; contraindicated within 14 days of MAOI use' },
        { interactingDrugName: 'Linezolid', severity: 'major', mechanism: 'Monoamine oxidase inhibition increases serotonin syndrome risk' },
        { interactingDrugName: 'Warfarin', severity: 'moderate', mechanism: 'Serotonin-mediated platelet inhibition increases bleeding risk; may alter warfarin levels' },
        { interactingDrugName: 'Tramadol', severity: 'moderate', mechanism: 'Additive serotonergic effects; risk of serotonin syndrome and seizures' },
      ],
    },
    eco: {
      mec: 0.004,
      pec: 0.023,
      rq: 5.75,
      risk: 'moderate',
      dpd: 'moderate',
      excretionRoute: 'Hepatic metabolism → fecal/renal metabolites',
      primaryConcern: 'Detected in fish brain tissue at environmentally relevant concentrations; behavioral disruption in aquatic wildlife including reduced predator avoidance',
      notes: 'SSRIs enter aquatic systems primarily via wastewater effluent. While sertraline undergoes extensive metabolism, its high lipophilicity (logP ~5.0) promotes bioaccumulation in aquatic biota. Studies have detected sertraline and N-desmethylsertraline in the brains and livers of wild fish. Behavioral effects — including altered aggression, feeding, and anti-predator response — are documented at ng/L to μg/L concentrations.',
    },
  },
  {
    id: 'lisinopril',
    apiUid: 'API-0003',
    name: 'Lisinopril',
    entryType: 'drug',
    schedule: 'Rx',
    therapeuticArea: 'Cardiology',
    description: 'Long-acting ACE inhibitor for hypertension, heart failure, and post-MI cardioprotection. Unlike most ACE inhibitors, lisinopril is not a prodrug.',
    classification: {
      mechanism: ['ACE Inhibitor', 'Renin-Angiotensin-Aldosterone System (RAAS) Inhibitor'],
      physiologicEffect: ['Decreased Blood Pressure', 'Reduced Preload and Afterload', 'Cardioprotective Effect', 'Renoprotective Effect'],
      chemicalClass: ['Lysine analog (non-prodrug ACE inhibitor)'],
    },
    hierarchy: {
      ingredient: { name: 'Lisinopril', cas: '76547-98-3', inchikey: 'RLAWWYSOJDYHDC-BZSNNMDCSA-N' },
      saltForms: [
        { name: 'Lisinopril dihydrate', cas: '83915-83-7' },
      ],
      formulations: [
        { brand: 'Prinivil', form: 'Tablet', strength: '5 mg, 10 mg, 20 mg, 40 mg', manufacturer: 'Merck', ingredients: [{ apiUid: 'API-0003', slug: 'lisinopril', name: 'Lisinopril' }] },
        { brand: 'Zestril', form: 'Tablet', strength: '2.5 mg, 5 mg, 10 mg, 20 mg, 30 mg, 40 mg', manufacturer: 'AstraZeneca', ingredients: [{ apiUid: 'API-0003', slug: 'lisinopril', name: 'Lisinopril' }] },
        { brand: 'Qbrelis', form: 'Oral solution', strength: '1 mg/mL', manufacturer: 'Azurity Pharmaceuticals', ingredients: [{ apiUid: 'API-0003', slug: 'lisinopril', name: 'Lisinopril' }] },
      ],
    },
    clinical: {
      indications: ['Hypertension', 'Heart failure (adjunctive)', 'Acute MI (within 24 hours)', 'Diabetic nephropathy (off-label)'],
      dosing: 'HTN: Initial 10 mg/day; range 20–40 mg/day. HF: Initial 2.5–5 mg/day; target 20–40 mg/day. Post-MI: 5 mg within 24h, then titrate.',
      halfLife: '12 hours (effective); accumulation half-life up to 30 hours',
      proteinBinding: '0% (does not bind plasma proteins)',
      metabolism: 'Not metabolized',
      bioavailability: '25% (variable 6–60%)',
      renalExcretion: '100% unchanged',
      interactions: [
        { interactingDrugName: 'Potassium-sparing diuretics', severity: 'moderate', mechanism: 'Additive hyperkalemia risk via RAAS blockade' },
        { interactingDrugName: 'NSAIDs', severity: 'moderate', mechanism: 'Attenuate antihypertensive effect; increase nephrotoxicity risk' },
        { interactingDrugName: 'Aliskiren (diabetic/renal patients)', severity: 'major', mechanism: 'Dual RAAS blockade; increased hypotension, hyperkalemia, renal impairment' },
        { interactingDrugName: 'Sacubitril/valsartan', severity: 'major', mechanism: 'Risk of angioedema from combined NEP/ACE inhibition; contraindicated within 36 hours' },
      ],
    },
    eco: {
      mec: 0.10,
      pec: 0.001,
      rq: 0.01,
      risk: 'negligible',
      dpd: 'low',
      excretionRoute: 'Renal — excreted unchanged',
      primaryConcern: 'Negligible environmental risk at current detected concentrations',
      notes: 'Lisinopril is detected at very low concentrations in surface water (sub-ng/L range). Despite renal excretion unchanged, environmental concentrations remain far below predicted no-effect concentrations for aquatic organisms. Hydrolyzes under environmental conditions, further reducing persistence.',
    },
  },
  {
    id: 'amoxicillin',
    apiUid: 'API-0004',
    name: 'Amoxicillin',
    entryType: 'drug',
    schedule: 'Rx',
    therapeuticArea: 'Infectious Disease',
    description: 'Broad-spectrum aminopenicillin antibiotic. First-line therapy for many community-acquired bacterial infections. Excellent oral bioavailability distinguishes it from ampicillin.',
    classification: {
      mechanism: ['Beta-lactam', 'Penicillin-binding Protein (PBP) Inhibitor', 'Cell Wall Synthesis Inhibitor'],
      physiologicEffect: ['Bactericidal Activity', 'Bacterial Cell Lysis', 'Inhibition of Transpeptidation'],
      chemicalClass: ['Aminopenicillin'],
    },
    hierarchy: {
      ingredient: { name: 'Amoxicillin', cas: '26787-78-0', inchikey: 'LSQZJLSUYDQPKJ-NJBDSQKTSA-N' },
      saltForms: [
        { name: 'Amoxicillin trihydrate', cas: '61336-70-7' },
        { name: 'Amoxicillin sodium', cas: '34642-77-8' },
      ],
      formulations: [
        { brand: 'Amoxil', form: 'Capsule', strength: '250 mg, 500 mg', manufacturer: 'GSK', ingredients: [{ apiUid: 'API-0004', slug: 'amoxicillin', name: 'Amoxicillin' }] },
        { brand: 'Amoxil', form: 'Chewable tablet', strength: '125 mg, 250 mg', manufacturer: 'GSK', ingredients: [{ apiUid: 'API-0004', slug: 'amoxicillin', name: 'Amoxicillin' }] },
        { brand: 'Amoxil', form: 'Oral suspension', strength: '125 mg/5 mL, 250 mg/5 mL', manufacturer: 'GSK', ingredients: [{ apiUid: 'API-0004', slug: 'amoxicillin', name: 'Amoxicillin' }] },
        {
          brand: 'Augmentin', form: 'Tablet (combination)', strength: '500/125 mg, 875/125 mg (amox/clav)', manufacturer: 'GSK',
          ingredients: [
            { apiUid: 'API-0004', slug: 'amoxicillin', name: 'Amoxicillin' },
            { apiUid: 'API-0008', slug: 'clavulanate', name: 'Clavulanate', roleNote: 'Beta-lactamase inhibitor' },
          ],
        },
      ],
    },
    clinical: {
      indications: ['Otitis media', 'Sinusitis', 'Pharyngitis (Group A Strep)', 'Community-acquired pneumonia', 'Urinary tract infections', 'H. pylori eradication (combination)'],
      dosing: 'Adults: 250–500 mg every 8h or 500–875 mg every 12h. Severe infections: 875 mg every 12h. Pediatric: 25–90 mg/kg/day divided.',
      halfLife: '1–1.5 hours',
      proteinBinding: '17–20%',
      metabolism: 'Minimal hepatic metabolism (~20%). Primarily excreted unchanged.',
      bioavailability: '74–92% (oral, food-independent)',
      renalExcretion: '60–80% unchanged via glomerular filtration and tubular secretion',
      interactions: [
        { interactingDrugName: 'Warfarin', severity: 'moderate', mechanism: 'Alteration of gut flora reduces vitamin K production, may enhance anticoagulant effect' },
        { interactingDrugName: 'Methotrexate', severity: 'moderate', mechanism: 'Competition for renal tubular secretion increases methotrexate toxicity risk' },
        { interactingDrugName: 'Oral contraceptives', severity: 'minor', mechanism: 'Theoretical reduction in enterohepatic recycling of estrogens (clinical significance disputed)' },
        { interactingDrugName: 'Probenecid', severity: 'minor', mechanism: 'Blocks renal tubular secretion, increases and prolongs amoxicillin levels' },
      ],
    },
    eco: {
      mec: 0.25,
      pec: 0.12,
      rq: 0.48,
      risk: 'low',
      dpd: 'low',
      excretionRoute: 'Renal (60–80% unchanged) + fecal',
      primaryConcern: 'Antimicrobial resistance selection pressure; promotes resistance gene dissemination in aquatic microbiomes even at sub-inhibitory concentrations',
      notes: 'Though the RQ for direct toxicity is low, amoxicillin and other beta-lactams pose an indirect ecological risk through antimicrobial resistance (AMR) promotion. Sub-inhibitory concentrations detected in waterways can drive horizontal gene transfer of resistance elements. Wastewater treatment plants remove 60–80% of amoxicillin, but activated sludge may itself become a resistance reservoir. Hydrolysis in water (t½ 1–7 days pH-dependent) limits persistence, but resistance genes persist far longer.',
    },
  },
  {
    id: 'atorvastatin',
    apiUid: 'API-0005',
    name: 'Atorvastatin',
    entryType: 'drug',
    schedule: 'Rx',
    therapeuticArea: 'Cardiology',
    description: 'High-intensity HMG-CoA reductase inhibitor for dyslipidemia and cardiovascular risk reduction. Most prescribed statin worldwide, with robust cardiovascular outcomes data.',
    classification: {
      mechanism: ['HMG-CoA Reductase Inhibitor', 'Statin'],
      physiologicEffect: ['LDL Reduction (up to 60%)', 'HDL Elevation', 'Triglyceride Reduction', 'Plaque Stabilization', 'Anti-inflammatory Effect'],
      chemicalClass: ['Synthetic fluorophenyl-substituted pyrrole'],
    },
    hierarchy: {
      ingredient: { name: 'Atorvastatin', cas: '134523-00-5', inchikey: 'XUKUURHRXDUEBC-KAYWLYCHSA-N' },
      saltForms: [
        { name: 'Atorvastatin calcium', cas: '134523-03-8' },
      ],
      formulations: [
        { brand: 'Lipitor', form: 'Tablet', strength: '10 mg, 20 mg, 40 mg, 80 mg', manufacturer: 'Pfizer', ingredients: [{ apiUid: 'API-0005', slug: 'atorvastatin', name: 'Atorvastatin' }] },
        {
          brand: 'Caduet', form: 'Tablet (combination)', strength: '5/10 to 10/80 mg (amlodipine/atorvastatin)', manufacturer: 'Pfizer',
          ingredients: [
            { apiUid: 'API-0007', slug: 'amlodipine', name: 'Amlodipine', roleNote: 'Calcium channel blocker component' },
            { apiUid: 'API-0005', slug: 'atorvastatin', name: 'Atorvastatin' },
          ],
        },
      ],
    },
    clinical: {
      indications: ['Primary hypercholesterolemia', 'Mixed dyslipidemia', 'Primary prevention of cardiovascular events (high-risk)', 'Secondary prevention post-ACS/MI', 'Familial hypercholesterolemia'],
      dosing: 'Initial: 10–20 mg/day. High-intensity: 40–80 mg/day. Evening dosing no longer required (long half-life of active metabolites).',
      halfLife: '14 hours (atorvastatin); 20–30 hours (active metabolites)',
      proteinBinding: '>98%',
      metabolism: 'Extensive hepatic first-pass via CYP3A4; active metabolites ortho- and parahydroxyatorvastatin',
      bioavailability: '12% (extensive first-pass)',
      renalExcretion: '<2% unchanged',
      interactions: [
        { interactingDrugName: 'Strong CYP3A4 inhibitors (clarithromycin, itraconazole)', severity: 'major', mechanism: 'Markedly increased atorvastatin exposure; increased myopathy/rhabdomyolysis risk' },
        { interactingDrugName: 'Gemfibrozil', severity: 'major', mechanism: 'Inhibition of glucuronidation and OATP1B1; significantly elevated statin levels' },
        { interactingDrugName: 'Cyclosporine', severity: 'major', mechanism: 'OATP1B1 inhibition increases systemic exposure; cap at 10 mg/day' },
        { interactingDrugName: 'Rifampin', severity: 'moderate', mechanism: 'CYP3A4 induction reduces atorvastatin levels significantly' },
      ],
    },
    eco: {
      mec: 0.010,
      pec: 0.003,
      rq: 0.30,
      risk: 'low',
      dpd: 'low',
      excretionRoute: 'Biliary/fecal (primarily as metabolites)',
      primaryConcern: 'Low detected environmental concentrations; potential endocrine signaling effects on aquatic organisms at higher loads',
      notes: 'Atorvastatin is extensively metabolized and excreted primarily via bile/feces, limiting direct renal input to aquatic systems. Detected concentrations in surface water are well below effect thresholds. Wastewater treatment is effective at removing statins. Ecotoxicological risk at current environmental concentrations is considered low, though cholesterol biosynthesis inhibition in aquatic invertebrates warrants continued monitoring.',
    },
  },
  {
    id: 'ibuprofen',
    apiUid: 'API-0006',
    name: 'Ibuprofen',
    entryType: 'drug',
    schedule: 'OTC',
    therapeuticArea: 'Rheumatology / Analgesia',
    description: 'Non-selective COX-1 and COX-2 inhibitor with analgesic, anti-inflammatory, and antipyretic activity. Among the most widely used pharmaceuticals globally.',
    classification: {
      mechanism: ['Cyclooxygenase (COX-1/COX-2) Inhibitor', 'Prostaglandin Synthesis Inhibitor'],
      physiologicEffect: ['Analgesia', 'Anti-inflammatory Effect', 'Antipyresis', 'Platelet Aggregation Inhibition'],
      chemicalClass: ['Propionic acid NSAID'],
    },
    hierarchy: {
      ingredient: { name: 'Ibuprofen', cas: '15687-27-1', inchikey: 'HEFNNWSXXWATRW-UHFFFAOYSA-N' },
      saltForms: [
        { name: 'Ibuprofen sodium', cas: '31121-93-4' },
        { name: 'Ibuprofen lysine', cas: '57469-77-9' },
        { name: 'Ibuprofen arginine', cas: '57775-29-8' },
      ],
      formulations: [
        { brand: 'Advil', form: 'Tablet', strength: '200 mg', manufacturer: 'Haleon', ingredients: [{ apiUid: 'API-0006', slug: 'ibuprofen', name: 'Ibuprofen' }] },
        { brand: 'Motrin IB', form: 'Tablet', strength: '200 mg', manufacturer: 'Johnson & Johnson', ingredients: [{ apiUid: 'API-0006', slug: 'ibuprofen', name: 'Ibuprofen' }] },
        { brand: 'Motrin', form: 'Oral suspension', strength: '100 mg/5 mL', manufacturer: 'Johnson & Johnson', ingredients: [{ apiUid: 'API-0006', slug: 'ibuprofen', name: 'Ibuprofen' }] },
        { brand: 'Caldolor', form: 'IV solution', strength: '100 mg/mL', manufacturer: 'Cumberland Pharmaceuticals', ingredients: [{ apiUid: 'API-0006', slug: 'ibuprofen', name: 'Ibuprofen' }] },
        { brand: 'NeoProfen', form: 'IV solution', strength: '17.1 mg/mL (ibuprofen lysine)', manufacturer: 'Recordati', ingredients: [{ apiUid: 'API-0006', slug: 'ibuprofen', name: 'Ibuprofen' }] },
      ],
    },
    clinical: {
      indications: ['Mild-to-moderate pain', 'Dysmenorrhea', 'Fever', 'Osteoarthritis', 'Rheumatoid arthritis', 'Patent ductus arteriosus (IV, neonatal)'],
      dosing: 'OTC analgesic/antipyretic: 200–400 mg every 4–6h (max 1200 mg/day). Rx anti-inflammatory: 400–800 mg every 6–8h (max 3200 mg/day).',
      halfLife: '1.8–2.5 hours',
      proteinBinding: '99%',
      metabolism: 'Hepatic via CYP2C9; inactive metabolites (hydroxy-, carboxy-ibuprofen)',
      bioavailability: '80–100% (oral)',
      renalExcretion: '45–60% as metabolites; <1% unchanged',
      interactions: [
        { interactingDrugName: 'Aspirin (antiplatelet doses)', severity: 'moderate', mechanism: 'Competitive COX-1 binding may negate aspirin cardioprotection' },
        { interactingDrugName: 'Lithium', severity: 'moderate', mechanism: 'Reduced renal lithium clearance; can increase lithium to toxic levels' },
        { interactingDrugName: 'Methotrexate', severity: 'major', mechanism: 'Reduced renal elimination; elevated methotrexate toxicity risk' },
        { interactingDrugName: 'ACE inhibitors/ARBs', severity: 'moderate', mechanism: 'Attenuates antihypertensive effect; risk of acute kidney injury' },
      ],
    },
    eco: {
      mec: 0.010,
      pec: 1.0,
      rq: 100,
      risk: 'high',
      dpd: 'moderate',
      excretionRoute: 'Renal (60–90% as metabolites)',
      primaryConcern: 'One of most frequently detected pharmaceuticals in global waterways; documented inhibition of prostaglandin synthesis in aquatic invertebrates and fish reproduction',
      notes: 'Ibuprofen is detected in rivers, lakes, and coastal waters globally at concentrations of 0.1–10 μg/L. Its OTC status and extremely high consumption volumes make it a priority aquatic contaminant. Conventional wastewater treatment removes 60–90% but fails at high-load events. Ibuprofen inhibits prostaglandin synthesis in aquatic organisms, affecting reproduction, osmoregulation, and stress responses. Photodegradation in surface water produces hydroxylated metabolites with similar bioactivity.',
    },
  },

  // ── New entries added to demonstrate multi-ingredient formulations and
  // linked interactions. isStub entries carry minimal-but-accurate data
  // pending full curation from openFDA ingestion — they exist so the linking
  // pattern is real and testable, not so every field is production-complete.

  {
    id: 'amlodipine',
    apiUid: 'API-0007',
    name: 'Amlodipine',
    entryType: 'drug',
    isStub: true,
    schedule: 'Rx',
    therapeuticArea: 'Cardiology',
    description: 'Long-acting dihydropyridine calcium channel blocker used for hypertension and chronic stable/vasospastic angina. Combined with atorvastatin in Caduet.',
    classification: {
      mechanism: ['L-type Calcium Channel Blocker'],
      physiologicEffect: ['Vasodilation', 'Decreased Blood Pressure'],
      chemicalClass: ['Dihydropyridine'],
    },
    hierarchy: {
      ingredient: { name: 'Amlodipine', cas: '88150-42-9', inchikey: 'HTIQEAQVCYTUBX-UHFFFAOYSA-N' },
      saltForms: [{ name: 'Amlodipine besylate', cas: '111470-99-6' }],
      formulations: [
        { brand: 'Norvasc', form: 'Tablet', strength: '2.5 mg, 5 mg, 10 mg', manufacturer: 'Pfizer', ingredients: [{ apiUid: 'API-0007', slug: 'amlodipine', name: 'Amlodipine' }] },
        {
          brand: 'Caduet', form: 'Tablet (combination)', strength: '5/10 to 10/80 mg (amlodipine/atorvastatin)', manufacturer: 'Pfizer',
          ingredients: [
            { apiUid: 'API-0007', slug: 'amlodipine', name: 'Amlodipine' },
            { apiUid: 'API-0005', slug: 'atorvastatin', name: 'Atorvastatin', roleNote: 'Statin component' },
          ],
        },
      ],
    },
    clinical: {
      indications: ['Hypertension', 'Chronic stable angina', 'Vasospastic (Prinzmetal) angina'],
      dosing: 'Initial 5 mg once daily; max 10 mg/day.',
      halfLife: '30–50 hours',
      proteinBinding: '~93%',
      metabolism: 'Extensive hepatic via CYP3A4',
      bioavailability: '64–90%',
      renalExcretion: '<10% unchanged',
      interactions: [
        { interactingDrugUid: 'API-0005', interactingDrugSlug: 'atorvastatin', interactingDrugName: 'Atorvastatin', severity: 'minor', mechanism: 'Mild CYP3A4-mediated increase in atorvastatin exposure at high doses' },
      ],
    },
    eco: {
      mec: 0.05,
      pec: 0.01,
      rq: 0.2,
      risk: 'low',
      dpd: 'low',
      excretionRoute: 'Hepatic metabolism → biliary/renal metabolites',
      primaryConcern: 'Limited data pending full curation',
      notes: 'Full ecopharmacovigilance assessment pending — this entry was added to model the Caduet combination and has not yet been curated to the same depth as core Drug_Matrix entries.',
    },
  },
  {
    id: 'clavulanate',
    apiUid: 'API-0008',
    name: 'Clavulanate',
    entryType: 'drug',
    isStub: true,
    schedule: 'Rx',
    therapeuticArea: 'Infectious Disease',
    description: 'Beta-lactamase inhibitor with minimal intrinsic antibacterial activity, used only in combination with beta-lactam antibiotics (e.g. Augmentin) to restore efficacy against beta-lactamase-producing bacteria.',
    classification: {
      mechanism: ['Beta-lactamase Inhibitor'],
      physiologicEffect: ['Restoration of Beta-lactam Activity'],
      chemicalClass: ['Clavam'],
    },
    hierarchy: {
      ingredient: { name: 'Clavulanic acid', cas: '58001-44-8', inchikey: 'VXKHXGOKWPXYNA-ZPYUVAJKSA-N' },
      saltForms: [{ name: 'Clavulanate potassium', cas: '61177-45-5' }],
      formulations: [
        {
          brand: 'Augmentin', form: 'Tablet (combination)', strength: '500/125 mg, 875/125 mg (amox/clav)', manufacturer: 'GSK',
          ingredients: [
            { apiUid: 'API-0004', slug: 'amoxicillin', name: 'Amoxicillin', roleNote: 'Beta-lactam component' },
            { apiUid: 'API-0008', slug: 'clavulanate', name: 'Clavulanate' },
          ],
        },
      ],
    },
    clinical: {
      indications: ['Not used alone — always combined with a beta-lactam antibiotic'],
      dosing: 'Dosed as fixed-ratio combination; see Augmentin formulation.',
      halfLife: '1–1.3 hours',
      proteinBinding: '~25%',
      metabolism: 'Partial hepatic metabolism',
      bioavailability: 'Well absorbed orally',
      renalExcretion: '~40% unchanged',
      interactions: [],
    },
    eco: {
      mec: 0.2,
      pec: 0.05,
      rq: 0.25,
      risk: 'low',
      dpd: 'low',
      excretionRoute: 'Renal + hepatic metabolites',
      primaryConcern: 'Limited data pending full curation',
      notes: 'Full ecopharmacovigilance assessment pending — this entry was added to model the Augmentin combination and has not yet been curated to the same depth as core Drug_Matrix entries.',
    },
  },
  {
    id: 'diphenoxylate',
    apiUid: 'API-0009',
    name: 'Diphenoxylate',
    entryType: 'drug',
    schedule: 'Controlled IV',
    therapeuticArea: 'Gastroenterology',
    description: 'Opioid-receptor agonist antidiarrheal, structurally related to meperidine. Formulated with a subtherapeutic dose of atropine (Lomotil) to discourage deliberate misuse/overdose.',
    classification: {
      mechanism: ['Mu-opioid Receptor Agonist', 'Gastrointestinal Motility Inhibitor'],
      physiologicEffect: ['Decreased Intestinal Motility', 'Increased Intestinal Transit Time'],
      chemicalClass: ['Phenylpiperidine (meperidine analog)'],
    },
    hierarchy: {
      ingredient: { name: 'Diphenoxylate', cas: '915-30-0', inchikey: 'DXHPZXOJBJRVAG-UHFFFAOYSA-N' },
      saltForms: [{ name: 'Diphenoxylate hydrochloride', cas: '3810-80-8' }],
      formulations: [
        {
          brand: 'Lomotil', form: 'Tablet (combination)', strength: '2.5 mg diphenoxylate / 0.025 mg atropine', manufacturer: 'Pfizer',
          ingredients: [
            { apiUid: 'API-0009', slug: 'diphenoxylate', name: 'Diphenoxylate' },
            { apiUid: 'API-0010', slug: 'atropine', name: 'Atropine', roleNote: 'Abuse-deterrent additament' },
          ],
        },
      ],
    },
    clinical: {
      indications: ['Adjunct therapy for acute nonspecific diarrhea', 'Chronic diarrhea (adjunct)'],
      dosing: 'Adults: 5 mg (2 tablets) four times daily initially; reduce as symptoms improve. Max 20 mg/day.',
      halfLife: '2.5 hours (diphenoxylate); 12–24 hours (active metabolite difenoxin)',
      proteinBinding: 'High',
      metabolism: 'Hepatic hydrolysis to difenoxin (active metabolite)',
      bioavailability: 'Well absorbed orally',
      renalExcretion: 'Primarily fecal as metabolites',
      interactions: [
        { interactingDrugUid: 'SUB-0001', interactingDrugSlug: 'alcohol', interactingDrugName: 'Alcohol', severity: 'moderate', mechanism: 'Additive CNS depression' },
        { interactingDrugName: 'MAO inhibitors', severity: 'moderate', mechanism: 'Theoretical risk of hypertensive crisis' },
      ],
    },
    eco: {
      mec: 0.3,
      pec: 0.01,
      rq: 0.03,
      risk: 'negligible',
      dpd: 'low',
      excretionRoute: 'Fecal (primarily as metabolites)',
      primaryConcern: 'Low prescription volume and predominantly fecal excretion limit aquatic exposure',
      notes: 'Low consumption volume relative to high-usage drugs like ibuprofen or metformin, combined with fecal (not urinary) excretion, keeps predicted environmental concentrations very low.',
    },
  },
  {
    id: 'atropine',
    apiUid: 'API-0010',
    name: 'Atropine',
    entryType: 'drug',
    schedule: 'Rx',
    therapeuticArea: 'Cardiology / Toxicology',
    description: 'Anticholinergic (muscarinic antagonist) used for bradycardia, organophosphate/nerve agent poisoning, and as an abuse-deterrent additive in antidiarrheal combination products like Lomotil.',
    classification: {
      mechanism: ['Muscarinic Acetylcholine Receptor Antagonist'],
      physiologicEffect: ['Increased Heart Rate', 'Decreased Secretions', 'Bronchodilation', 'Mydriasis'],
      chemicalClass: ['Tropane alkaloid'],
    },
    hierarchy: {
      ingredient: { name: 'Atropine', cas: '51-55-8', inchikey: 'RKUNBYITZUJHSG-SPUOUPEWSA-N' },
      saltForms: [{ name: 'Atropine sulfate', cas: '5908-99-6' }],
      formulations: [
        { brand: 'AtroPen', form: 'Auto-injector', strength: '0.5 mg, 1 mg, 2 mg', manufacturer: 'Meridian Medical Technologies', ingredients: [{ apiUid: 'API-0010', slug: 'atropine', name: 'Atropine' }] },
        {
          brand: 'Lomotil', form: 'Tablet (combination)', strength: '2.5 mg diphenoxylate / 0.025 mg atropine', manufacturer: 'Pfizer',
          ingredients: [
            { apiUid: 'API-0009', slug: 'diphenoxylate', name: 'Diphenoxylate', roleNote: 'Opioid antidiarrheal component' },
            { apiUid: 'API-0010', slug: 'atropine', name: 'Atropine' },
          ],
        },
      ],
    },
    clinical: {
      indications: ['Symptomatic bradycardia', 'Organophosphate/nerve agent poisoning', 'Abuse-deterrent additive (Lomotil)', 'Preoperative antisialagogue'],
      dosing: 'Bradycardia: 0.5–1 mg IV every 3–5 min (max 3 mg). Organophosphate poisoning: 2 mg IM/IV, repeated per protocol.',
      halfLife: '2–3 hours',
      proteinBinding: '14–22%',
      metabolism: 'Hepatic hydrolysis',
      bioavailability: 'High (parenteral); variable oral',
      renalExcretion: '~50% unchanged',
      interactions: [
        { interactingDrugUid: 'API-0009', interactingDrugSlug: 'diphenoxylate', interactingDrugName: 'Diphenoxylate', severity: 'minor', mechanism: 'Combined intentionally at subtherapeutic atropine dose to deter misuse' },
      ],
    },
    eco: {
      mec: 1.0,
      pec: 0.005,
      rq: 0.005,
      risk: 'negligible',
      dpd: 'low',
      excretionRoute: 'Renal (~50% unchanged) + hepatic metabolites',
      primaryConcern: 'Very low prescription and consumption volume limits environmental relevance',
      notes: 'Low-volume, largely acute/emergency use keeps atropine well below concentrations of ecotoxicological concern.',
    },
  },
  {
    id: 'cimetidine',
    apiUid: 'API-0011',
    name: 'Cimetidine',
    entryType: 'drug',
    isStub: true,
    schedule: 'OTC',
    therapeuticArea: 'Gastroenterology',
    description: 'First-generation H2-receptor antagonist. Largely superseded by other H2 blockers and PPIs due to its extensive CYP450 inhibition and drug interaction profile — notably with metformin.',
    classification: {
      mechanism: ['Histamine H2-Receptor Antagonist', 'CYP450 Inhibitor'],
      physiologicEffect: ['Decreased Gastric Acid Secretion'],
      chemicalClass: ['Imidazole'],
    },
    hierarchy: {
      ingredient: { name: 'Cimetidine', cas: '51481-61-9', inchikey: 'DAMJVEXVGFTZQR-UHFFFAOYSA-N' },
      saltForms: [],
      formulations: [
        { brand: 'Tagamet', form: 'Tablet', strength: '200 mg, 300 mg, 400 mg, 800 mg', manufacturer: 'GSK', ingredients: [{ apiUid: 'API-0011', slug: 'cimetidine', name: 'Cimetidine' }] },
      ],
    },
    clinical: {
      indications: ['Peptic ulcer disease', 'GERD', 'Heartburn (OTC)'],
      dosing: 'Varies by indication; commonly 300 mg four times daily or 800 mg at bedtime.',
      halfLife: '2 hours',
      proteinBinding: '13–25%',
      metabolism: 'Partial hepatic; significant CYP450 inhibitor',
      bioavailability: '~60–70%',
      renalExcretion: '~60% unchanged',
      interactions: [
        { interactingDrugUid: 'API-0001', interactingDrugSlug: 'metformin', interactingDrugName: 'Metformin', severity: 'moderate', mechanism: 'Inhibits renal tubular secretion, increases metformin plasma levels by ~40%' },
      ],
    },
    eco: {
      mec: 0.15,
      pec: 0.02,
      rq: 0.13,
      risk: 'low',
      dpd: 'low',
      excretionRoute: 'Renal (~60% unchanged)',
      primaryConcern: 'Limited data pending full curation',
      notes: 'Full ecopharmacovigilance assessment pending — this entry was added to model its interaction with metformin and has not yet been curated to the same depth as core Drug_Matrix entries.',
    },
  },
  {
    id: 'alcohol',
    apiUid: 'SUB-0001',
    name: 'Alcohol (Ethanol)',
    entryType: 'substance',
    isStub: true,
    schedule: 'Substance',
    therapeuticArea: 'N/A — not a therapeutic agent',
    description: 'Modeled as a Drug_Matrix substance entry (not a prescribable drug) solely to support structured, linkable drug-interaction records rather than free-text interaction names.',
    classification: {
      mechanism: ['CNS Depressant'],
      physiologicEffect: ['CNS Depression', 'Hepatic Metabolic Interference'],
      chemicalClass: ['Simple alcohol'],
    },
    hierarchy: {
      ingredient: { name: 'Ethanol', cas: '64-17-5', inchikey: 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N' },
      saltForms: [],
      formulations: [],
    },
    clinical: {
      indications: ['Not applicable — recreational/dietary substance, not a prescribed therapeutic'],
      dosing: 'Not applicable',
      halfLife: 'Zero-order elimination, ~1 standard drink/hour (varies)',
      proteinBinding: 'Negligible',
      metabolism: 'Hepatic via alcohol dehydrogenase / CYP2E1',
      bioavailability: 'High (oral)',
      renalExcretion: '<10% unchanged',
      interactions: [
        { interactingDrugUid: 'API-0001', interactingDrugSlug: 'metformin', interactingDrugName: 'Metformin', severity: 'moderate', mechanism: 'Potentiates lactic acidosis risk; inhibits hepatic gluconeogenesis' },
        { interactingDrugUid: 'API-0009', interactingDrugSlug: 'diphenoxylate', interactingDrugName: 'Diphenoxylate', severity: 'moderate', mechanism: 'Additive CNS depression' },
      ],
    },
    eco: {
      mec: 0,
      pec: 0,
      rq: 0,
      risk: 'negligible',
      dpd: 'low',
      excretionRoute: 'Not applicable — not sourced from pharmaceutical prescribing/disposal pathways in the same way as prescribed drugs',
      primaryConcern: 'Not a pharmaceutical ecopharmacovigilance concern in the same sense as prescribed drugs',
      notes: 'This entry exists to support structured interaction linking, not for ecopharmacovigilance tracking — alcohol is not a prescribed or disposed pharmaceutical in the Drug_Matrix sense.',
    },
  },
  {
    id: 'iodinated-contrast-media',
    apiUid: 'API-0012',
    name: 'Iodinated Contrast Media',
    entryType: 'substance',
    isStub: true,
    schedule: 'Substance',
    therapeuticArea: 'Radiology',
    description: 'Class of iodine-based radiographic contrast agents (e.g. iohexol, iopamidol) administered for imaging studies. Modeled as a single representative Drug_Matrix entry to support linked interaction records; individual agents may be split into separate entries during full curation.',
    classification: {
      mechanism: ['Radiographic Contrast Agent'],
      physiologicEffect: ['Transient Renal Hemodynamic Change'],
      chemicalClass: ['Triiodinated benzene derivative'],
    },
    hierarchy: {
      ingredient: { name: 'Iohexol (representative agent)', cas: '66108-95-0', inchikey: 'NBQNWMBBSKPBAY-UHFFFAOYSA-N' },
      saltForms: [],
      formulations: [],
    },
    clinical: {
      indications: ['Diagnostic imaging (CT, angiography, urography)'],
      dosing: 'Varies by procedure and agent',
      halfLife: 'Agent-dependent, typically 2 hours (normal renal function)',
      proteinBinding: 'Negligible',
      metabolism: 'Not metabolized',
      bioavailability: 'N/A (parenteral)',
      renalExcretion: '~100% unchanged via glomerular filtration',
      interactions: [
        { interactingDrugUid: 'API-0001', interactingDrugSlug: 'metformin', interactingDrugName: 'Metformin', severity: 'major', mechanism: 'Temporary renal impairment increases risk of lactic acidosis' },
      ],
    },
    eco: {
      mec: 0.5,
      pec: 0.4,
      rq: 0.8,
      risk: 'moderate',
      dpd: 'high',
      excretionRoute: 'Renal — excreted unchanged, essentially unmetabolized',
      primaryConcern: 'Highly persistent in conventional wastewater treatment; can form iodinated disinfection byproducts',
      notes: 'Iodinated contrast agents are poorly removed by conventional wastewater treatment and are essentially unmetabolized, making them a recognized emerging contaminant class. Full multi-agent curation (iohexol, iopamidol, iodixanol, etc.) is planned.',
    },
  },
]

export const CATEGORIES = [
  { id: 'mechanism', label: 'Mechanism of Action', count: 0, color: 'violet' as const },
  { id: 'drug', label: 'Drugs', count: 3094, color: 'aqua' as const },
  { id: 'chemical', label: 'Chemical Class', count: 0, color: 'sage' as const },
  { id: 'eco', label: 'Environmental Impact', count: 11, color: 'coral' as const },
]

export const ECO_RISK_COLORS: Record<EcoRisk, { bg: string; text: string; border: string; label: string }> = {
  negligible: { bg: 'bg-sage-100', text: 'text-sage-700', border: 'border-sage-300', label: 'Negligible' },
  low: { bg: 'bg-aqua-100', text: 'text-aqua-700', border: 'border-aqua-300', label: 'Low' },
  moderate: { bg: 'bg-amber-100', text: 'text-sage-800', border: 'border-amber-400', label: 'Moderate' },
  high: { bg: 'bg-coral-100', text: 'text-coral-600', border: 'border-coral-400', label: 'High' },
}
