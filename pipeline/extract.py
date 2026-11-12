"""Extract text from every downloaded DHA document.

Output: pipeline/out/docs.jsonl, one JSON object per unique document:
  {doc_id, file, duplicates, title, kind, year, pages: [{page, text, ocr}]}

PDF pages without a text layer are rendered to PNG and read with the Windows
built-in OCR engine (pipeline/ocr.ps1). .doc files use antiword, falling back
to Microsoft Word; .docx files use python-docx.
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

import docx
import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "out"
OCR_DIR = OUT / "ocr"
EXTS = {".pdf", ".doc", ".docx"}
MIN_PAGE_CHARS = 40  # below this a PDF page is treated as scanned


def md5(path):
    return hashlib.md5(path.read_bytes()).hexdigest()


def canonical(paths):
    """Prefer the plainest file name among byte-identical copies."""
    def badness(p):
        stem = p.stem
        return (bool(re.search(r"_[A-Za-z0-9]{7}$|_\d$|\(\d\)$", stem)), len(stem))
    return sorted(paths, key=badness)[0]


def title_of(path):
    stem = re.sub(r"^\d+\.-?", "", path.stem)
    stem = re.sub(r"_[A-Za-z0-9]{7}$", "", stem)
    stem = re.sub(r"-?jul20+1?8\d?$", "", stem, flags=re.I)
    stem = stem.replace("_", " ").replace("-", " ")
    return re.sub(r"\s+", " ", stem).strip()


def year_of(path):
    name = path.name
    if "byelaws" in name.lower() or "bylaws" in name.lower():
        return 2023
    m = re.search(r"(20\d\d)", name)
    if m:
        return int(m.group(1))
    if re.search(r"jul20+1?8", name, re.I):
        return 2018
    return None


def kind_of(path):
    n = path.name.lower()
    if "bylaw" in n or "byelaw" in n:
        return "byelaws"
    if "procedure" in n or "sop" in n:
        return "procedure"
    if "charges" in n or "out-sta" in n:
        return "fees_notice"
    if "criteria" in n or "crateria" in n:
        return "criteria"
    return "form"


def pdf_pages(path, doc_id):
    pages = []
    with fitz.open(path) as pdf:
        for i, page in enumerate(pdf, start=1):
            text = page.get_text("text").strip()
            if len(text) >= MIN_PAGE_CHARS:
                pages.append({"page": i, "text": text, "ocr": False})
                continue
            png = OCR_DIR / f"{doc_id}_p{i:03d}.png"
            if not png.exists():
                # ~220 dpi for A4, but never above the OCR engine's size limit.
                zoom = min(220 / 72, 3300 / max(page.rect.width, page.rect.height))
                page.get_pixmap(matrix=fitz.Matrix(zoom, zoom)).save(png)
            pages.append({"page": i, "text": None, "ocr": True, "png": png.name})
    return pages


def docx_pages(path):
    d = docx.Document(path)
    parts = [p.text for p in d.paragraphs]
    for table in d.tables:
        for row in table.rows:
            cells = []
            for c in row.cells:
                t = c.text.strip()
                if t and (not cells or cells[-1] != t):
                    cells.append(t)
            parts.append(" | ".join(cells))
    return [{"page": 1, "text": "\n".join(parts).strip(), "ocr": False}]


def doc_pages(path):
    try:
        out = subprocess.run(["antiword", "-w", "0", str(path)], capture_output=True, timeout=60)
        text = out.stdout.decode("utf-8", "replace").strip()
        if out.returncode == 0 and len(text) > 20:
            return [{"page": 1, "text": text, "ocr": False}]
    except (OSError, subprocess.TimeoutExpired):
        pass
    # Fallback: let Microsoft Word convert to plain text.
    txt = OUT / "word" / (path.stem + ".txt")
    txt.parent.mkdir(parents=True, exist_ok=True)
    script = (
        "$w = New-Object -ComObject Word.Application; $w.Visible = $false; "
        f"$d = $w.Documents.Open('{path}', $false, $true); "
        f"$d.SaveAs2('{txt}', 7); $d.Close($false); $w.Quit()"
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", script], capture_output=True, timeout=120)
    text = txt.read_text("utf-8", "replace").strip() if txt.exists() else ""
    return [{"page": 1, "text": text, "ocr": False}]


def main():
    OUT.mkdir(exist_ok=True)
    OCR_DIR.mkdir(exist_ok=True)
    files = sorted(p for p in ROOT.iterdir() if p.is_file() and p.suffix.lower() in EXTS)
    groups = {}
    for p in files:
        groups.setdefault(md5(p), []).append(p)

    docs = []
    for i, (digest, paths) in enumerate(sorted(groups.items(), key=lambda kv: canonical(kv[1]).name)):
        path = canonical(paths)
        doc_id = f"DOC-{i + 1:03d}"
        ext = path.suffix.lower()
        try:
            pages = pdf_pages(path, doc_id) if ext == ".pdf" else docx_pages(path) if ext == ".docx" else doc_pages(path)
        except Exception as e:  # keep going; report at the end
            print(f"FAILED {path.name}: {e}", file=sys.stderr)
            pages = []
        docs.append({
            "doc_id": doc_id, "file": path.name, "md5": digest,
            "duplicates": [p.name for p in paths if p != path],
            "title": title_of(path), "kind": kind_of(path), "year": year_of(path), "pages": pages,
        })

    pending = sum(1 for d in docs for p in d["pages"] if p["ocr"])
    if pending:
        print(f"OCR: {pending} scanned pages")
        subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                        str(Path(__file__).with_name("ocr.ps1")), "-Dir", str(OCR_DIR)], check=True)
        for d in docs:
            for p in d["pages"]:
                if p["ocr"]:
                    txt = OCR_DIR / p.pop("png").replace(".png", ".txt")
                    p["text"] = txt.read_text("utf-8-sig").strip() if txt.exists() else ""

    with open(OUT / "docs.jsonl", "w", encoding="utf-8") as f:
        for d in docs:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")

    chars = sum(len(p["text"] or "") for d in docs for p in d["pages"])
    empty = [d["file"] for d in docs if sum(len(p["text"] or "") for p in d["pages"]) < 100]
    print(f"{len(files)} files -> {len(docs)} unique documents, {chars:,} characters")
    print(f"OCR pages: {pending}; documents with almost no text: {empty}")


if __name__ == "__main__":
    main()
