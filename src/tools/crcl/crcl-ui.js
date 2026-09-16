/* ==========================================================================
   crcl-ui.js
   Renders the calculator into any element carrying [data-crcl-calculator].

     <div data-crcl-calculator></div>
     <script src="crcl-core.js"></script>
     <script src="crcl-medications.js"></script>
     <script src="crcl-ui.js"></script>

   Requires crcl-core.js. crcl-medications.js is optional; if it is absent the
   medication selector is hidden.
   ========================================================================== */
(function () {
  'use strict';

  var Core = window.CrClCore;
  if (!Core) throw new Error('crcl-ui.js requires crcl-core.js to be loaded first.');

  /* ------------------------------------------------------------- helpers */

  var UID = 0;

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function round(value, places) {
    if (!isFinite(value)) return '—';
    var p = places === undefined ? 0 : places;
    return value.toFixed(p);
  }

  /** 175 cm -> "68.9 in / 5 ft 8.9 in" */
  function feetInches(cm) {
    var inches = Core.toIn(cm);
    var ft = Math.floor(inches / 12);
    var rem = inches - ft * 12;
    return inches.toFixed(1) + ' in / ' + ft + '′ ' + rem.toFixed(1) + '″';
  }

  function num(input) {
    var v = parseFloat(input);
    return isFinite(v) ? v : null;
  }

  /* ------------------------------------------------------------- template */

  function buildMarkup(root, state) {
    var id = 'crcl' + (++UID);
    var meds = window.CRCL_MEDICATIONS || [];

    root.classList.add('crcl');
    root.innerHTML = [
      '<form class="crcl-form" novalidate>',
      '  <div class="crcl-grid">',

      /* ---- demographics ---- */
      '    <fieldset class="crcl-panel">',
      '      <legend>Patient</legend>',

      '      <div class="crcl-field">',
      '        <label>Age</label>',
      '        <div class="crcl-control">',
      '          <div class="crcl-seg" data-seg="ageMode">',
      '            <button type="button" data-value="years" class="is-on">Years</button>',
      '            <button type="button" data-value="dob">Date of birth</button>',
      '          </div>',
      '        </div>',
      '      </div>',

      '      <div class="crcl-field" data-when="ageMode=years">',
      '        <label for="' + id + '-age">Age</label>',
      '        <div class="crcl-control">',
      '          <input id="' + id + '-age" name="age" type="number" min="1" max="120" step="1" inputmode="numeric">',
      '          <span class="crcl-unit">years</span>',
      '        </div>',
      '      </div>',

      '      <div class="crcl-field" data-when="ageMode=dob" hidden>',
      '        <label for="' + id + '-dob">Date of birth</label>',
      '        <div class="crcl-control">',
      '          <input id="' + id + '-dob" name="dob" type="date">',
      '          <span class="crcl-unit" data-role="dob-age"></span>',
      '        </div>',
      '      </div>',

      '      <div class="crcl-field">',
      '        <label>Sex</label>',
      '        <div class="crcl-control">',
      '          <div class="crcl-seg" data-seg="sex">',
      '            <button type="button" data-value="male">Male</button>',
      '            <button type="button" data-value="female">Female</button>',
      '          </div>',
      '        </div>',
      '      </div>',

      '      <div class="crcl-field">',
      '        <label for="' + id + '-height">Height</label>',
      '        <div class="crcl-control">',
      '          <input id="' + id + '-height" name="height" type="number" min="1" step="0.1" inputmode="decimal">',
      '          <div class="crcl-seg crcl-seg-sm" data-seg="heightUnit">',
      '            <button type="button" data-value="in" class="is-on">in</button>',
      '            <button type="button" data-value="cm">cm</button>',
      '          </div>',
      '        </div>',
      '      </div>',

      '      <div class="crcl-field">',
      '        <label for="' + id + '-weight">Weight</label>',
      '        <div class="crcl-control">',
      '          <input id="' + id + '-weight" name="weight" type="number" min="1" step="0.1" inputmode="decimal">',
      '          <div class="crcl-seg crcl-seg-sm" data-seg="weightUnit">',
      '            <button type="button" data-value="lb" class="is-on">lb</button>',
      '            <button type="button" data-value="kg">kg</button>',
      '          </div>',
      '        </div>',
      '      </div>',

      '      <details class="crcl-details">',
      '        <summary data-role="amp-summary">Amputations — none</summary>',
      '        <p class="crcl-hint crcl-amp-intro">Creatinine comes from muscle, so missing limbs lower it without kidney function changing. Pick the most proximal level for each limb; each level already includes everything below it.</p>',
      '        <div class="crcl-amp-grid" data-role="amp-grid"></div>',
      '        <div class="crcl-amp-total" data-role="amp-total" hidden></div>',
      '      </details>',
      '    </fieldset>',

      /* ---- labs ---- */
      '    <fieldset class="crcl-panel">',
      '      <legend>Kidney function</legend>',

      '      <div class="crcl-field">',
      '        <label for="' + id + '-scr">Serum creatinine</label>',
      '        <div class="crcl-control">',
      '          <input id="' + id + '-scr" name="scr" type="number" min="0.1" step="0.01" inputmode="decimal">',
      '          <div class="crcl-seg crcl-seg-sm" data-seg="scrUnit">',
      '            <button type="button" data-value="mgdl" class="is-on">mg/dL</button>',
      '            <button type="button" data-value="umol">µmol/L</button>',
      '          </div>',
      '        </div>',
      '        <p class="crcl-hint" data-role="scr-converted"></p>',
      '      </div>',

      '      <div class="crcl-field">',
      '        <label>Stability</label>',
      '        <div class="crcl-control">',
      '          <div class="crcl-seg" data-seg="stable">',
      '            <button type="button" data-value="yes" class="is-on">Stable</button>',
      '            <button type="button" data-value="no">Changing / AKI</button>',
      '          </div>',
      '        </div>',
      '        <p class="crcl-hint">Both equations assume a creatinine at steady state.</p>',
      '      </div>',

      '      <details class="crcl-details">',
      '        <summary>Baseline comparison &amp; AKI assessment</summary>',
      '        <div class="crcl-field">',
      '          <label for="' + id + '-bscr">Baseline creatinine</label>',
      '          <div class="crcl-control">',
      '            <input id="' + id + '-bscr" name="baselineScr" type="number" min="0.1" step="0.01" inputmode="decimal">',
      '            <span class="crcl-unit" data-role="baseline-unit">mg/dL</span>',
      '          </div>',
      '        </div>',
      '        <div class="crcl-field">',
      '          <label for="' + id + '-hours">Interval</label>',
      '          <div class="crcl-control">',
      '            <input id="' + id + '-hours" name="hours" type="number" min="0" step="1" inputmode="numeric" placeholder="optional">',
      '            <span class="crcl-unit">hours</span>',
      '          </div>',
      '          <p class="crcl-hint">Hours between the baseline and current draw. Leave blank to skip the timing checks.</p>',
      '        </div>',
      '        <div class="crcl-field">',
      '          <label for="' + id + '-bcrcl">Baseline CrCl</label>',
      '          <div class="crcl-control">',
      '            <input id="' + id + '-bcrcl" name="baselineCrCl" type="number" min="1" step="0.1" inputmode="decimal" placeholder="optional">',
      '            <span class="crcl-unit">mL/min</span>',
      '          </div>',
      '          <p class="crcl-hint">Overrides the CrCl derived from the baseline creatinine.</p>',
      '        </div>',
      '      </details>',

      '      <details class="crcl-details">',
      '        <summary>Method options</summary>',
      '        <label class="crcl-check">',
      '          <input type="checkbox" name="idmsAdjust">',
      '          <span>Convert creatinine to its non-IDMS equivalent for Cockcroft-Gault',
      '            <em>Cockcroft-Gault predates standardized assays. This conversion lowers CrCl by roughly 10%. ClinCalc applies it; most EMRs, Lexicomp and MDCalc do not.</em>',
      '          </span>',
      '        </label>',
      '        <label class="crcl-check">',
      '          <input type="checkbox" name="scrFloor">',
      '          <span>Round creatinine below 1.0 up to 1.0 mg/dL in older adults',
      '            <em>A common institutional practice. The National Kidney Foundation specifically advises against it, and the evidence does not support it. Off by default.</em>',
      '          </span>',
      '        </label>',
      '        <div class="crcl-field">',
      '          <label for="' + id + '-bsa">BSA formula</label>',
      '          <div class="crcl-control">',
      '            <select id="' + id + '-bsa" name="bsaFormula">',
      '              <option value="mosteller">Mosteller</option>',
      '              <option value="dubois">Du Bois</option>',
      '            </select>',
      '          </div>',
      '          <p class="crcl-hint">Used to convert the indexed eGFR to the patient’s own body surface area.</p>',
      '        </div>',
      '      </details>',
      '    </fieldset>',
      '  </div>',

      meds.length ? [
        '<div class="crcl-field crcl-med-select">',
        '  <label for="' + id + '-med">Medication <span class="crcl-optional">optional</span></label>',
        '  <div class="crcl-control">',
        '    <select id="' + id + '-med" name="medication"></select>',
        '  </div>',
        '</div>'
      ].join('') : '',

      '  <div class="crcl-actions">',
      '    <button type="reset" class="crcl-btn crcl-btn-ghost">Reset</button>',
      '    <button type="submit" class="crcl-btn crcl-btn-primary">Calculate</button>',
      '  </div>',
      '</form>',
      '<div class="crcl-results" data-role="results" hidden></div>'
    ].join('\n');

    if (meds.length) populateMedications(root.querySelector('[name=medication]'), meds);
    buildAmputationInputs(root.querySelector('[data-role=amp-grid]'), id);
    return id;
  }

  function buildAmputationInputs(grid, id) {
    Core.AMPUTATION_SITES.forEach(function (site) {
      var select = el('select', { id: id + '-amp-' + site.key, name: 'amp_' + site.key },
        Core.AMPUTATION_LEVELS[site.limb].map(function (lvl) {
          return el('option', {
            value: lvl.value,
            text: lvl.pct ? lvl.label + ' — ' + lvl.pct + '%' : lvl.label
          });
        }));
      grid.appendChild(el('div', { class: 'crcl-amp-item' }, [
        el('label', { for: select.id, text: site.label }),
        select
      ]));
    });
  }

  function populateMedications(select, meds) {
    select.appendChild(el('option', { value: '', text: 'None — show renal estimates only' }));
    var groups = {};
    meds.forEach(function (m) {
      (groups[m.category] = groups[m.category] || []).push(m);
    });
    Object.keys(groups).sort().forEach(function (cat) {
      var og = el('optgroup', { label: cat });
      groups[cat]
        .sort(function (a, b) { return a.name.localeCompare(b.name); })
        .forEach(function (m) {
          var label = m.name + (m.brand ? ' (' + m.brand + ')' : '');
          if (m.indication) label += ' — ' + m.indication;
          og.appendChild(el('option', { value: m.id, text: label }));
        });
      select.appendChild(og);
    });
  }

  /* -------------------------------------------------------------- results */

  function statCard(label, value, unit, sub, tone) {
    return el('div', { class: 'crcl-stat' + (tone ? ' is-' + tone : '') }, [
      el('div', { class: 'crcl-stat-label', text: label }),
      el('div', { class: 'crcl-stat-value' }, [
        document.createTextNode(value),
        unit ? el('span', { class: 'crcl-stat-unit', text: unit }) : null
      ]),
      sub ? el('div', { class: 'crcl-stat-sub', text: sub }) : null
    ]);
  }

  function section(title, children, cls) {
    return el('section', { class: 'crcl-card' + (cls ? ' ' + cls : '') }, [
      el('h3', { class: 'crcl-card-title', text: title })
    ].concat(children));
  }

  function renderResults(container, r, ctx) {
    container.innerHTML = '';
    container.hidden = false;

    /* ---- warnings ---- */
    r.warnings.forEach(function (w) {
      container.appendChild(el('div', { class: 'crcl-alert is-warn', text: w }));
    });

    /* ---- headline ---- */
    var headline = el('div', { class: 'crcl-headline' }, [
      el('div', { class: 'crcl-headline-main' }, [
        el('div', { class: 'crcl-headline-label', text: 'Creatinine clearance for drug dosing' }),
        el('div', { class: 'crcl-headline-value' }, [
          document.createTextNode(round(r.crcl, 0)),
          el('span', { class: 'crcl-headline-unit', text: 'mL/min' })
        ]),
        el('div', { class: 'crcl-headline-method' },
          [document.createTextNode('Cockcroft-Gault using ' + r.selection.label.toLowerCase() +
            ' (' + round(r.selection.weightKg, 1) + ' kg)')])
      ]),
      el('p', { class: 'crcl-headline-reason', text: r.selection.reason })
    ]);
    container.appendChild(headline);

    /* ---- CG variants ---- */
    var rows = [
      ['actual',   'Actual body weight',        r.weights.actual,   'Original 1976 equation. Overestimates clearance in obesity.'],
      ['ideal',    'Ideal body weight',         r.weights.ideal,    'Devine 1974.'],
      ['adjusted', 'Adjusted body weight',      r.weights.adjusted, 'IBW + 0.4 × (ABW − IBW). Most accurate variant in obesity.'],
      ['lean',     'Lean body weight',          r.weights.lean,     'Janmahasatian 2005.']
    ];
    var table = el('table', { class: 'crcl-table crcl-table-variants' }, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Weight basis' }),
        el('th', { class: 'crcl-num', text: 'Weight' }),
        el('th', { class: 'crcl-num', text: 'CrCl' })
      ])]),
      el('tbody', {}, rows.map(function (row) {
        var isSel = row[0] === r.selection.key;
        return el('tr', { class: isSel ? 'is-selected' : null }, [
          el('td', {}, [
            el('strong', { text: row[1] }),
            isSel ? el('span', { class: 'crcl-badge', text: 'used' }) : null,
            el('div', { class: 'crcl-table-note', text: row[3] })
          ]),
          el('td', { class: 'crcl-num', text: round(row[2], 1) + ' kg' }),
          el('td', { class: 'crcl-num crcl-strong', text: round(r.cg[row[0]], 0) + ' mL/min' })
        ]);
      }))
    ]);
    container.appendChild(section('Cockcroft-Gault variants', [table]));

    /* ---- eGFR / CKD ---- */
    var stage = r.ckdStage;
    var egfrChildren = [
      el('div', { class: 'crcl-stats' }, [
        statCard('eGFR, indexed', round(r.egfrIndexed, 0), 'mL/min/1.73m²',
          'CKD-EPI 2021, race-free', null),
        statCard('eGFR, patient BSA', round(r.egfrAbsolute, 0), 'mL/min',
          'Use this one for dosing', null),
        statCard('GFR category', stage.code, null, stage.label, stage.tone)
      ]),
      el('p', { class: 'crcl-note', html:
        'A GFR category is not by itself a CKD diagnosis: KDIGO requires the abnormality to persist for more than three months, and full staging also needs albuminuria (A1–A3). ' +
        'The National Kidney Foundation now recommends eGFR adjusted for body surface area, rather than Cockcroft-Gault, for medication decisions in adults.'
      })
    ];
    container.appendChild(section('eGFR and CKD stage', egfrChildren));

    /* ---- body metrics ---- */
    var bmiCat = r.bmiCategory;
    var amputated = r.ebwl.percent > 0;
    var bodyChildren = [
      el('div', { class: 'crcl-stats' }, [
        statCard(amputated ? 'BMI, amputation-corrected' : 'BMI', round(r.bmi, 1), 'kg/m²',
          bmiCat.label + (amputated ? ' · ' + round(r.bmiMeasured, 1) + ' as measured' : ''), bmiCat.tone),
        statCard('Percent of IBW', round(r.percentOfIbw, 0), '%',
          round(Math.abs(r.percentOfIbw - 100), 0) + '% ' + (r.percentOfIbw >= 100 ? 'above' : 'below') +
          ' IBW — ' + (r.percentOfIbw >= 130 ? 'adjustment threshold met' : 'below the adjustment threshold'), null),
        statCard('BSA', round(r.bsa, 2), 'm²',
          r.bsaFormula === 'mosteller' ? 'Mosteller' : 'Du Bois', null),
        amputated
          ? statCard('EBWL', round(r.ebwl.percent, 1), '%', 'Estimated body weight lost', 'caution')
          : null
      ]),
      el('table', { class: 'crcl-table crcl-table-compact' }, [
        el('tbody', {}, [
          ['Height',               round(r.heightCm, 1) + ' cm  (' + feetInches(r.heightCm) + ')'],
          ['Actual body weight',   round(r.weights.actual, 1) + ' kg  (' + round(Core.toLb(r.weights.actual), 1) + ' lb)'],
          amputated
            ? ['Ideal body weight', round(r.weights.ideal, 1) + ' kg  (' + round(Core.toLb(r.weights.ideal), 1) + ' lb)  — ' +
                round(r.idealIntact, 1) + ' kg intact, less ' + round(r.ebwl.percent, 1) + '% EBWL']
            : ['Ideal body weight', round(r.weights.ideal, 1) + ' kg  (' + round(Core.toLb(r.weights.ideal), 1) + ' lb)'],
          ['Adjusted body weight', round(r.weights.adjusted, 1) + ' kg  (' + round(Core.toLb(r.weights.adjusted), 1) + ' lb)'],
          ['Lean body weight',     round(r.weights.lean, 1) + ' kg  (' + round(Core.toLb(r.weights.lean), 1) + ' lb)'],
          amputated
            ? ['Intact-equivalent weight', round(r.weights.actual / (1 - r.ebwl.percent / 100), 1) + ' kg  (' +
                round(Core.toLb(r.weights.actual / (1 - r.ebwl.percent / 100)), 1) + ' lb)  — used for BMI only']
            : null,
          ['BSA, Mosteller',       round(r.bsaMosteller, 2) + ' m²'],
          ['BSA, Du Bois',         round(r.bsaDuBois, 2) + ' m²'],
          ['Creatinine used',      round(r.scrApplied, 2) + ' mg/dL  (' + round(Core.scrToUmol(r.scrApplied), 0) + ' µmol/L)' +
                                    (r.scrFloorApplied ? '  — rounded up to the 1.0 floor' : '')],
          r.idmsAdjust ? ['Creatinine in Cockcroft-Gault', round(r.scrForCg, 2) + ' mg/dL  — non-IDMS equivalent'] : null
        ].filter(Boolean).map(function (row) {
          return el('tr', {}, [
            el('th', { scope: 'row', text: row[0] }),
            el('td', { class: 'crcl-num', text: row[1] })
          ]);
        }))
      ]),
      amputated
        ? el('table', { class: 'crcl-table crcl-table-compact crcl-amp-breakdown' }, [
            el('thead', {}, [el('tr', {}, [
              el('th', { text: 'Amputation' }),
              el('th', { text: 'Level' }),
              el('th', { class: 'crcl-num', text: 'EBWL' })
            ])]),
            el('tbody', {}, r.ebwl.items.map(function (i) {
              return el('tr', {}, [
                el('th', { scope: 'row', text: i.label }),
                el('td', { text: i.levelLabel }),
                el('td', { class: 'crcl-num', text: i.pct + '%' })
              ]);
            }).concat([
              el('tr', { class: 'is-selected' }, [
                el('th', { scope: 'row', text: 'Total' }),
                el('td', {}),
                el('td', { class: 'crcl-num crcl-strong', text: round(r.ebwl.percent, 1) + '%' })
              ])
            ]))
          ])
        : null,
      el('div', { class: 'crcl-bmi-scale' }, [
        ['<18.5', 'Under'], ['18.5–24.9', 'Normal'], ['25–29.9', 'Over'],
        ['30–34.9', 'Class I'], ['35–39.9', 'Class II'], ['≥40', 'Class III']
      ].map(function (b, i) {
        var active = [
          r.bmi < 18.5, r.bmi >= 18.5 && r.bmi < 25, r.bmi >= 25 && r.bmi < 30,
          r.bmi >= 30 && r.bmi < 35, r.bmi >= 35 && r.bmi < 40, r.bmi >= 40
        ][i];
        return el('div', { class: 'crcl-bmi-band' + (active ? ' is-on' : '') }, [
          el('span', { class: 'crcl-bmi-range', text: b[0] }),
          el('span', { class: 'crcl-bmi-name', text: b[1] })
        ]);
      }))
    ];
    container.appendChild(section('Body size', bodyChildren));

    /* ---- AKI ---- */
    if (r.aki) {
      var aki = r.aki;
      var tone = !aki.meetsCriteria ? 'ok' : (aki.stage === 3 ? 'avoid' : aki.stage === 2 ? 'warn' : 'caution');
      var akiChildren = [
        el('div', { class: 'crcl-stats' }, [
          statCard('KDIGO AKI', aki.meetsCriteria ? 'Stage ' + aki.stage : 'Not met', null,
            aki.summary, tone),
          statCard('Creatinine ratio', round(aki.ratio, 2) + '×', null,
            (aki.delta >= 0 ? '+' : '') + round(aki.delta, 2) + ' mg/dL from baseline', null),
          r.crclPercentChange !== undefined
            ? statCard('Change in CrCl', (r.crclPercentChange >= 0 ? '+' : '') + round(r.crclPercentChange, 0), '%',
                'vs. ' + round(r.baselineCrClEntered || r.baselineCrClDerived, 0) + ' mL/min at baseline' +
                (r.baselineCrClEntered ? ' (entered)' : ' (derived)'), null)
            : null
        ]),
        aki.metBy.length ? el('ul', { class: 'crcl-list' }, aki.metBy.map(function (m) {
          return el('li', { text: m });
        })) : null,
        el('p', { class: 'crcl-note', text:
          'Creatinine criteria only. KDIGO also defines AKI by urine output under 0.5 mL/kg/h for 6 hours or more, which is not assessed here. ' +
          'While creatinine is changing, neither Cockcroft-Gault nor CKD-EPI reflects true clearance — both lag behind a falling GFR.'
        })
      ];
      container.appendChild(section('Acute kidney injury', akiChildren, 'crcl-card-aki'));
    }

    /* ---- medication ---- */
    if (r.medication) {
      var m = r.medication;
      var band = m.band;
      var metricLabel = m.metric === 'egfr'
        ? 'eGFR ' + round(m.value, 0) + ' mL/min/1.73m²'
        : 'CrCl ' + round(m.value, 0) + ' mL/min';
      var medChildren = [
        el('div', { class: 'crcl-med-head' }, [
          el('div', {}, [
            el('strong', { text: m.drug.name + (m.drug.brand ? ' (' + m.drug.brand + ')' : '') }),
            m.drug.indication ? el('div', { class: 'crcl-med-ind', text: m.drug.indication }) : null
          ]),
          el('span', { class: 'crcl-badge crcl-badge-metric', text: metricLabel })
        ]),
        band
          ? el('div', { class: 'crcl-rec is-' + band.severity }, [
              el('div', { class: 'crcl-rec-dose', text: band.dose }),
              el('div', { class: 'crcl-rec-band', text: bandRange(band, m.metric) })
            ])
          : el('div', { class: 'crcl-alert is-warn', text: 'No dosing band covers this value.' }),
        m.drug.weightBasis === 'abw'
          ? el('div', { class: 'crcl-alert is-info', text:
              'This product’s labeling specifies Cockcroft-Gault with ACTUAL body weight, so the weight hierarchy above is overridden.' })
          : null,
        m.drug.notes ? el('p', { class: 'crcl-note', text: m.drug.notes }) : null,
        el('table', { class: 'crcl-table crcl-table-compact' }, [
          el('tbody', {}, m.drug.bands.map(function (b) {
            return el('tr', { class: b === band ? 'is-selected' : null }, [
              el('th', { scope: 'row', text: bandRange(b, m.metric) }),
              el('td', { text: b.dose })
            ]);
          }))
        ]),
        m.drug.source ? el('p', { class: 'crcl-source', text: 'Source: ' + m.drug.source }) : null
      ];
      container.appendChild(section('Renal dose check', medChildren, 'crcl-card-med'));
    }

    /* ---- notes ---- */
    if (r.notes.length) {
      container.appendChild(section('Interpretation notes', [
        el('ul', { class: 'crcl-list' }, r.notes.map(function (n) { return el('li', { text: n }); }))
      ], 'crcl-card-notes'));
    }

    container.appendChild(el('p', { class: 'crcl-disclaimer', text:
      'For use by qualified healthcare professionals. These are population estimates, not measured clearance. ' +
      'Confirm every dose against current prescribing information and the clinical context before acting on it.'
    }));
  }

  function bandRange(band, metric) {
    var unit = metric === 'egfr' ? ' mL/min/1.73m²' : ' mL/min';
    if (band.min === null || band.min === undefined) return '< ' + band.max + unit;
    if (band.max === null || band.max === undefined) return '≥ ' + band.min + unit;
    return band.min + '–' + band.max + unit;
  }

  /* ----------------------------------------------------------------- wire */

  function init(root) {
    if (root.dataset.crclReady) return;
    root.dataset.crclReady = '1';

    var state = {
      ageMode: 'years', sex: null,
      heightUnit: 'in', weightUnit: 'lb', scrUnit: 'mgdl', stable: 'yes'
    };

    buildMarkup(root, state);

    var form = root.querySelector('.crcl-form');
    var results = root.querySelector('[data-role=results]');

    /* segmented controls */
    root.querySelectorAll('.crcl-seg').forEach(function (seg) {
      var key = seg.dataset.seg;
      seg.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-value]');
        if (!btn) return;
        seg.querySelectorAll('button').forEach(function (b) { b.classList.remove('is-on'); });
        btn.classList.add('is-on');
        state[key] = btn.dataset.value;
        onStateChange(key);
      });
    });

    function onStateChange(key) {
      if (key === 'ageMode') {
        root.querySelectorAll('[data-when]').forEach(function (n) {
          var parts = n.dataset.when.split('=');
          n.hidden = state[parts[0]] !== parts[1];
        });
      }
      if (key === 'scrUnit') {
        root.querySelector('[data-role=baseline-unit]').textContent =
          state.scrUnit === 'umol' ? 'µmol/L' : 'mg/dL';
        var scrInput = form.scr;
        scrInput.step = state.scrUnit === 'umol' ? '1' : '0.01';
        form.baselineScr.step = scrInput.step;
        updateScrHint();
      }
    }

    function updateScrHint() {
      var hint = root.querySelector('[data-role=scr-converted]');
      var v = num(form.scr.value);
      if (v === null) { hint.textContent = ''; return; }
      hint.textContent = state.scrUnit === 'umol'
        ? '≈ ' + (v / Core.UMOL_PER_MGDL).toFixed(2) + ' mg/dL'
        : '≈ ' + Math.round(v * Core.UMOL_PER_MGDL) + ' µmol/L';
    }
    form.scr.addEventListener('input', updateScrHint);

    /* amputations */
    function readAmputations() {
      var sel = {};
      Core.AMPUTATION_SITES.forEach(function (s) { sel[s.key] = form['amp_' + s.key].value; });
      return sel;
    }

    function updateAmputationSummary() {
      var e = Core.ebwl(readAmputations());
      root.querySelector('[data-role=amp-summary]').textContent =
        e.percent ? 'Amputations — ' + round(e.percent, 1) + '% EBWL'
                  : 'Amputations — none';
      var total = root.querySelector('[data-role=amp-total]');
      total.hidden = !e.percent;
      total.innerHTML = '';
      if (e.percent) {
        total.appendChild(el('div', { class: 'crcl-amp-total-value' }, [
          el('strong', { text: round(e.percent, 1) + '%' }),
          document.createTextNode(' estimated body weight lost')
        ]));
        total.appendChild(el('div', { class: 'crcl-amp-total-items', text:
          e.items.map(function (i) { return i.label + ': ' + i.levelLabel + ' (' + i.pct + '%)'; }).join(' · ')
        }));
      }
    }
    root.querySelector('[data-role=amp-grid]').addEventListener('change', updateAmputationSummary);

    /* live age from DOB */
    form.dob.addEventListener('input', function () {
      var age = Core.ageFromDob(form.dob.value);
      root.querySelector('[data-role=dob-age]').textContent =
        age === null ? '' : age + ' years';
    });

    form.addEventListener('reset', function () {
      results.hidden = true;
      results.innerHTML = '';
      root.querySelectorAll('.crcl-error').forEach(function (n) { n.remove(); });
      root.querySelector('[data-role=scr-converted]').textContent = '';
      root.querySelector('[data-role=dob-age]').textContent = '';
      setTimeout(updateAmputationSummary, 0);
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      root.querySelectorAll('.crcl-error').forEach(function (n) { n.remove(); });

      var errors = [];
      var age = state.ageMode === 'dob'
        ? Core.ageFromDob(form.dob.value)
        : num(form.age.value);
      if (age === null) errors.push(state.ageMode === 'dob' ? 'Enter a valid date of birth.' : 'Enter an age.');
      else if (age < 0 || age > 120) errors.push('Age must be between 0 and 120 years.');

      if (!state.sex) errors.push('Select a sex. The Cockcroft-Gault 0.85 factor and the CKD-EPI coefficients both depend on it.');

      var height = num(form.height.value);
      if (height === null || height <= 0) errors.push('Enter a height.');

      var weight = num(form.weight.value);
      if (weight === null || weight <= 0) errors.push('Enter a weight.');

      var scr = num(form.scr.value);
      if (scr === null || scr <= 0) errors.push('Enter a serum creatinine.');

      if (errors.length) {
        var box = el('div', { class: 'crcl-alert is-error crcl-error' }, [
          el('strong', { text: errors.length === 1 ? 'Check this field' : 'Check these fields' }),
          el('ul', {}, errors.map(function (m) { return el('li', { text: m }); }))
        ]);
        form.querySelector('.crcl-actions').insertAdjacentElement('beforebegin', box);
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }

      var heightCm = Core.toCm(height, state.heightUnit);
      var weightKg = Core.toKg(weight, state.weightUnit);
      var scrMgdl = Core.scrToMgdl(scr, state.scrUnit);
      var baselineScr = num(form.baselineScr.value);
      var medSelect = form.medication;
      var med = null;
      if (medSelect && medSelect.value) {
        med = (window.CRCL_MEDICATIONS || []).filter(function (m) {
          return m.id === medSelect.value;
        })[0] || null;
      }

      var out = Core.evaluate({
        age: age,
        sex: state.sex,
        heightCm: heightCm,
        weightKg: weightKg,
        scrMgdl: scrMgdl,
        baselineScrMgdl: baselineScr === null ? null : Core.scrToMgdl(baselineScr, state.scrUnit),
        baselineCrCl: num(form.baselineCrCl.value),
        hoursSinceBaseline: num(form.hours.value),
        stableRenal: state.stable === 'yes',
        scrFloor: form.scrFloor.checked ? 1.0 : null,
        idmsAdjust: form.idmsAdjust.checked,
        bsaFormula: form.bsaFormula.value,
        amputations: readAmputations(),
        medication: med
      });

      renderResults(results, out, state);
      results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  function boot() {
    document.querySelectorAll('[data-crcl-calculator]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.CrClCalculator = { init: init, boot: boot };
})();
