"""Build ward and polling-unit JSON from the INEC Kaduna sheet.

Usage: python3 scripts/build_geo.py path/to/KADUNA.xlsx
Writes data/wards.json ({LGA: [ward, ...]}) and data/pu/<lga-slug>.json
({ward: [[code, polling unit], ...]}).
"""
import json, re, sys, collections, pathlib
import openpyxl

def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

def clean(v):
    return re.sub(r'\s+', ' ', str(v or '')).strip()

src = sys.argv[1]
root = pathlib.Path(__file__).resolve().parent.parent
wb = openpyxl.load_workbook(src, read_only=True)
ws = wb.active
geo = collections.OrderedDict()
skipped = 0
for i, r in enumerate(ws.iter_rows(values_only=True)):
    if i == 0:
        continue
    lga, ward, pu, code = clean(r[2]), clean(r[3]), clean(r[4]), clean(r[5])
    if not (lga and ward and pu):
        skipped += 1
        continue
    geo.setdefault(lga, collections.OrderedDict()).setdefault(ward, []).append([code, pu])

wards = {lga: list(w.keys()) for lga, w in geo.items()}
(root / 'data' / 'wards.json').write_text(json.dumps(wards, separators=(',', ':')))
(root / 'data' / 'pu').mkdir(parents=True, exist_ok=True)
for lga, w in geo.items():
    (root / 'data' / 'pu' / f'{slug(lga)}.json').write_text(json.dumps(w, separators=(',', ':')))
print(f"{len(geo)} LGAs, {sum(len(v) for v in wards.values())} wards, "
      f"{sum(len(p) for w in geo.values() for p in w.values())} polling units, {skipped} rows skipped")
