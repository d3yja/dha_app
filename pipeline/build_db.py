"""Build data/dha.sqlite: the 22 CSV tables, document chunks, FTS5 index and BGE-M3 vectors.

Run after extract.py:  python -I pipeline/build_db.py [--no-embed]
Embeddings are cached in pipeline/out/emb_cache.npz by chunk text, so rebuilds are fast.
"""
import csv
import hashlib
import json
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DATA = ROOT / "data"
DB_PATH = DATA / "dha.sqlite"
CACHE = HERE / "out" / "emb_cache.npz"

BYELAWS_URL = "https://www.dhai-r.com.pk/static/DHA_byelaws/DHAbyelaws.pdf"
BYELAWS_TITLE = "DHA Byelaws & Regulations 2022 (updated 2023)"
CHAPTERS = {
    1: "Preliminary & Definitions", 2: "Transfer & Record Directorate", 3: "Finance Directorate",
    4: "Business Development", 5: "Marketing Directorate", 6: "Town Planning Directorate",
    7: "Guidelines during Construction", 8: "Building Control Directorate", 9: "Administration Directorate",
    10: "Environment Directorate", 11: "Services / Maintenance / Development", 12: "Security Directorate",
    13: "Information Technology Directorate", 14: "Regularization Charges", 15: "Fines", 16: "Forms & Annexures",
}
ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI"]

TARGET_WORDS = 180   # pack small pieces up to about this size
MAX_WORDS = 320      # split anything longer


def words(s):
    return len(s.split())


def clean(s):
    s = s.replace("", "-").replace("", "-").replace("•", "-").replace("�", "-")
    s = re.sub(r"[ \t ]+", " ", s)
    return s.strip()


def split_long(text, limit=MAX_WORDS, overlap=40):
    w = text.split()
    if len(w) <= limit:
        return [text]
    out, step = [], limit - overlap
    for i in range(0, len(w), step):
        out.append(" ".join(w[i:i + limit]))
        if i + limit >= len(w):
            break
    return out


# ---------- Byelaws: one chunk per clause group ----------

BYELAW_NOISE = re.compile(
    r"^(DEFENCE HOUSING AUTHORITY ISLAMABAD & RAWALPINDI REGULATIONS 2022|PART-[IV]+|CHAPTER-[IVXL]+|\d{1,3}|"
    r"\(?PART-[IV]+\)?|FORMS ?& ?ANNEXURES?|"
    r"[A-Z &/\-–]{6,}DIRECTORATE[A-Z &/\-–]*|PRELIMINARY ?& DEFINITIONS)$")
ANNEX = re.compile(r"^Anx\s+([A-Z]{1,2})$")  # forms at the end of the Byelaws: Anx A … Anx W
CLAUSE = re.compile(r"^(\d{1,2}(?:\.\d{1,3}){1,4})\.?(?:\s+(.*))?$")


def byelaw_chunks(doc):
    clauses = []  # [number, text, page]
    in_annex, titles_annex = False, {}
    for p in doc["pages"]:
        for raw in (p["text"] or "").split("\n"):
            line = clean(raw)
            if not line or BYELAW_NOISE.match(line) or re.search(r"\.{6,}\s*\d*$", line):  # running headers, contents page
                continue
            a = ANNEX.match(line)
            if a:  # annexures come last; from here on numbered lines are form items, not clauses
                in_annex = True
                clauses.append([f"Anx {a.group(1)}", "", p["page"]])
                continue
            m = None if in_annex else CLAUSE.match(line)
            if m and 1 <= int(m.group(1).split(".")[0]) <= 16:
                clauses.append([m.group(1), m.group(2) or "", p["page"]])
            elif clauses:
                if in_annex and not clauses[-1][1] and clauses[-1][0] not in titles_annex:
                    titles_annex[clauses[-1][0]] = line  # first line after "Anx X" is the form title
                clauses[-1][1] += " " + line
    # Clause titles (short text ending a heading) give context to their children.
    titles = {num: txt.strip() for num, txt, _ in clauses if txt and words(txt) <= 12}

    groups = []
    for num, txt, page in clauses:
        if num.startswith("Anx"):
            if "[Name 1]" in txt:  # a leftover template page, not a DHA form
                continue
            groups.append({"parent": num, "first": num, "last": num, "page": page, "text": txt.strip()})
            continue
        parent = ".".join(num.split(".")[:2])  # group within a section, e.g. all of 8.56.x
        if groups and groups[-1]["parent"] == parent and words(groups[-1]["text"]) + words(txt) <= TARGET_WORDS:
            groups[-1]["text"] += f"\n{num} {txt}"
            groups[-1]["last"] = num
        else:
            groups.append({"parent": parent, "first": num, "last": num, "page": page, "text": f"{num} {txt}"})

    out = []
    for g in groups:
        if g["first"].startswith("Anx"):
            title = titles_annex.get(g["first"], "")[:80]
            header = f"{BYELAWS_TITLE} › Chapter XVI {CHAPTERS[16]} › {g['first']} {title}".rstrip()
            for piece in split_long(g["text"]):
                out.append({"header": header, "text": piece, "page": g["page"], "clause": g["first"]})
            continue
        ch = int(g["first"].split(".")[0])
        trail = [f"Chapter {ROMAN[ch]} {CHAPTERS[ch]}"]
        parts = g["first"].split(".")
        for i in range(2, len(parts)):
            key = ".".join(parts[:i])
            if key in titles:
                trail.append(f"{key} {titles[key][:70]}")
        clause = g["first"] if g["first"] == g["last"] else f"{g['first']}–{g['last']}"
        header = f"{BYELAWS_TITLE} › " + " › ".join(trail) + f" › clause {clause}"
        for piece in split_long(g["text"]):
            out.append({"header": header, "text": piece, "page": g["page"], "clause": clause})
    return out


