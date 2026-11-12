"""Convert DHA's membership portal sample (samples/DHA_Sample_Data_n.xlsx) to data/membership_sample.json.

    python -I pipeline/build_membership_sample.py

The app is zero-dependency Node and cannot read .xlsx, so this one-off step turns each sheet into a list of
rows with DHA's own column names. Dates become ISO strings and empty cells become null. Masked values (CNIC,
mobile, email, address) are kept as they are: app/core/seed.js gives every record a unique demo CNIC.
"""
import datetime
import json
import pathlib

import openpyxl

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'samples' / 'DHA_Sample_Data_n.xlsx'
OUT = ROOT / 'data' / 'membership_sample.json'


def cell(v):
    if isinstance(v, datetime.datetime):
        return v.strftime('%Y-%m-%d %H:%M:%S')
    if isinstance(v, datetime.date):
        return v.isoformat()
    if isinstance(v, str):
        v = v.strip()
        return v if v not in ('', 'NULL') else None
    return v


def main():
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    out = {'source': SRC.name, 'sheets': {}}
    for ws in wb.worksheets:
        rows = [r for r in ws.iter_rows(values_only=True) if any(c is not None for c in r)]
        header = [str(h).strip() for h in rows[0]]
        out['sheets'][ws.title] = [dict(zip(header, (cell(c) for c in r))) for r in rows[1:]]
        print(f'{ws.title}: {len(rows) - 1} rows')
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'Wrote {OUT} ({OUT.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
