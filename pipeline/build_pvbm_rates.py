"""Turn PVBM-N.pdf (DHA Property Exchange "Price Valuation Benchmarking") into data/pvbm_rates.json.

    python pipeline/build_pvbm_rates.py [path/to/PVBM-N.pdf]

The PDF gives min-max prices in Rs million by phase, sector and size. Column headers differ per page, so each
page's columns are written out below; the numbers are read from the text. Pages whose layout cannot be read
reliably (Phase I commercial, apartments) are skipped and listed in the output, so nothing is guessed.
Sizes: 1 marla = 25 sq yd, 1 kanal = 500 sq yd (as the PDF itself uses: 8 marla = 200 sq yd).
"""

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
PDF = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "PVBM-N.pdf"
OUT = ROOT / "data" / "pvbm_rates.json"


def col(label, sqyd, kind=None):
    return {"label": label, "sqyd": sqyd, "kind": kind}


KANAL, M10, M5 = "1 Kanal", "10 Marla", "5 Marla"

# page number -> layout. kind: plot (default), certificate (file, no plot number yet), non_balloted, balloted
PAGES = {
    1: {"phase": "1", "phase_label": "Phase I", "use": "residential",
        "cols": [col("2 Kanal", 1000), col(KANAL, 500), col("10-12 Marla", 250), col("8 Marla", 200), col("16 Marla", 400), col("32 Marla", 800)]},
    2: {"phase": "2", "phase_label": "Phase II", "use": "residential",
        "cols": [col("2 Kanal", 1000), col(KANAL, 500), col(M10, 250), col(M5, 125)]},
    3: {"phase": "3", "phase_label": "Phase III", "use": "residential",
        "cols": [col("2 Kanal", 1000), col(KANAL, 500), col(M10, 250), col("8 Marla", 200), col("5.33 Marla", 133), col(M5, 125)]},
    4: {"phase": "4", "phase_label": "Phase IV", "use": "residential",
        "cols": [col(KANAL, 500, "plot"), col(KANAL, 500, "certificate"), col(M10, 250), col("7-8 Marla", 188), col(M5, 125)]},
    5: {"phase": "5", "phase_label": "Phase V", "use": "residential",
        "cols": [col("2 Kanal", 1000), col("30 Marla", 750), col(KANAL, 500), col(M10, 250), col("8 Marla", 200), col(M5, 125)]},
    6: {"phase": "6", "phase_label": "Phase VI", "use": "residential",
        "cols": [col("2 Kanal", 1000), col(KANAL, 500), col(M10, 250)]},
    7: {"phase": "ME", "phase_label": "Margalla Enclave", "use": "residential",
        "cols": [col(KANAL, 500), col(M10, 250), col(M5, 125)]},
    8: {"phase": "6X", "phase_label": "Phase VI (ex Phase II Extension)", "use": "residential", "pairs": True,
        "cols": [col(KANAL, 500, "certificate")]},
    9: {"phase": "6X", "phase_label": "Phase VI (ex Phase II Extension)", "use": "residential", "pairs": True,
        "cols": [col(KANAL, 500, "certificate")]},
    10: {"phase": "7", "phase_label": "Phase VII", "use": "residential",
         "cols": [col(M5, 125, "non_balloted"), col("8 Marla", 200, "non_balloted"), col(M5, 125, "balloted"), col("8 Marla", 200, "balloted")]},
    11: {"phase": "7", "phase_label": "Phase VII", "use": "residential", "pairs": True,
         "cols": [col(M5, 125, "non_balloted"), col("8 Marla", 200, "non_balloted")]},
    12: {"phase": "HV", "phase_label": "DHA Homes & Defence Villas", "use": "house",
         "cols": [col("11 Marla", 275), col(M5, 125), col("8 Marla", 200)]},
    14: {"phase": "2", "phase_label": "Phase II", "use": "commercial",
         "cols": [col("3.5 Marla", 88), col("4 Marla", 100), col(M5, 125), col("5.3 Marla", 133), col("5.5 Marla", 138), col("8 Marla", 200)]},
    15: {"phase": "3", "phase_label": "Phase III", "use": "commercial",
         "cols": [col("0.96 Marla", 24), col("2.67 Marla", 67), col("4 Marla", 100), col("5.33 Marla", 133), col("7.11-8 Marla", 189), col("10.67 Marla", 267)]},
    16: {"phase": "4", "phase_label": "Phase IV", "use": "commercial",
         "cols": [col("4 Marla", 100), col("8 Marla", 200), col("10.66 Marla", 267)]},
    17: {"phase": "5", "phase_label": "Phase V", "use": "commercial",
         "cols": [col("4 Marla", 100), col("5.33 Marla", 133), col("6 Marla", 150), col("8 Marla", 200)]},
    18: {"phase": "6", "phase_label": "Phase VI", "use": "commercial",
         "cols": [col("4 Marla", 100), col("8 Marla", 200)]},
    19: {"phase": "MO", "phase_label": "Margalla Orchards", "use": "commercial",
         "cols": [col("5.33 Marla", 133), col("8 Marla", 200), col("10.66 Marla", 267)]},
    20: {"phase": "7", "phase_label": "Phase VII", "use": "commercial",
         "cols": [col("4 Marla", 100, "non_balloted"), col("8 Marla", 200, "non_balloted"), col("4 Marla", 100, "balloted"), col("8 Marla", 200, "balloted")]},
}
SKIPPED = {13: "Phase I commercial: mixed layouts (G+2/G+3/G+5 buildings)", 21: "Apartments: not plots"}