# ---------- Other documents: paragraph packing ----------

def paragraphs(text):
    paras, cur = [], []
    for raw in text.split("\n"):
        line = clean(raw)
        if not line:
            if cur:
                paras.append(" ".join(cur))
                cur = []
            continue
        starts_item = re.match(r"^(\d{1,2}[.)]|[a-z][.)]|[-*]|\(\w{1,3}\))\s", line)
        if cur and (starts_item or (cur[-1].endswith((".", ":")) and line[:1].isupper() and words(" ".join(cur)) > 25)):
            paras.append(" ".join(cur))
            cur = []
        cur.append(line)
    if cur:
        paras.append(" ".join(cur))
    return [p for p in paras if re.search(r"[A-Za-z]{3}", p) and not re.fullmatch(r"[_.\s:|-]*", p)]


def doc_chunks(doc):
    out = []
    for p in doc["pages"]:
        buf = []
        for para in paragraphs(p["text"] or ""):
            if buf and words(" ".join(buf)) + words(para) > TARGET_WORDS:
                out.append((p["page"], "\n".join(buf)))
                buf = []
            buf.append(para)
        if buf:
            out.append((p["page"], "\n".join(buf)))
    pages = len(doc["pages"])
    title = doc["title"] + (f" ({doc['year']})" if doc["year"] else "")
    res = []
    for page, text in out:
        if words(text) < 6:
            continue
        for piece in split_long(text):
            res.append({"header": title + (f" › page {page}" if pages > 1 else ""), "text": piece, "page": page, "clause": None})
    return res


# ---------- CSV-derived chunks (FAQs, fines, regularization, standards, notices) ----------

def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def csv_chunks(tables):
    out = []
    for r in tables["faq_approved_answers"]:
        out.append({"source_type": "faq", "title": "DHA FAQ", "header": f"DHA FAQ › {r['question']}",
                    "text": f"Q: {r['question']}\nAlso asked as: {r['alternative_phrasings']}\nA: {r['draft_answer']}",
                    "status": r["status"], "service_ids": r["related_service_id"], "ref": r["faq_id"]})
    for r in tables["fines_penalties"]:
        amounts = "; ".join(x for x in [f"first time Rs {r['amount_first']}" if r["amount_first"] else "",
                                         f"second time {r['amount_second']}" if r["amount_second"] else "",
                                         f"third time {r['amount_third']}" if r["amount_third"] else ""] if x)
        out.append({"source_type": "fine", "title": BYELAWS_TITLE, "header": f"{BYELAWS_TITLE} › Chapter XV Fines › clause {r['bylaw_clause']}",
                    "text": f"Fine ({r['directorate']}): {r['violation']}. {amounts}. {r['additional']}".strip(),
                    "status": r["status"], "clause": r["bylaw_clause"], "ref": r["fine_id"], "url": BYELAWS_URL})
    for r in tables["regularization_charges"]:
        out.append({"source_type": "regularization", "title": BYELAWS_TITLE,
                    "header": f"{BYELAWS_TITLE} › Chapter XIV Regularization Charges › clause {r['bylaw_clause']}",
                    "text": f"Regularization: {r['item']} ({r['property_type']}). Allowed deviation: {r['max_allowed_deviation']}. "
                            f"Charge: Rs {r['amount']} {r['rate_basis'].replace('_', ' ')}. Beyond the limit: {r['beyond_limit']}",
                    "status": r["status"], "clause": r["bylaw_clause"], "ref": r["reg_id"], "url": BYELAWS_URL})
    for r in tables["building_standards"]:
        size = f"plots {r['plot_size_from_sqyd']}–{r['plot_size_to_sqyd']} sq yd" if r["plot_size_to_sqyd"] else f"plots from {r['plot_size_from_sqyd']} sq yd"
        out.append({"source_type": "building_standard", "title": BYELAWS_TITLE,
                    "header": f"{BYELAWS_TITLE} › Building standards › clause {r['bylaw_clause']}",
                    "text": f"{r['category']}, {size}: {r['parameter']} = {r['value']} {r['unit']}. {r['notes']}".strip(),
                    "status": r["status"], "clause": r["bylaw_clause"], "ref": r["std_id"], "url": BYELAWS_URL})
    for r in tables["notices"]:
        if r["status"] in ("active", "needs_confirmation", "expired"):
            out.append({"source_type": "notice", "title": "DHA notice", "header": f"DHA notice › {r['title']} ({r['issue_date'] or r['effective_from']})",
                        "text": r["summary"], "status": r["status"], "ref": r["notice_id"], "url": r["link"], "year": int((r["issue_date"] or r["effective_from"] or "0")[:4] or 0) or None})
    return out


