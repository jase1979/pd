#!/usr/bin/env python3
"""
Extract question-answer pairs from WJEC GCSE Product Design Unit 1 past papers.

Usage:
    python3 extract_past_papers.py
    python3 extract_past_papers.py --paper 2024
"""

import subprocess, re, json, sys
from pathlib import Path

PAPERS_DIR  = Path(__file__).parent.parent / "assets" / "past-papers"
SCRIPTS_DIR = Path(__file__).parent
OUTPUT_DIR  = SCRIPTS_DIR / "extracted"
IMG_SRC_DIR = Path("/tmp/pd-imgs")
IMG_DEST    = Path(__file__).parent.parent / "assets" / "img" / "papers"

# ── paper metadata ──────────────────────────────────────────────────────────
PAPER_META = {
    "2024": {
        "year": 2024, "session": "Summer",
        "code": "S24-3603U10-1",
        "qp":   "2024-product-design-unit1.pdf",
        "ms":   "2024-product-design-unit1-ms.pdf",
        # image_index → (question_number, description)
        "images": {
            0:  ("1",    "Greener take-away food containers and compostable cutlery"),
            1:  ("1bi",  "Cardboard food container showing packaging feature A (locking tab)"),
            3:  ("1c",   "Extendable stainless steel drinking straw in carry case"),
            5:  ("2",    "Chair A — made from used bicycle wheels and tyres (retail £189)"),
            6:  ("2",    "Chair B — made from worn car tyres and seat belts (retail £229)"),
            7:  ("3",    "Space-saving wall-mounted clothes dryer (closed position)"),
            8:  ("3",    "Space-saving wall-mounted clothes dryer (open position)"),
            9:  ("3",    "Steel wings with U-shaped feature holding aluminium bar"),
            10: ("3",    "Clothes dryer U-shaped feature — enlarged view"),
            12: ("3e",   "Aluminium roof bar (extruded cross-section)"),
            15: ("4",    "Portable self-assembly hockey goals for primary school"),
            20: ("5",    "Bluetooth speaker product (top view)"),
            21: ("5",    "Bluetooth speaker (side view with USB port)"),
            25: ("6",    "Wooden lap tray with handle cut-out"),
            29: ("6c",   "Lap tray in use on sofa — showing ergonomic placement"),
        },
    },
    "2023": {
        "year": 2023, "session": "Summer",
        "code": "S23-3603U10-1",
        "qp":   "2023-product-design-unit1.pdf",
        "ms":   "2023-product-design-unit1-ms.pdf",
        "images": {
            0:  ("1",    "Auxiliary handle designed to fit onto existing garden tools"),
            1:  ("1",    "Auxiliary handle fitted onto garden tool in use"),
            2:  ("2",    "Bicycle carrier mounted to roof of vehicle"),
            3:  ("2",    "ABS clamp component of bicycle carrier"),
            6:  ("3",    "'Power & Play' product — power bank with 3-in-1 cable and earphones"),
            7:  ("3",    "Bicycle carrier lock mechanism (Lock 1 and Lock 2)"),
            8:  ("3",    "Roof bar fitted to vehicle"),
            10: ("4ai",  "White opaque insert for 'power & play' casing"),
            11: ("4b",   "Two-part transparent polycarbonate outer shell"),
            12: ("4b",   "Power bank with LED charge indicator and RoHS symbol"),
            15: ("5",    "Portable self-assembly hockey goals"),
            16: ("5",    "Hockey goal assembly detail"),
            17: ("6",    "Flat-pack furniture or designer product for analysis"),
            25: ("6a",   "Product range for analysis question"),
        },
    },
    "2022": {
        "year": 2022, "session": "Summer",
        "code": "Z22-3603U10-1",
        "qp":   "2022-product-design-unit1.pdf",
        "ms":   "2022-product-design-unit1-ms.pdf",
        "images": {
            0:  ("1",    "Game controller — CAD model"),
            1:  ("1",    "Game controller — foam model"),
            2:  ("1",    "Game controller — final prototype"),
            3:  ("2",    "New solar bicycle light"),
            5:  ("2",    "Solar bicycle light mounting detail"),
            6:  ("3",    "Range of pewter jewellery items"),
            7:  ("3",    "Pewter jewellery stand (transparent thermoplastic)"),
            9:  ("4",    "New kitchen products designed for young children"),
            10: ("4",    "Kitchen products — injection moulded HDPE with rubberised handle"),
            11: ("4c",   "Concept model of handheld torch in blue modelling foam"),
            14: ("5",    "Flat-packed stools and chairs made from corrugated cardboard"),
            15: ("5",    "Corrugated cardboard lighting product — innovative use"),
            17: ("5b",   "Range of concept bicycle racks in mild steel"),
            18: ("6",    "Portable tennis game for 3–5 year olds"),
            19: ("6",    "Tennis game components — spinner, base, clips"),
        },
    },
    "2019": {
        "year": 2019, "session": "Summer",
        "code": "S19-3603U10-1",
        "qp":   "2019-product-design-unit1.pdf",
        "ms":   "2019-product-design-unit1-ms.pdf",
        "images": {
            0:  ("1",    "New smart watch with activity tracker"),
            1:  ("1",    "Traditional watch for comparison"),
            2:  ("3a",   "Renewable Energy Source A (wind farm / turbines)"),
            3:  ("3a",   "Renewable Energy Source B (geothermal / hot spring system diagram)"),
            4:  ("3b",   "Refrigerator with energy label (280 kWh/annum)"),
            5:  ("4c",   "Concept model of handheld torch in blue modelling foam — annotated"),
            8:  ("4",    "New range of kitchen products for young children"),
            9:  ("2",    "New coffee mug displaying two different faces"),
            10: ("2c",   "Set of new mugs with glass container in coloured holder (3D printed models)"),
            11: ("5",    "Flat-packed eco-furniture stools and chairs from corrugated cardboard"),
            14: ("5",    "Corrugated cardboard lighting product"),
            16: ("6",    "Portable tennis game for 3–5 year olds"),
            17: ("6",    "Tennis game base used as carry case"),
        },
    },
}

