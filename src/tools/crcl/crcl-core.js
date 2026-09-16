/* ==========================================================================
   crcl-core.js
   Pure calculation layer. No DOM, no side effects.
   Exposed as window.CrClCore (browser) and module.exports (node, for tests).
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CrClCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LB_PER_KG = 2.2046226218;
  var UMOL_PER_MGDL = 88.4;
  var CM_PER_IN = 2.54;

  /* ---------------------------------------------------------- conversions */

  function toKg(value, unit) { return unit === 'lb' ? value / LB_PER_KG : value; }
  function toLb(kg) { return kg * LB_PER_KG; }
  function toCm(value, unit) { return unit === 'in' ? value * CM_PER_IN : value; }
  function toIn(cm) { return cm / CM_PER_IN; }
  function scrToMgdl(value, unit) { return unit === 'umol' ? value / UMOL_PER_MGDL : value; }
  function scrToUmol(mgdl) { return mgdl * UMOL_PER_MGDL; }

  /**
   * Convert a modern IDMS-standardized creatinine to its non-IDMS equivalent.
   * Cockcroft-Gault was derived before creatinine assays were standardized, and
   * IDMS calibration lowered the average reported creatinine by roughly 12%.
   * Applying this conversion therefore lowers the resulting CrCl.
   *
   * This is optional and OFF by default. Most EMRs, Lexicomp, MDCalc and
   * GlobalRPh feed the creatinine in as reported; ClinCalc applies this
   * conversion. Both are defensible - pick one and be consistent.
   */
  function idmsToNonIdms(mgdl) { return mgdl * 1.065 + 0.067; }

  /**
   * Whole years between a date of birth and a reference date.
   */
  function ageFromDob(dobISO, refISO) {
    if (!dobISO) return null;
    var dob = new Date(dobISO + 'T00:00:00');
    var ref = refISO ? new Date(refISO + 'T00:00:00') : new Date();
    if (isNaN(dob.getTime()) || isNaN(ref.getTime())) return null;
    var years = ref.getFullYear() - dob.getFullYear();
    var m = ref.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && ref.getDate() < dob.getDate())) years--;
    return years;
  }

  /* ------------------------------------------------------- body size math */

  /**
   * Ideal body weight, Devine 1974.
   * Below 60 inches the formula is linearly extrapolated downward, which is
   * the convention used by most clinical calculators. Flag it to the user.
   */
  function ibwDevine(heightCm, sex) {
    var inches = toIn(heightCm);
    var base = sex === 'female' ? 45.5 : 50;
    return base + 2.3 * (inches - 60);
  }

  /* ------------------------------------------------------------ amputation */

  /**
   * Estimated body weight lost (EBWL) by amputation level, as a percentage of
   * intact total body weight. Each level is cumulative and includes everything
   * distal to it, so only one level is selected per limb.
   */
  var AMPUTATION_LEVELS = {
    leg: [
      { value: 'none',    label: 'Intact',               pct: 0 },
      { value: 'foot',    label: 'Foot',                 pct: 1.5 },
      { value: 'bka',     label: 'Below-knee (BKA)',     pct: 3.5 },
      { value: 'aka',     label: 'Above-knee (AKA)',     pct: 11 },
      { value: 'hip',     label: 'Hip disarticulation',  pct: 16 }
    ],
    arm: [
      { value: 'none',    label: 'Intact',       pct: 0 },
      { value: 'hand',    label: 'Hand',         pct: 0.7 },
      { value: 'forearm', label: 'Forearm',      pct: 1.5 },
      { value: 'arm',     label: 'Entire arm',   pct: 4 }
    ]
  };

  var AMPUTATION_SITES = [
    { key: 'leftArm',  limb: 'arm', label: 'Left arm'  },
    { key: 'rightArm', limb: 'arm', label: 'Right arm' },
    { key: 'leftLeg',  limb: 'leg', label: 'Left leg'  },
    { key: 'rightLeg', limb: 'leg', label: 'Right leg' }
  ];

  function amputationLevel(limb, value) {
    var list = AMPUTATION_LEVELS[limb] || [];
    for (var i = 0; i < list.length; i++) if (list[i].value === value) return list[i];
    return list[0];
  }

  /**
   * Total EBWL from a selection map, e.g. { leftLeg: 'aka', rightArm: 'hand' }.
   * Returns { percent, items: [{ label, levelLabel, pct }] }.
   */
  function ebwl(selections) {
    var total = 0;
    var items = [];
    (selections ? AMPUTATION_SITES : []).forEach(function (site) {
      var lvl = amputationLevel(site.limb, selections[site.key]);
      if (!lvl || !lvl.pct) return;
      total += lvl.pct;
      items.push({ label: site.label, levelLabel: lvl.label, pct: lvl.pct });
    });
    return { percent: total, items: items };
  }

  /** Adjusted body weight with a 40% correction factor. */
  function adjBw(actualKg, ibwKg, factor) {
    var f = typeof factor === 'number' ? factor : 0.4;
    return ibwKg + f * (actualKg - ibwKg);
  }

  /** Lean body weight, Janmahasatian 2005. */
  function lbw2005(actualKg, heightCm, sex) {
    var bmiVal = bmi(actualKg, heightCm);
    return sex === 'female'
      ? (9270 * actualKg) / (8780 + 244 * bmiVal)
      : (9270 * actualKg) / (6680 + 216 * bmiVal);
  }

  function bmi(weightKg, heightCm) {
    var m = heightCm / 100;
    return weightKg / (m * m);
  }

  /** WHO / NHLBI weight-status bands. */
  function bmiCategory(value) {
    if (value < 16)   return { label: 'Severe thinness',        tone: 'warn'    };
    if (value < 17)   return { label: 'Moderate thinness',      tone: 'warn'    };
    if (value < 18.5) return { label: 'Underweight',            tone: 'warn'    };
    if (value < 25)   return { label: 'Normal weight',          tone: 'ok'      };
    if (value < 30)   return { label: 'Overweight',             tone: 'caution' };
    if (value < 35)   return { label: 'Obesity, class I',       tone: 'warn'    };
    if (value < 40)   return { label: 'Obesity, class II',      tone: 'warn'    };
    return              { label: 'Obesity, class III',          tone: 'avoid'   };
  }

  /** Body surface area, Du Bois & Du Bois 1916 (m^2). */
  function bsaDuBois(weightKg, heightCm) {
    return 0.007184 * Math.pow(heightCm, 0.725) * Math.pow(weightKg, 0.425);
  }

  /** Body surface area, Mosteller 1987 (m^2). */
  function bsaMosteller(weightKg, heightCm) {
    return Math.sqrt((heightCm * weightKg) / 3600);
  }

  /* ------------------------------------------------------- Cockcroft-Gault */

  /**
   * Cockcroft-Gault 1976. Returns mL/min.
   * @param {number} age      years
   * @param {number} weightKg the dosing weight already chosen by the caller
   * @param {number} scrMgdl  serum creatinine, mg/dL
   * @param {string} sex      'male' | 'female'
   */
  function cockcroftGault(age, weightKg, scrMgdl, sex) {
    var value = ((140 - age) * weightKg) / (72 * scrMgdl);
    if (sex === 'female') value *= 0.85;
    return value;
  }

  /**
   * Which weight the Cockcroft-Gault equation should use.
   * ABW < IBW                -> actual (do not underestimate function)
   * ABW >= 130% of IBW       -> adjusted (do not overestimate function)
   * otherwise                -> ideal
   * A medication whose labeling specifies actual body weight overrides all of it.
   */
  function selectWeight(weights, opts) {
    opts = opts || {};
    var threshold = typeof opts.obesityThreshold === 'number' ? opts.obesityThreshold : 1.3;

    if (opts.forceActual) {
      return {
        key: 'actual',
        weightKg: weights.actual,
        label: 'Actual body weight',
        reason: 'The selected medication’s labeling specifies actual body weight regardless of body habitus.'
      };
    }
    if (weights.actual < weights.ideal) {
      return {
        key: 'actual',
        weightKg: weights.actual,
        label: 'Actual body weight',
        reason: 'Actual body weight is below ideal body weight. Using IBW here would overestimate renal function.'
      };
    }
    if (weights.actual >= threshold * weights.ideal) {
      return {
        key: 'adjusted',
        weightKg: weights.adjusted,
        label: 'Adjusted body weight',
        reason: 'Actual body weight is at least ' + Math.round((threshold - 1) * 100) +
                '% above ideal body weight, so a 40% adjustment factor is applied.'
      };
    }
    return {
      key: 'ideal',
      weightKg: weights.ideal,
      label: 'Ideal body weight',
      reason: 'Actual body weight is between ideal and ' + Math.round(threshold * 100) +
              '% of ideal, so ideal body weight is used.'
    };
  }

  /* ------------------------------------------------------- CKD-EPI 2021 cr */

  /**
   * CKD-EPI 2021 creatinine equation (race-free). Returns mL/min/1.73 m^2.
   * Requires an IDMS-standardized creatinine.
   */
  function ckdEpi2021(age, scrMgdl, sex) {
    var female = sex === 'female';
    var kappa = female ? 0.7 : 0.9;
    var alpha = female ? -0.241 : -0.302;
    var ratio = scrMgdl / kappa;
    var value = 142 *
      Math.pow(Math.min(ratio, 1), alpha) *
      Math.pow(Math.max(ratio, 1), -1.200) *
      Math.pow(0.9938, age);
    if (female) value *= 1.012;
    return value;
  }

  /** Convert an indexed eGFR (mL/min/1.73m2) to the individual's own BSA (mL/min). */
  function deindexEgfr(egfrIndexed, bsa) {
    return egfrIndexed * (bsa / 1.73);
  }

  /* ----------------------------------------------------------- CKD staging */

  var CKD_STAGES = [
    { code: 'G1',  min: 90,   max: null, label: 'Normal or high',                 tone: 'ok'      },
    { code: 'G2',  min: 60,   max: 90,   label: 'Mildly decreased',               tone: 'ok'      },
    { code: 'G3a', min: 45,   max: 60,   label: 'Mildly to moderately decreased', tone: 'caution' },
    { code: 'G3b', min: 30,   max: 45,   label: 'Moderately to severely decreased', tone: 'warn'  },
    { code: 'G4',  min: 15,   max: 30,   label: 'Severely decreased',             tone: 'warn'    },
    { code: 'G5',  min: null, max: 15,   label: 'Kidney failure',                 tone: 'avoid'   }
  ];

  /**
   * KDIGO GFR category from a BSA-indexed eGFR.
   * Note that a CKD *diagnosis* additionally requires the abnormality to have
   * been present for >3 months, and full staging requires albuminuria.
   */
  function ckdStage(egfrIndexed) {
    for (var i = 0; i < CKD_STAGES.length; i++) {
      var s = CKD_STAGES[i];
      var aboveMin = s.min === null || egfrIndexed >= s.min;
      var belowMax = s.max === null || egfrIndexed < s.max;
      if (aboveMin && belowMax) return s;
    }
    return null;
  }

  /* ------------------------------------------------------------ AKI, KDIGO */

  /**
   * KDIGO 2012 AKI definition and staging, creatinine criteria only.
   * Urine output criteria are not evaluated here.
   *
   * @param {number} scrMgdl        current creatinine
   * @param {number} baselineMgdl   baseline creatinine
   * @param {number|null} hours     hours between baseline and current draw
   */
  function akiAssess(scrMgdl, baselineMgdl, hours) {
    var ratio = scrMgdl / baselineMgdl;
    var delta = scrMgdl - baselineMgdl;
    var within48 = hours === null || hours === undefined || hours <= 48;
    var within7d = hours === null || hours === undefined || hours <= 168;

    var metBy = [];
    if (delta >= 0.3 && within48) metBy.push('Rise of ≥0.3 mg/dL within 48 hours');
    if (ratio >= 1.5 && within7d) metBy.push('Rise to ≥1.5× baseline within 7 days');

    if (!metBy.length) {
      return {
        meetsCriteria: false,
        stage: 0,
        ratio: ratio,
        delta: delta,
        metBy: [],
        direction: delta > 0 ? 'rising' : (delta < 0 ? 'falling' : 'unchanged'),
        summary: delta < 0
          ? 'Creatinine is below baseline. No AKI by KDIGO creatinine criteria; this pattern is consistent with recovery.'
          : 'Does not meet KDIGO creatinine criteria for AKI. Urine output criteria are not assessed here.'
      };
    }

    var stage, stageText;
    if (ratio >= 3.0 || scrMgdl >= 4.0) {
      stage = 3;
      stageText = ratio >= 3.0
        ? 'Creatinine has risen to ≥3.0× baseline.'
        : 'Creatinine is ≥4.0 mg/dL in the setting of an acute rise.';
    } else if (ratio >= 2.0) {
      stage = 2;
      stageText = 'Creatinine has risen to 2.0–2.9× baseline.';
    } else {
      stage = 1;
      stageText = ratio >= 1.5
        ? 'Creatinine has risen to 1.5–1.9× baseline.'
        : 'Creatinine has risen by ≥0.3 mg/dL within 48 hours.';
    }

    return {
      meetsCriteria: true,
      stage: stage,
      ratio: ratio,
      delta: delta,
      metBy: metBy,
      direction: 'rising',
      summary: stageText
    };
  }

  /* ----------------------------------------------------- medication lookup */

  /**
   * Find the dosing band a renal estimate falls into.
   * Bands use an inclusive min and an exclusive max; null means unbounded.
   */
  function matchBand(bands, value) {
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      var aboveMin = b.min === null || b.min === undefined || value >= b.min;
      var belowMax = b.max === null || b.max === undefined || value < b.max;
      if (aboveMin && belowMax) return b;
    }
    return null;
  }

  /* --------------------------------------------------------- orchestration */

  /**
   * Run every calculation from a single normalized input object.
   *
   * @param {object} input
   *   age            number, years
   *   sex            'male' | 'female'
   *   heightCm       number
   *   weightKg       number
   *   scrMgdl        number (IDMS-standardized)
   *   baselineScrMgdl  number | null
   *   baselineCrCl     number | null (mL/min)
   *   hoursSinceBaseline number | null
   *   stableRenal    boolean
   *   scrFloor       number | null  optional minimum creatinine to apply
   *   medication     object | null  an entry from CRCL_MEDICATIONS
   *   obesityThreshold number       fraction of IBW that triggers AdjBW (default 1.3)
   */
  function evaluate(input) {
    var out = { warnings: [], notes: [] };
    out.heightCm = input.heightCm;
    out.age = input.age;
    out.sex = input.sex;

    var scr = input.scrMgdl;
    out.scrFloorApplied = false;
    if (input.scrFloor && scr < input.scrFloor) {
      scr = input.scrFloor;
      out.scrFloorApplied = true;
    }
    out.scrApplied = scr;

    /* CKD-EPI 2021 is derived on IDMS creatinine and always uses it as
       reported. Only Cockcroft-Gault optionally gets the non-IDMS conversion. */
    out.scrForCg = input.idmsAdjust ? idmsToNonIdms(scr) : scr;
    out.idmsAdjust = !!input.idmsAdjust;

    /* body size ---------------------------------------------------------- */
    var idealIntact = ibwDevine(input.heightCm, input.sex);
    if (idealIntact < 20) {
      out.warnings.push('At this height the Devine ideal body weight formula is being extrapolated below its validated range. Interpret weight-based results cautiously.');
      idealIntact = Math.max(idealIntact, 20);
    }

    /* Amputation. Devine IBW assumes intact limbs, so it is scaled down by the
       fraction of body weight that is missing. The measured weight already
       reflects the loss; BMI is instead reconstituted upward so the WHO
       categories still mean what they normally mean. */
    out.ebwl = ebwl(input.amputations);
    var lossFraction = Math.min(out.ebwl.percent, 60) / 100;
    out.idealIntact = idealIntact;
    var ideal = idealIntact * (1 - lossFraction);

    var weights = {
      actual:   input.weightKg,
      ideal:    ideal,
      adjusted: adjBw(input.weightKg, ideal, 0.4),
      lean:     lbw2005(input.weightKg, input.heightCm, input.sex)
    };

    out.weights = weights;
    out.percentOfIbw = (input.weightKg / ideal) * 100;
    out.bmiMeasured = bmi(input.weightKg, input.heightCm);
    out.bmiCorrected = lossFraction > 0
      ? bmi(input.weightKg / (1 - lossFraction), input.heightCm)
      : out.bmiMeasured;
    out.bmi = out.bmiCorrected;
    out.bmiCategory = bmiCategory(out.bmi);
    out.bsaDuBois = bsaDuBois(input.weightKg, input.heightCm);
    out.bsaMosteller = bsaMosteller(input.weightKg, input.heightCm);
    out.bsaFormula = input.bsaFormula === 'dubois' ? 'dubois' : 'mosteller';
    out.bsa = out.bsaFormula === 'dubois' ? out.bsaDuBois : out.bsaMosteller;

    /* Cockcroft-Gault variants ------------------------------------------- */
    var cgScr = out.scrForCg;
    out.cg = {
      actual:   cockcroftGault(input.age, weights.actual,   cgScr, input.sex),
      ideal:    cockcroftGault(input.age, weights.ideal,    cgScr, input.sex),
      adjusted: cockcroftGault(input.age, weights.adjusted, cgScr, input.sex),
      lean:     cockcroftGault(input.age, weights.lean,     cgScr, input.sex)
    };

    var forceActual = !!(input.medication && input.medication.weightBasis === 'abw');
    out.selection = selectWeight(weights, {
      forceActual: forceActual,
      obesityThreshold: input.obesityThreshold
    });
    out.crcl = out.cg[out.selection.key];

    /* eGFR and CKD stage -------------------------------------------------- */
    out.egfrIndexed = ckdEpi2021(input.age, scr, input.sex);
    out.egfrAbsolute = deindexEgfr(out.egfrIndexed, out.bsa);
    out.ckdStage = ckdStage(out.egfrIndexed);

    /* AKI ----------------------------------------------------------------- */
    out.aki = null;
    if (typeof input.baselineScrMgdl === 'number' && input.baselineScrMgdl > 0) {
      out.aki = akiAssess(input.scrMgdl, input.baselineScrMgdl, input.hoursSinceBaseline);
      out.baselineCrClDerived = cockcroftGault(
        input.age,
        out.selection.weightKg,
        input.idmsAdjust ? idmsToNonIdms(input.baselineScrMgdl) : input.baselineScrMgdl,
        input.sex
      );
      out.baselineEgfrIndexed = ckdEpi2021(input.age, input.baselineScrMgdl, input.sex);
    }
    if (typeof input.baselineCrCl === 'number' && input.baselineCrCl > 0) {
      out.baselineCrClEntered = input.baselineCrCl;
      out.crclPercentChange = ((out.crcl - input.baselineCrCl) / input.baselineCrCl) * 100;
    } else if (out.baselineCrClDerived) {
      out.crclPercentChange = ((out.crcl - out.baselineCrClDerived) / out.baselineCrClDerived) * 100;
    }

    /* medication ----------------------------------------------------------- */
    out.medication = null;
    if (input.medication) {
      var med = input.medication;
      var value = med.metric === 'egfr' ? out.egfrIndexed : out.crcl;
      out.medication = {
        drug: med,
        metric: med.metric,
        value: value,
        band: matchBand(med.bands, value)
      };
    }

    /* warnings ------------------------------------------------------------- */
    if (!input.stableRenal) {
      out.warnings.push('Renal function was marked as unstable. Cockcroft-Gault and CKD-EPI both assume a creatinine at steady state; neither estimate is valid during a rising or falling creatinine.');
    }
    if (out.aki && out.aki.meetsCriteria && input.stableRenal) {
      out.warnings.push('The creatinine change meets KDIGO criteria for AKI, which contradicts the "stable" setting. Steady-state estimates are unreliable here.');
    }
    if (input.age >= 65) {
      out.notes.push('In older adults Cockcroft-Gault can overestimate clearance when creatinine is low because of reduced muscle mass. The National Kidney Foundation specifically advises against empirically rounding creatinine upward to correct for this.');
    }
    if (out.ebwl.percent > 0) {
      out.notes.push('Creatinine is produced by muscle, so an amputation lowers it independently of kidney function. Ideal body weight has been scaled down by the ' +
        out.ebwl.percent.toFixed(1) + '% estimated body weight lost, and BMI has been reconstituted to an intact-limb equivalent so the WHO categories still apply. ' +
        'Neither correction is validated against measured clearance — treat the result as a rough estimate and consider a measured clearance if precision matters.');
    }
    if (out.ebwl.percent > 25) {
      out.warnings.push('With more than 25% of body weight missing, every weight-based estimate here is extrapolated well beyond its validated range. A timed urine collection is strongly preferred.');
    }
    if (out.bmi >= 30) {
      out.notes.push('CKD-EPI contains no obesity adjustment. Use the BSA-adjusted (mL/min) value, not the indexed value, for any dosing decision.');
    }
    if (input.age < 18) {
      out.warnings.push('Cockcroft-Gault and CKD-EPI 2021 are adult equations and are not validated in patients under 18.');
    }

    return out;
  }

  return {
    LB_PER_KG: LB_PER_KG,
    UMOL_PER_MGDL: UMOL_PER_MGDL,
    CKD_STAGES: CKD_STAGES,
    AMPUTATION_LEVELS: AMPUTATION_LEVELS,
    AMPUTATION_SITES: AMPUTATION_SITES,
    amputationLevel: amputationLevel, ebwl: ebwl,
    toKg: toKg, toLb: toLb, toCm: toCm, toIn: toIn,
    scrToMgdl: scrToMgdl, scrToUmol: scrToUmol, idmsToNonIdms: idmsToNonIdms,
    ageFromDob: ageFromDob,
    ibwDevine: ibwDevine, adjBw: adjBw, lbw2005: lbw2005,
    bmi: bmi, bmiCategory: bmiCategory,
    bsaDuBois: bsaDuBois, bsaMosteller: bsaMosteller,
    cockcroftGault: cockcroftGault, selectWeight: selectWeight,
    ckdEpi2021: ckdEpi2021, deindexEgfr: deindexEgfr, ckdStage: ckdStage,
    akiAssess: akiAssess, matchBand: matchBand,
    evaluate: evaluate
  };
});