# ---------- Build ----------

def main():
    embed = "--no-embed" not in sys.argv
    docs = [json.loads(l) for l in open(HERE / "out" / "docs.jsonl", encoding="utf-8")]
    manual = json.loads((HERE / "manual_text.json").read_text("utf-8"))
    for d in docs:
        if d["file"] in manual:
            d["pages"] = [{"page": 1, "text": manual[d["file"]], "ocr": False, "manual": True}]

    tables = {}
    for f in sorted(DATA.glob("*.csv")):
        tables[re.sub(r"^\d+_", "", f.stem)] = (f, read_csv(f))
    rows = {k: v[1] for k, v in tables.items()}

    url_by_file = {}
    for r in rows["forms_catalogue"]:
        if r["download_url"]:
            url_by_file.setdefault(r["file_name"].split(" (")[0], r["download_url"])
    url_by_file["DHAbyelaws.pdf"] = BYELAWS_URL
    # Which services each document supports (from the service catalogue sources and form links).
    svc_by_file = {}
    proc_to_svc = {}
    for s in rows["service_catalogue"]:
        proc_to_svc.setdefault(s["procedure_id"], []).append(s["service_id"])
        for src in s["source"].split(";"):
            svc_by_file.setdefault(src.strip(), set()).add(s["service_id"])
    for r in rows["forms_catalogue"]:
        for proc in r["used_in_procedure"].split(";"):
            for sid in proc_to_svc.get(proc.strip(), []):
                svc_by_file.setdefault(r["file_name"].split(" (")[0], set()).add(sid)

    chunks = []
    for d in docs:
        names = [d["file"], *d["duplicates"]]
        services = sorted(set().union(*(svc_by_file.get(n, set()) for n in names)))
        url = next((url_by_file[n] for n in names if n in url_by_file), None)
        old = d["year"] and d["year"] < 2022 and d["kind"] in ("procedure", "form", "fees_notice")
        pieces = byelaw_chunks(d) if d["kind"] == "byelaws" else doc_chunks(d)
        for c in pieces:
            caution = "Fees in this older document may be out of date; quote fees from the current Schedule of Charges." if old and re.search(r"\bRs\.?\s?\d", c["text"]) else None
            if d["pages"] and d["pages"][0].get("manual"):
                caution = "Summary written by hand from an Urdu form."
            chunks.append({**c, "source_type": "byelaw" if d["kind"] == "byelaws" else "document", "doc_id": d["doc_id"],
                           "title": BYELAWS_TITLE if d["kind"] == "byelaws" else d["title"], "year": d["year"],
                           "status": "current", "caution": caution, "service_ids": ";".join(services), "url": url})
    chunks += csv_chunks(rows)

    # Drop exact duplicates (the 2018 copies repeat the numbered procedure documents).
    seen, unique = set(), []
    for c in chunks:
        key = hashlib.md5(re.sub(r"[^a-z0-9]", "", c["text"].lower()).encode()).hexdigest()
        if key in seen:
            continue
        seen.add(key)
        c["hash"] = key
        unique.append(c)
    chunks = unique
    for i, c in enumerate(chunks, start=1):
        c["chunk_id"] = i

    tmp = DB_PATH.with_suffix(".sqlite.tmp")
    if tmp.exists():
        tmp.unlink()
    db = sqlite3.connect(tmp)
    db.execute("PRAGMA journal_mode=OFF")

    for name, (path, data) in tables.items():
        with open(path, encoding="utf-8-sig", newline="") as f:
            cols = next(csv.reader(f))
        db.execute(f'CREATE TABLE "{name}" ({", ".join(f"[{c}] TEXT" for c in cols)})')
        db.executemany(f'INSERT INTO "{name}" VALUES ({",".join("?" * len(cols))})', [[r.get(c, "") for c in cols] for r in data])
        db.execute(f'CREATE INDEX "ix_{name}" ON "{name}" ([{cols[0]}])')

    db.execute("""CREATE TABLE documents (doc_id TEXT PRIMARY KEY, file TEXT, duplicates TEXT, title TEXT, kind TEXT,
                  year INTEGER, url TEXT, pages INTEGER, ocr_pages INTEGER, chars INTEGER)""")
    for d in docs:
        db.execute("INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?)", (
            d["doc_id"], d["file"], ";".join(d["duplicates"]), d["title"], d["kind"], d["year"],
            next((url_by_file[n] for n in [d["file"], *d["duplicates"]] if n in url_by_file), None),
            len(d["pages"]), sum(1 for p in d["pages"] if p.get("ocr")), sum(len(p["text"] or "") for p in d["pages"])))

    db.execute("""CREATE TABLE chunks (chunk_id INTEGER PRIMARY KEY, source_type TEXT, doc_id TEXT, ref TEXT, title TEXT,
                  header TEXT, text TEXT, page INTEGER, clause TEXT, year INTEGER, status TEXT, caution TEXT,
                  service_ids TEXT, url TEXT, hash TEXT)""")
    db.executemany("INSERT INTO chunks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [(
        c["chunk_id"], c["source_type"], c.get("doc_id"), c.get("ref"), c["title"], c["header"], c["text"], c.get("page"),
        c.get("clause"), c.get("year"), c.get("status", "current"), c.get("caution"), c.get("service_ids", ""), c.get("url"), c["hash"],
    ) for c in chunks])
    db.execute("CREATE VIRTUAL TABLE chunks_fts USING fts5(header, text, content='chunks', content_rowid='chunk_id', tokenize='porter unicode61')")
    db.execute("INSERT INTO chunks_fts(rowid, header, text) SELECT chunk_id, header, text FROM chunks")

    db.execute("CREATE TABLE chunk_vectors (chunk_id INTEGER PRIMARY KEY, vec BLOB)")
    db.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)")
    meta = {"built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "chunks": len(chunks),
            "documents": len(docs), "embed_model": "", "embed_dim": ""}

    if embed:
        sys.path.insert(0, str(HERE))
        from models import Embedder
        cache = dict(np.load(CACHE)) if CACHE.exists() else {}
        todo = [c for c in chunks if c["hash"] not in cache]
        if todo:
            print(f"Embedding {len(todo)} chunks with BGE-M3 on CPU (cached: {len(chunks) - len(todo)})…", flush=True)
            emb = Embedder()
            t0 = time.time()
            for s in range(0, len(todo), 64):
                part = todo[s:s + 64]
                vecs = emb.embed([f"{c['header']}\n{c['text']}" for c in part])
                for c, v in zip(part, vecs):
                    cache[c["hash"]] = v
                np.savez(CACHE, **cache)
                print(f"  {min(s + 64, len(todo))}/{len(todo)}  {time.time() - t0:.0f}s", flush=True)
        db.executemany("INSERT INTO chunk_vectors VALUES (?, ?)", [(c["chunk_id"], cache[c["hash"]].astype(np.float32).tobytes()) for c in chunks])
        meta.update(embed_model="bge-m3", embed_dim="1024")

    db.executemany("INSERT INTO meta VALUES (?, ?)", [(k, str(v)) for k, v in meta.items()])
    db.commit()
    db.execute("VACUUM")
    db.close()
    tmp.replace(DB_PATH)  # swap in atomically; the app opens the file per query

    by_type = {}
    for c in chunks:
        by_type[c["source_type"]] = by_type.get(c["source_type"], 0) + 1
    sizes = sorted(words(c["text"]) for c in chunks)
    print(f"Wrote {DB_PATH} — {len(chunks)} chunks {by_type}; words per chunk median {sizes[len(sizes) // 2]}, max {sizes[-1]}")


if __name__ == "__main__":
    main()