# ── topic keywords ────────────────────────────────────────────────────────────
TOPIC_KEYWORDS = {
    "sustainability": [
        "sustainability", "sustainable", "ecological", "ecological footprint",
        "life cycle", "lca", "cradle", "six rs", "reduce", "reuse", "recycle",
        "repair", "rethink", "refuse", "carbon footprint", "compostable",
        "biodegradable", "greener", "eco", "environmental", "waste",
        "renewable material", "recycled material", "landfill",
    ],
    "materials": [
        "aluminium", "steel", "mild steel", "carbon steel", "stainless steel",
        "copper", "brass", "bronze", "metal", "ferrous", "alloy",
        "acrylic", "abs", "hdpe", "polypropylene", "polystyrene", "pvc",
        "nylon", "polycarbonate", "polymorph", "thermoplastic", "thermosetting",
        "polymer", "plastic",
        "oak", "pine", "mdf", "plywood", "chipboard", "hardboard", "timber",
        "hardwood", "softwood", "manufactured board",
        "cardboard", "corrugated", "paper", "board", "gsm",
        "pewter", "cast iron", "titanium",
        "properties", "hardness", "toughness", "tensile", "compressive",
        "ductile", "malleable", "elastic", "density", "conductivity",
        "corrosion", "rust", "wax", "coating", "finish",
    ],
    "manufacturing": [
        "injection moulding", "vacuum forming", "blow moulding",
        "extrusion", "die cutting", "die-cutting", "casting", "moulding",
        "laser cutting", "cnc", "3d print", "rapid prototyping",
        "mass production", "batch production", "one-off", "continuous flow",
        "jig", "template", "press", "drilling", "turning", "milling",
        "welding", "soldering", "brazing", "adhesive",
        "assembly", "flat-pack", "disassemble",
        "sand casting", "pewter casting",
        "scale of production",
    ],
    "new-technologies": [
        "cad", "computer aided design", "cam", "computer aided manufacture",
        "3d printing", "virtual reality", "simulation", "iteration",
        "market pull", "technology push", "smart watch", "wearable",
        "internet", "digital", "electronic", "sensor", "led",
        "product life cycle", "obsolescence", "planned obsolescence",
        "consumer rights", "trade descriptions",
        "globalisation", "global production",
    ],
    "smart-materials": [
        "smart material", "shape memory", "nitinol", "sma",
        "thermochromic", "photochromic", "polymorph",
        "qtc", "quantum tunnelling", "micro-encapsulation",
        "self-healing", "reactive",
    ],
    "energy": [
        "renewable energy", "non-renewable", "solar", "wind", "tidal",
        "geothermal", "hydroelectric", "biomass", "fossil fuel",
        "energy label", "kwh", "carbon emission", "net zero",
        "electric vehicle", "hybrid", "battery",
        "photovoltaic", "wind turbine", "wind farm",
    ],
    "product-analysis": [
        "ergonomic", "ergonomics", "anthropometric", "anthropometrics",
        "aesthetic", "aesthetics", "target market", "user needs",
        "specification", "design brief", "prototype", "model",
        "foam model", "concept model", "testing",
        "marketable", "consumer", "appeal", "function",
        "market research", "primary research", "secondary research",
        "design strategy", "iterative", "iteration",
        "designer", "dyson", "apple", "stella", "laura ashley",
        "bethan gray", "orla kiely", "shigeru", "airbus",
        "biomimicry", "inspiration",
    ],
    "finishes": [
        "powder coat", "galvanise", "electroplat", "paint finish",
        "varnish", "lacquer", "anodise", "teflon", "surface treatment",
        "surface finish", "primer", "gloss", "matt",
    ],
}


