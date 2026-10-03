"""
Clean Joshua's Dictionary.xlsx into db/data/dictionary_<date>.json for the
phase 14 dictionary load (see db/phase14_dictionary.sql).

    python scripts/dictionary_clean.py path/to/Dictionary.xlsx db/data/dictionary_2026-10-03.json

What it does, and nothing else:
  * trims whitespace (including non-breaking spaces) and collapses runs of it;
  * repairs the UTF-8-read-as-cp1252 mojibake found in 23 terms
    ("ringerâ€™s" -> "ringer’s", "ãžâ±-methylfentanyl" -> "α-methylfentanyl");
  * turns the PCID column (read as floats, "1000001.0") into integers;
  * computes `bucket` and `sort_key` with the same rules the browse A–Z index
    uses (src/catalog.ts `bucketOf`), except that a spelled-out Greek letter
    only files under the Greek bucket when a hyphen follows it ("beta-carotene"),
    so abbreviations such as PSI, ETA or PI stay under their Latin letter.
    `src/dictionary.ts` `dictionaryBucketOf` is the TypeScript twin; keep them in step.

Definitions are kept verbatim apart from trimming.
"""
import json
import re
import sys

import openpyxl

GREEK = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa',
         'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi',
         'chi', 'psi', 'omega']
GREEK_GLYPHS = 'αβγδεζηθικλμνξοπρστυφχψω'
GREEK_BY_GLYPH = dict(zip(GREEK_GLYPHS, GREEK))

# A Greek letter is UTF-8 CE xx; read as cp1252 it shows as "Î" + one of ° ± ² … ¿,
# and the source lower-cased some of those to "î…" or "ãžâ…".
GREEK_MOJIBAKE = re.compile('(?:ãžâ|î|Î)([\u00b0-\u00bf])')

MOJIBAKE = [
    ('â€™', '’'), ('â€˜', '‘'), ('â€²', '′'), ('â€œ', '“'), ('â€\x9d', '”'),
    ('â€“', '–'), ('â€”', '—'), ('â„¢', '™'),
    ('â\x80\x99', '’'),   # the same apostrophe read as Latin-1
]

# Latin-1 symbols (C2 xx) read as cp1252 show as "Â" + the symbol: "Â®", "(Â±)"; lower-cased "â®".
LATIN1_MOJIBAKE = re.compile('[Ââ]([\\u00a0-\\u00bf])')

WS = re.compile(r'\s+')


def clean_text(v):
    if v is None:
        return None
    s = str(v).replace('\u00a0', ' ')
    for bad, good in MOJIBAKE:
        s = s.replace(bad, good)
    s = GREEK_MOJIBAKE.sub(lambda m: chr(0x0380 + ord(m.group(1)) - 0x80), s)
    s = LATIN1_MOJIBAKE.sub(r'\1', s)
    s = WS.sub(' ', s).strip()
    return s or None


def strip_lead(s):
    return re.sub(r'^[^a-z0-9\u0370-\u03ff]+', '', s)


def is_symbol_led(s):
    m = re.match(r'^[(\[{]([^)\]}]*)[)\]}]', s)
    if m:
        inner = m.group(1).strip()
        return len(inner) > 0 and not re.search(r'[a-z0-9\u0370-\u03ff]', inner, re.I)
    return bool(s) and not re.match(r'[a-z0-9(\[{\u0370-\u03ff]', s[0], re.I)


def bucket_of(term):
    raw = term.strip().lower().replace('\u00b5', 'μ')   # micro sign -> Greek mu
    if not raw or is_symbol_led(raw):
        return 'sym'
    s = strip_lead(raw)
    if not s:
        return 'sym'
    core = re.sub(r"^[\d,'’\-\s]+", '', s)
    m = re.match(r'^(' + '|'.join(GREEK) + r')-', core)
    if m:
        return 'g:' + m.group(1)
    if core[:1] in GREEK_BY_GLYPH:
        return 'g:' + GREEK_BY_GLYPH[core[0]]
    c = s[0]
    if 'a' <= c <= 'z':
        return c.upper()
    if '0' <= c <= '9':
        return '#'
    return 'sym'


def sort_key(term):
    return strip_lead(term.strip().lower().replace('\u00b5', 'μ'))


def main(src, out):
    ws = openpyxl.load_workbook(src, read_only=True).active
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    assert header[0] == 'ID' and header[1] == 'PCID' and header[3] == 'Terminology', header
    data = []
    for r in rows:
        if r[0] is None:
            continue
        term = clean_text(r[3])
        if not term:
            continue
        pcid = r[1]
        data.append({
            'id': int(r[0]),
            'source_pcid': int(float(pcid)) if pcid not in (None, '') else None,
            'source_letter': clean_text(r[2]),
            'term': term,
            'definition': clean_text(r[4]),
            'kind': clean_text(r[5]),
            'term_type': clean_text(r[6]),
            'source_tjc_flag': bool(r[7]),
            'bucket': bucket_of(term),
            'sort_key': sort_key(term),
        })
    ids = [d['id'] for d in data]
    assert len(ids) == len(set(ids)), 'duplicate IDs'
    cols = list(data[0].keys())
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'columns': cols, 'rows': [[d[c] for c in cols] for d in data]},
                  f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(data)} rows -> {out}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