RANGE = re.compile(r"(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*M?")
SINGLE = re.compile(r"(\d+(?:\.\d+)?)\s*M\b")
DASH = re.compile(r"[–-](?=\s|$)")
PREFIX = re.compile(r"^(River View (North|South)|Business)\s*$")


def cells(rest, pairs):
    out = []
    i = 0
    while i < len(rest):
        if rest[i].isspace():
            i += 1
            continue
        if pairs:
            m = SINGLE.match(rest, i)
            if m:
                out.append(float(m.group(1)))
                i = m.end()
                continue
        m = RANGE.match(rest, i)
        if m:
            out.append((float(m.group(1)), float(m.group(2))))
            i = m.end()
            continue
        m = DASH.match(rest, i)
        if m:
            out.append(None)
            i = m.end()
            continue
        break  # remarks such as "(G+2)" end the row
    if pairs:  # "min max" written as two single numbers
        out = [(a, b) if a is not None and b is not None else None for a, b in zip(out[0::2], out[1::2])]
    return out


def data_lines(text):
    prefix = ""
    for raw in text.splitlines():
        line = raw.strip()
        if not line or (line.startswith("(") and not prefix) or "Nov" in line or line.startswith("NOTE"):
            continue
        if PREFIX.match(line):
            prefix = line + " "
            continue
        has_value = RANGE.search(line) or SINGLE.search(line)
        if not has_value:
            continue
        yield prefix + line
        prefix = ""


def split_sector(line, page):
    if page == 6:
        line = re.sub(r"^([A-D]) (\d)\b", r"\1\2", line)  # "A 1" -> "A1"
    m = re.match(r"^(.+?)\s+(?=\d|[–-](\s|$))", line)
    return (m.group(1).strip(), line[m.end():]) if m else (None, None)


def build():
    pages = PdfReader(PDF).pages
    rows, notes = [], []
    period = None
    for pno in range(1, len(pages) + 1):
        text = pages[pno - 1].extract_text()
        if not period:
            m = re.search(r"(\d+)\s*[–-]\s*(\d+)\s+(\w{3})\s+(\d{4})", text)
            period = m and f"{m[1]}–{m[2]} {m[3]} {m[4]}"
        for n in re.findall(r"NOTE:.*", text):
            notes.append({"page": pno, "text": n.strip()})
        spec = PAGES.get(pno)
        if not spec:
            continue
        for line in data_lines(text):
            sector, rest = split_sector(line, pno)
            if not sector or re.match(r"^(Shops?|SECTOR\b(?! F))", sector):
                continue
            house = bool(re.match(r"^Houses?$", sector)) or spec["use"] == "house"
            vals = cells(rest, spec.get("pairs"))
            for c, v in zip(spec["cols"], vals):
                if not v:
                    continue
                lo, hi = sorted(v)
                rows.append({
                    "phase": spec["phase"], "phase_label": spec["phase_label"],
                    "use": "house" if house else spec["use"],
                    "kind": c["kind"] or "plot",
                    "sector": "All sectors" if house and spec["use"] != "house" else sector,
                    "size": c["label"], "sqyd": c["sqyd"],
                    "min": round(lo * 1_000_000), "max": round(hi * 1_000_000), "page": pno,
                })
    return {
        "source": "PVBM-N.pdf: DHA Property Exchange, Price Valuation Benchmarking",
        "period": period, "unit": "PKR", "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "status": "Market benchmark shared by DHA; to be confirmed by DHA before use as official prices",
        "skipped_pages": SKIPPED, "notes": notes, "rates": rows,
    }


if __name__ == "__main__":
    out = build()
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    from collections import Counter
    c = Counter((r["phase_label"], r["use"]) for r in out["rates"])
    print(f"{OUT}: {len(out['rates'])} rates, period {out['period']}")
    for k, n in sorted(c.items()):
        print(f"  {k[0]:<34} {k[1]:<12} {n}")
