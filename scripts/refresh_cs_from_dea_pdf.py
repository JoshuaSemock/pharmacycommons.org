"""
Diff the DEA Orange Book (c_cs_alpha.pdf) against public.federal_controlled_substances.
READ-ONLY: writes three CSV reports; never modifies the database.

  pip install pdfplumber requests
  export SUPABASE_URL=https://nenwovhyrdcdkhxzjiiv.supabase.co
  export SUPABASE_KEY=<publishable key is enough: the table is public-read>
  python refresh_cs_from_dea_pdf.py c_cs_alpha.pdf

Reports:
  dea_new.csv       in the PDF, not in the table  (new scheduling actions -> review, add as Importance=Low)
  dea_missing.csv   in the table, not in the PDF  (possibly descheduled, or a naming difference)
  dea_mismatch.csv  same CSCN number, different schedule
The matching key is (CSCN number, schedule), because DEA names are long and inconsistent.
NOTE: written without access to the live PDF. Check dea_rows.csv (the raw parse) first.
"""
import csv, os, re, sys
import pdfplumber, requests

ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5}
ROW = re.compile(r"^(?P<name>.+?)\s+(?P<cscn>\d{4})\s+(?P<sch>III|II|IV|I|V)\s+(?P<narc>[YN])\s*$")


def parse_pdf(path):
    rows, pending = [], ""
    with pdfplumber.open(path) as pdf:
        for pno, page in enumerate(pdf.pages, 1):
            # 1) table extraction, if the PDF has ruled tables
            for tbl in page.extract_tables() or []:
                for r in tbl:
                    cells = [(c or "").replace("\n", " ").strip() for c in r]
                    if len(cells) >= 4 and re.fullmatch(r"\d{4}", cells[1]) and cells[2] in ROMAN:
                        rows.append((cells[0], int(cells[1]), ROMAN[cells[2]], cells[3], pno))
            if rows and rows[-1][4] == pno:
                continue
            # 2) fallback: regex over text lines, joining wrapped names
            for line in (page.extract_text() or "").splitlines():
                m = ROW.match((pending + " " + line).strip())
                if m:
                    rows.append((m["name"], int(m["cscn"]), ROMAN[m["sch"]], m["narc"], pno))
                    pending = ""
                else:
                    pending = line if len(line) < 120 else ""
    return rows


def fetch_table():
    url = os.environ["SUPABASE_URL"] + "/rest/v1/federal_controlled_substances"
    h = {"apikey": os.environ["SUPABASE_KEY"], "Authorization": "Bearer " + os.environ["SUPABASE_KEY"]}
    out, start = [], 0
    while True:
        r = requests.get(url, headers={**h, "Range": f"{start}-{start+999}"},
                         params={"select": "drug_name,schedule_num,dea_cscn,importance"})
        r.raise_for_status()
        chunk = r.json()
        out += chunk
        if len(chunk) < 1000:
            return out
        start += 1000


def write(name, header, data):
    with open(name, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(header); w.writerows(data)
    print(f"{name}: {len(data)}")


pdf_rows = parse_pdf(sys.argv[1])
write("dea_rows.csv", ["name", "cscn", "schedule", "narcotic", "page"], pdf_rows)
db = fetch_table()

pdf_keys = {(c, s) for _, c, s, _, _ in pdf_rows}
db_keys = {(r["dea_cscn"], r["schedule_num"]) for r in db if r["dea_cscn"]}
pdf_by_cscn, db_by_cscn = {}, {}
for n, c, s, _, p in pdf_rows: pdf_by_cscn.setdefault(c, set()).add(s)
for r in db:
    if r["dea_cscn"]: db_by_cscn.setdefault(r["dea_cscn"], set()).add(r["schedule_num"])

# CSCN 4000/7000/1000 are shared by whole classes (steroids, cannabinoids, cathinones), so
# match those by name instead of by number.
SHARED = {1000, 4000, 7000}
db_names = {(r["drug_name"].lower(), r["schedule_num"]) for r in db}
new = [(n, c, s, p) for n, c, s, _, p in pdf_rows
       if ((c in SHARED and (n.lower(), s) not in db_names) or (c not in SHARED and (c, s) not in db_keys))]
missing = [(r["drug_name"], r["dea_cscn"], r["schedule_num"], r["importance"]) for r in db
           if r["dea_cscn"] and r["dea_cscn"] not in SHARED and (r["dea_cscn"], r["schedule_num"]) not in pdf_keys]
mismatch = [(c, sorted(pdf_by_cscn[c]), sorted(db_by_cscn[c])) for c in pdf_by_cscn
            if c in db_by_cscn and c not in SHARED and pdf_by_cscn[c] != db_by_cscn[c]]
write("dea_new.csv", ["name", "cscn", "schedule", "page"], new)
write("dea_missing.csv", ["drug_name", "cscn", "schedule", "importance"], missing)
write("dea_mismatch.csv", ["cscn", "pdf_schedules", "db_schedules"], mismatch)