def run(cmd: list) -> str:
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.stdout


def clean(text: str) -> str:
    text = re.sub(r'©\s*WJEC\s+CBAC\s+Ltd\..*', '', text)
    text = re.sub(r'\(3603U10-1[^)]*\)', '', text)
    text = re.sub(r'JUN\d+\w*', '', text)
    text = re.sub(r'Turn\s+over\.?', '', text)
    text = re.sub(r'BLANK PAGE.*?PLEASE DO NOT WRITE\s*ON THIS PAGE', '', text, flags=re.DOTALL)
    text = re.sub(r'BLANK PAGE', '', text)
    text = re.sub(r'PLEASE DO NOT WRITE\s*ON THIS PAGE', '', text)
    text = re.sub(r'Examiner\s*\n?\s*only', '', text)
    text = re.sub(r'^\s*\d{1,2}\s*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'3\s*6\s*0\s*3\s*U\s*1\s*0\s*1', '', text)
    text = re.sub(r'\.{8,}', '', text)
    # Remove answer-box lines like " 1. . . . . . ." (numbered answer lines in QP)
    text = re.sub(r'^\s*\d{1,2}\.\s+[.\s]{10,}$', '', text, flags=re.MULTILINE)
    text = re.sub(r'\n{4,}', '\n\n\n', text)
    return text.strip()


def extract_marks(text: str) -> int:
    marks = [int(m) for m in re.findall(r'\[(\d+)\]', text)]
    # Handle "2 × [2]" style
    mults = re.findall(r'(\d+)\s*[×x]\s*\[(\d+)\]', text)
    for n, m in mults:
        marks.append(int(n) * int(m))
        # Remove double-counted individual [m]
        for _ in range(int(n)):
            if int(m) in marks:
                marks.remove(int(m))
    return sum(marks) if marks else 0


def guess_topic(q: str, a: str = "") -> str:
    combined = (q + " " + a).lower()
    scores = {}
    for topic, kws in TOPIC_KEYWORDS.items():
        scores[topic] = sum(1 for kw in kws if kw in combined)
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "product-analysis"


def guess_type(q: str, marks: int) -> str:
    ql = q.lower()
    if marks >= 8:
        return "written"
    if "true or false" in ql or "tick" in ql:
        return "true-false"
    if "match" in ql or "draw a line" in ql:
        return "matching"
    if "complete the table" in ql or "fill in" in ql:
        return "fill-blank"
    if "state" in ql and marks <= 2:
        return "short-answer"
    return "short-answer"


def parse_qp(text: str) -> list[dict]:
    """Parse question paper into list of question dicts."""
    # Trim to questions section
    m = re.search(r'Answer all questions\.', text)
    if m:
        text = text[m.end():]
    m = re.search(r'END OF PAPER', text)
    if m:
        text = text[:m.start()]

    # Find first question
    m = re.search(r'^\s{0,5}1\.\s+', text, flags=re.MULTILINE)
    if m:
        text = text[m.start():]

    # Split on top-level questions (number + period at left margin)
    chunks = re.split(r'\n(?=\s{0,5}\d{1,2}\.\s+)', text)

    questions = []
    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        m = re.match(r'(\d{1,2})\.\s+', chunk)
        if not m or len(chunk) < 20:
            continue
        qnum = m.group(1)
        body = chunk[m.end():]
        questions.extend(_parse_sub(qnum, body, chunk))

    return questions


def _clean_qtext(t: str) -> str:
    t = re.sub(r'^\d{1,2}\.\s*', '', t.strip())
    lines = []
    for ln in t.split('\n'):
        s = ln.strip()
        # Skip answer lines (dotted lines)
        if re.match(r'^\.{5,}', s):
            continue
        if s:
            lines.append(s)
        elif lines and lines[-1] != '':
            lines.append('')
    return '\n'.join(lines).strip()


def _parse_sub(qnum: str, body: str, full: str) -> list[dict]:
    results = []
    body_nl = "\n" + body

    # Try to split on (a), (b), (c)... first
    sub_pat = r'\n\s{0,30}\(([a-hj-uw-z])\)\s+'
    parts = re.split(sub_pat, body_nl)

    if len(parts) <= 1:
        # No (a),(b) parts — check for direct roman numeral sub-questions
        roman_pat = r'\n\s{0,30}\((i{1,3}v?|vi{0,3}|iv|ix)\)\s+'
        rparts = re.split(roman_pat, body_nl)

        if len(rparts) > 1:
            # Direct (i),(ii),(iii) without letter prefix (2022-style)
            preamble = rparts[0].strip()
            j = 1
            while j < len(rparts):
                rnum  = rparts[j]
                rbody = rparts[j+1] if j+1 < len(rparts) else ""
                j += 2
                marks = extract_marks(rbody)
                qt = f"{preamble}\n\n({rnum}) {rbody}" if preamble else f"({rnum}) {rbody}"
                results.append({
                    "question_number": f"{qnum}_{rnum}",
                    "question_text": _clean_qtext(qt),
                    "marks": marks,
                })
        else:
            marks = extract_marks(body)
            results.append({
                "question_number": qnum,
                "question_text": _clean_qtext(full),
                "marks": marks,
            })
        return results

    preamble = parts[0].strip()

    i = 1
    while i < len(parts):
        letter = parts[i]
        sbody  = parts[i + 1] if i + 1 < len(parts) else ""
        i += 2

        roman_pat = r'\n\s{0,30}\((i{1,3}v?|vi{0,3}|iv|ix)\)\s+'
        rparts = re.split(roman_pat, "\n" + sbody)

        if len(rparts) <= 1:
            marks = extract_marks(sbody)
            qt = f"{preamble}\n\n({letter}) {sbody}" if preamble else f"({letter}) {sbody}"
            results.append({
                "question_number": f"{qnum}{letter}",
                "question_text": _clean_qtext(qt),
                "marks": marks,
            })
        else:
            sub_pre   = rparts[0].strip()
            has_marks = any(re.search(r'\[\d+\]', rparts[j+1] if j+1 < len(rparts) else "")
                            for j in range(1, len(rparts)-1, 2))

            if not has_marks:
                marks = extract_marks(sbody)
                qt = f"{preamble}\n\n({letter}) {sbody}" if preamble else f"({letter}) {sbody}"
                results.append({
                    "question_number": f"{qnum}{letter}",
                    "question_text": _clean_qtext(qt),
                    "marks": marks,
                })
            else:
                j = 1
                while j < len(rparts):
                    rnum  = rparts[j]
                    rbody = rparts[j+1] if j+1 < len(rparts) else ""
                    j += 2
                    marks = extract_marks(rbody)
                    qt = f"{preamble}\n\n({letter}) {sub_pre}\n\n({rnum}) {rbody}"
                    results.append({
                        "question_number": f"{qnum}{letter}_{rnum}",
                        "question_text": _clean_qtext(qt),
                        "marks": marks,
                    })

    return results


def _clean_ms_answer(text: str) -> str:
    # Remove AO columns and mark numbers at line ends
    text = re.sub(r'\s+AO\d\s+AO\d\s+Mark\s*', '\n', text)
    text = re.sub(r'\s+✓\s+\d+\s*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'\s+✓\s*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*\d+\s*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'©\s*WJEC\s+CBAC\s+Ltd\..*', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def parse_ms(text: str) -> dict[str, str]:
    """Parse mark scheme into {question_key: answer_text} dict.

    Handles formats:
    - "Question N" header, then "(a) (i)  text" entries (2024, 2023)
    - "Question N" header, then "(i)  text" entries directly (2022)
    - "Question N" header, then "(a)  text" entries (2019)
    """
    answers = {}

    m = re.search(r'Question\s+1\b', text)
    if m:
        text = text[m.start():]

    # Remove banded sections
    text = re.sub(r'Band\s+\d+.*?(?=\n\s*(?:Question|\Z))', '', text, flags=re.DOTALL)

    current_q      = ""
    current_letter = ""   # tracks last seen letter e.g. "a"
    current_key    = None
    body_lines: list[str] = []

    # Pattern: "Question 3" line
    q_header = re.compile(r'^\s*Question\s+(\d{1,2})\s*$')
    # "(a) (i)  text" — letter + roman on same line
    letter_roman = re.compile(r'^\s{0,6}\(([a-hj-uw-z])\)\s+\(([ivx]+)\)\s{2,}(.+)')
    # "(a)  text" — letter only (exclude i, v, x which are roman numeral chars)
    letter_only  = re.compile(r'^\s{0,6}\(([a-hj-uw-z])\)\s{2,}(.+)')
    # "(ii)  text" — roman only (continuation of current letter, or top-level)
    roman_only   = re.compile(r'^\s{0,6}\(([ivx]+)\)\s{2,}(.+)')

    def flush():
        nonlocal current_key, body_lines
        if current_key and body_lines:
            ans = _clean_ms_answer('\n'.join(body_lines))
            if ans:
                answers[current_key] = ans
        body_lines = []

    for line in text.split('\n'):
        # Question header: "Question 3"
        hm = q_header.match(line)
        if hm:
            flush()
            current_q      = hm.group(1)
            current_letter = ""
            current_key    = None
            continue

        # "(a) (i)  text"
        mm = letter_roman.match(line)
        if mm:
            flush()
            current_letter = mm.group(1)
            current_key    = f"{current_q}{current_letter}_{mm.group(2)}"
            body_lines     = [mm.group(3)]
            continue

        # "(a)  text"
        mm = letter_only.match(line)
        if mm:
            flush()
            current_letter = mm.group(1)
            current_key    = f"{current_q}{current_letter}"
            body_lines     = [mm.group(2)]
            continue

        # "(ii)  text" — roman only
        mm = roman_only.match(line)
        if mm:
            flush()
            roman = mm.group(1)
            if current_letter:
                current_key = f"{current_q}{current_letter}_{roman}"
            else:
                current_key = f"{current_q}_{roman}"
            body_lines = [mm.group(2)]
            continue

        if current_key is not None:
            body_lines.append(line)

    flush()
    return answers


def copy_images(year_str: str, meta: dict):
    """Copy relevant images to assets/img/papers/ with descriptive names."""
    IMG_DEST.mkdir(parents=True, exist_ok=True)
    code_lower = meta["code"].lower().replace("-", "")[:3] + meta["code"][-8:-5].lower()
    # e.g. "s243603" — use shorter prefix like "s24pd"
    prefix = f"{meta['session'].lower()[:1]}{str(meta['year'])[2:]}pd"

    copied = []
    for idx, (qnum, desc) in sorted(meta["images"].items()):
        # Find source file
        src = IMG_SRC_DIR / f"{year_str}-{idx:03d}.jpg"
        if not src.exists():
            src = IMG_SRC_DIR / f"{year_str}-{idx:03d}.ppm"
        if not src.exists():
            print(f"    Warning: image {idx} not found for {year_str}")
            continue

        safe_q = qnum.replace('_', '').replace(' ', '')
        dest_name = f"{prefix}-q{safe_q}-{idx:03d}.jpg"
        dest = IMG_DEST / dest_name

        if src.suffix == '.ppm':
            from PIL import Image
            Image.open(src).convert('RGB').save(dest, 'JPEG', quality=85)
        else:
            import shutil
            shutil.copy2(src, dest)
        copied.append((idx, f"/assets/img/papers/{dest_name}", qnum, desc))
        print(f"    Copied img {idx:03d} → {dest_name}")

    return {idx: path for idx, path, _, _ in copied}


def process_paper(year_str: str, meta: dict) -> list[dict]:
    qp_path = PAPERS_DIR / meta["qp"]
    ms_path = PAPERS_DIR / meta["ms"]

    print(f"\n── {year_str} ({meta['code']}) ──")

    if not qp_path.exists():
        print(f"  ERROR: QP not found: {qp_path}")
        return []
    if not ms_path.exists():
        print(f"  ERROR: MS not found: {ms_path}")
        return []

    print("  Extracting text…")
    qp_text = clean(run(["pdftotext", "-layout", str(qp_path), "-"]))
    ms_text = clean(run(["pdftotext", "-layout", str(ms_path), "-"]))

    print("  Parsing questions…")
    questions = parse_qp(qp_text)
    print(f"  Found {len(questions)} question parts")

    print("  Parsing mark scheme…")
    answers = parse_ms(ms_text)
    print(f"  Found {len(answers)} MS entries — keys: {sorted(answers.keys())}")

    print("  Copying images…")
    img_map = copy_images(year_str, meta)
    # Build question→image lookup: first image whose question number prefix matches
    qnum_to_img = {}
    for idx, path in img_map.items():
        q = meta["images"][idx][0]
        if q not in qnum_to_img:
            qnum_to_img[q] = path

    results = []
    prefix = f"{meta['session'].lower()[:1]}{str(meta['year'])[2:]}"

    for q in questions:
        qkey = q["question_number"]

        # Try to find answer with various key fallbacks
        ans = answers.get(qkey)
        if not ans and "_" in qkey:
            # e.g. "6_i" → "6" (parent key)
            ans = answers.get(qkey.split("_")[0])
        if not ans and "_" in qkey:
            # e.g. "6_i" → "6a_i" (MS has spurious letter from split (a)/(i) lines)
            num_m = re.match(r'(\d+)_(.+)', qkey)
            if num_m:
                ans = answers.get(f"{num_m.group(1)}a_{num_m.group(2)}")
        if not ans and len(qkey) > 1:
            num_only = re.match(r'(\d+)', qkey)
            if num_only:
                ans = answers.get(num_only.group(1))
        if not ans and "_" not in qkey:
            for roman in ["i", "ii", "iii"]:
                k = f"{qkey}_{roman}"
                if k in answers:
                    parts = [answers[f"{qkey}_{r}"] for r in ["i","ii","iii","iv"] if f"{qkey}_{r}" in answers]
                    ans = "\n\n".join(parts)
                    break

        answer_text = ans or "ANSWER NOT FOUND — needs manual entry"

        # Find image: exact match or prefix match
        img_path = qnum_to_img.get(qkey)
        if not img_path:
            # Try matching by question number prefix (e.g. "3a" matches Q3 image)
            num_prefix = re.match(r'(\d+)', qkey)
            if num_prefix:
                img_path = qnum_to_img.get(num_prefix.group(1))

        entry = {
            "id":              f"{prefix}-q{qkey.replace('_', '')}",
            "paper":           meta["code"],
            "year":            meta["year"],
            "session":         meta["session"],
            "question_number": qkey,
            "marks":           q["marks"],
            "topic":           guess_topic(q["question_text"], answer_text),
            "type":            guess_type(q["question_text"], q["marks"]),
            "question":        q["question_text"],
            "answer":          answer_text,
            "needs_review":    ans is None or q["marks"] == 0,
        }
        if img_path:
            entry["image"] = img_path

        results.append(entry)
        matched = "✓" if ans else "✗"
        img_ind = "📷" if img_path else "  "
        print(f"    {matched}{img_ind} Q{qkey:6s} ({q['marks']}m) — {entry['topic']}")

    unmatched = set(answers.keys()) - {q["question_number"] for q in questions}
    if unmatched:
        print(f"  Unmatched MS keys: {sorted(unmatched)}")

    return results


def main():
    target = None
    if len(sys.argv) == 3 and sys.argv[1] == "--paper":
        target = sys.argv[2]

    OUTPUT_DIR.mkdir(exist_ok=True)
    all_qs = []

    for year_str, meta in PAPER_META.items():
        if target and year_str != target:
            continue
        qs = process_paper(year_str, meta)
        all_qs.extend(qs)

        out = OUTPUT_DIR / f"{year_str}.json"
        out.write_text(json.dumps(qs, indent=2, ensure_ascii=False))
        print(f"  Wrote {len(qs)} questions → {out.name}")

    if not target:
        combined = OUTPUT_DIR / "all_questions.json"
        combined.write_text(json.dumps(all_qs, indent=2, ensure_ascii=False))
        print(f"\nTotal: {len(all_qs)} questions across all papers")

    # Summary
    topics  = {}
    matched = 0
    imgs    = 0
    for q in all_qs:
        topics[q["topic"]] = topics.get(q["topic"], 0) + 1
        if "NOT FOUND" not in q["answer"]:
            matched += 1
        if "image" in q:
            imgs += 1

    print(f"\nAnswers matched: {matched}/{len(all_qs)}")
    print(f"Questions with images: {imgs}")
    print("\nTopic breakdown:")
    for t, c in sorted(topics.items(), key=lambda x: -x[1]):
        print(f"  {t}: {c}")


if __name__ == "__main__":
    main()
