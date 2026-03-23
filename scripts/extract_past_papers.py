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
            12: ("3",    "Aluminium roof bar (extruded cross-section)"),
            15: ("4",    "Portable self-assembly hockey goals for primary school"),
            20: ("5",    "Bluetooth speaker product (top view)"),
            21: ("5",    "Bluetooth speaker (side view with USB port)"),
            25: ("6",    "Wooden lap tray with handle cut-out"),
            29: ("6",    "Lap tray in use on sofa — showing ergonomic placement"),
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
            6:  ("2",    "Bicycle carrier lock mechanism detail"),
            7:  ("2",    "Bicycle carrier lock mechanism close-up"),
            8:  ("2",    "Roof bar fitted to vehicle"),
            10: ("3",    "'Power & Play' product — power bank with 3-in-1 cable and earphones"),
            11: ("3",    "Power bank components — earphones and 3-in-1 cable"),
            12: ("3",    "Power bank with 3-in-1 cable connector detail"),
            13: ("3",    "Power bank — front view"),
            14: ("3",    "Power & Play packaging with polycarbonate outer shell"),
            15: ("3",    "White opaque inner tray for Power & Play casing"),
            16: ("3",    "Power bank reverse — RoHS and CE symbols"),
            17: ("4",    "Portable self-assembly hockey goals"),
            18: ("5",    "Dyson fan heater"),
            19: ("5",    "Dyson bladeless tower fan"),
            20: ("5",    "Dyson cyclone vacuum cleaner"),
            25: ("6",    "Eco menu holder — final prototype"),
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
            6:  ("2",    "Solar bicycle light with mounting bracket"),
            7:  ("3",    "Range of pewter jewellery items"),
            9:  ("3",    "Pewter jewellery necklace detail"),
            10: ("4",    "Memphis-style designer lamp (source of inspiration)"),
            11: ("4",    "Memphis-style designer chair (source of inspiration)"),
            12: ("4",    "Memphis-style designer lamp (car form)"),
            13: ("4",    "Carlton bookcase — Ettore Sottsass (source of inspiration)"),
            14: ("5",    "New garden pruning tool — replacement design"),
            15: ("5",    "New garden pruning tool — open position"),
            16: ("5",    "Existing garden tool being replaced"),
            17: ("5",    "Garden tool — blade and mechanism components"),
            18: ("6",    "New swimming aid — arm straps"),
            19: ("6",    "Swimming aid in use"),
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
            2:  ("2",    "Range of new coffee mugs with coloured holders"),
            3:  ("2",    "New coffee mug — orange holder with glass"),
            4:  ("3",    "Mini fridge with energy label"),
            5:  ("4",    "Kitchen product — yellow cooking bag in use"),
            6:  ("4",    "Range of children's kitchen products"),
            7:  ("4",    "Child using kitchen product"),
            8:  ("4",    "New kitchen product — blue HDPE bowl"),
            9:  ("5",    "Flat-packed corrugated cardboard stool"),
            10: ("5",    "Flat-packed corrugated cardboard chair"),
            11: ("5",    "Corrugated cardboard cube packaging"),
            12: ("5",    "Corrugated cardboard box with product"),
            13: ("5",    "Corrugated cardboard pendant lamp"),
            14: ("5",    "Bicycle rack in mild steel — concept A"),
            15: ("5",    "Bicycle rack in mild steel — concept B"),
            16: ("6",    "Portable tennis game for 3–5 year olds"),
            17: ("6",    "Tennis game — paddles"),
            18: ("6",    "Tennis game — base/spinner component"),
            19: ("6",    "Tennis game base used as carry case"),
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


def guess_topic(text: str) -> str:
    combined = text.lower()
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
    return "short-answer"


def make_part_label(part_key: str, qnum: str) -> str:
    """Convert "3a_i" → "(a)(i)", "3b" → "(b)", "3_i" → "(i)", "3" → ""."""
    suffix = part_key[len(qnum):]
    if suffix.startswith("_"):
        suffix = suffix[1:]
    if not suffix:
        return ""
    segments = suffix.split("_")
    return "".join(f"({s})" for s in segments if s)


def _clean_qtext(t: str) -> str:
    t = re.sub(r'^\d{1,2}\.\s*', '', t.strip())
    lines = []
    for ln in t.split('\n'):
        s = ln.strip()
        if re.match(r'^\.{5,}', s):
            continue
        if s:
            lines.append(s)
        elif lines and lines[-1] != '':
            lines.append('')
    return '\n'.join(lines).strip()


def _parse_sub_grouped(qnum: str, body: str, full: str) -> dict:
    """Parse sub-questions, returning {"context": str, "parts": [...]}."""
    body_nl = "\n" + body

    # Try to split on (a), (b), (c)... first
    sub_pat = r'\n\s{0,30}\(([a-hj-uw-z])\)\s+'
    parts = re.split(sub_pat, body_nl)

    if len(parts) <= 1:
        # No (a),(b) parts — check for direct roman numeral sub-questions
        roman_pat = r'\n\s{0,30}\((i{1,3}v?|vi{0,3}|iv|ix)\)\s+'
        rparts = re.split(roman_pat, body_nl)

        if len(rparts) > 1:
            preamble = rparts[0].strip()
            result_parts = []
            j = 1
            while j < len(rparts):
                rnum  = rparts[j]
                rbody = rparts[j+1] if j+1 < len(rparts) else ""
                j += 2
                marks = extract_marks(rbody)
                result_parts.append({
                    "question_number": f"{qnum}_{rnum}",
                    "question_text":   _clean_qtext(f"({rnum}) {rbody}"),
                    "marks":           marks,
                })
            return {"context": _clean_qtext(preamble), "parts": result_parts}
        else:
            marks = extract_marks(body)
            return {
                "context": "",
                "parts": [{
                    "question_number": qnum,
                    "question_text":   _clean_qtext(full),
                    "marks":           marks,
                }]
            }

    context = _clean_qtext(parts[0])
    result_parts = []

    i = 1
    while i < len(parts):
        letter = parts[i]
        sbody  = parts[i + 1] if i + 1 < len(parts) else ""
        i += 2

        roman_pat = r'\n\s{0,30}\((i{1,3}v?|vi{0,3}|iv|ix)\)\s+'
        rparts = re.split(roman_pat, "\n" + sbody)

        if len(rparts) <= 1:
            marks = extract_marks(sbody)
            result_parts.append({
                "question_number": f"{qnum}{letter}",
                "question_text":   _clean_qtext(f"({letter}) {sbody}"),
                "marks":           marks,
            })
        else:
            sub_pre   = rparts[0].strip()
            has_marks = any(re.search(r'\[\d+\]', rparts[j+1] if j+1 < len(rparts) else "")
                            for j in range(1, len(rparts)-1, 2))

            if not has_marks:
                marks = extract_marks(sbody)
                result_parts.append({
                    "question_number": f"{qnum}{letter}",
                    "question_text":   _clean_qtext(f"({letter}) {sbody}"),
                    "marks":           marks,
                })
            else:
                j = 1
                while j < len(rparts):
                    rnum  = rparts[j]
                    rbody = rparts[j+1] if j+1 < len(rparts) else ""
                    j += 2
                    marks = extract_marks(rbody)
                    if sub_pre:
                        qt = f"({letter}) {sub_pre}\n\n({rnum}) {rbody}"
                    else:
                        qt = f"({letter})({rnum}) {rbody}"
                    result_parts.append({
                        "question_number": f"{qnum}{letter}_{rnum}",
                        "question_text":   _clean_qtext(qt),
                        "marks":           marks,
                    })

    return {"context": context, "parts": result_parts}


def parse_qp_grouped(text: str) -> list[dict]:
    """Parse question paper into grouped list, one entry per top-level question."""
    m = re.search(r'Answer all questions\.', text)
    if m:
        text = text[m.end():]
    m = re.search(r'END OF PAPER', text)
    if m:
        text = text[:m.start()]
    m = re.search(r'^\s{0,5}1\.\s+', text, flags=re.MULTILINE)
    if m:
        text = text[m.start():]

    chunks = re.split(r'\n(?=\s{0,5}\d{1,2}\.\s+)', text)
    groups = []
    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        m = re.match(r'(\d{1,2})\.\s+', chunk)
        if not m or len(chunk) < 20:
            continue
        qnum = m.group(1)
        body = chunk[m.end():]
        result = _parse_sub_grouped(qnum, body, chunk)
        groups.append({
            "question_number": qnum,
            "context":         result["context"],
            "parts":           result["parts"],
        })
    return groups


def _clean_ms_answer(text: str) -> str:
    text = re.sub(r'\s+AO\d\s+AO\d\s+Mark\s*', '\n', text)
    text = re.sub(r'\s+✓\s+\d+\s*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'\s+✓\s*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*\d+\s*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'©\s*WJEC\s+CBAC\s+Ltd\..*', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def parse_ms(text: str) -> dict[str, str]:
    """Parse mark scheme into {question_key: answer_text} dict."""
    answers = {}

    m = re.search(r'Question\s+1\b', text)
    if m:
        text = text[m.start():]

    text = re.sub(r'Band\s+\d+.*?(?=\n\s*(?:Question|\Z))', '', text, flags=re.DOTALL)

    current_q      = ""
    current_letter = ""
    current_key    = None
    body_lines: list[str] = []

    q_header     = re.compile(r'^\s*Question\s+(\d{1,2})\s*$')
    letter_roman = re.compile(r'^\s{0,6}\(([a-hj-uw-z])\)\s+\(([ivx]+)\)\s{2,}(.+)')
    letter_only  = re.compile(r'^\s{0,6}\(([a-hj-uw-z])\)\s{2,}(.+)')
    roman_only   = re.compile(r'^\s{0,6}\(([ivx]+)\)\s{2,}(.+)')

    def flush():
        nonlocal current_key, body_lines
        if current_key and body_lines:
            ans = _clean_ms_answer('\n'.join(body_lines))
            if ans:
                answers[current_key] = ans
        body_lines = []

    for line in text.split('\n'):
        hm = q_header.match(line)
        if hm:
            flush()
            current_q      = hm.group(1)
            current_letter = ""
            current_key    = None
            continue

        mm = letter_roman.match(line)
        if mm:
            flush()
            current_letter = mm.group(1)
            current_key    = f"{current_q}{current_letter}_{mm.group(2)}"
            body_lines     = [mm.group(3)]
            continue

        mm = letter_only.match(line)
        if mm:
            flush()
            current_letter = mm.group(1)
            current_key    = f"{current_q}{current_letter}"
            body_lines     = [mm.group(2)]
            continue

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


def find_answer(answers: dict, pkey: str) -> str | None:
    """Look up mark scheme answer with progressive fallbacks."""
    ans = answers.get(pkey)
    if not ans and "_" in pkey:
        # "6a_i" → try "6a"
        ans = answers.get(pkey.split("_")[0])
    if not ans and "_" in pkey:
        # "6_i" → try "6a_i" (MS has spurious letter from split (a)/(i) lines)
        num_m = re.match(r'(\d+)_(.+)', pkey)
        if num_m:
            ans = answers.get(f"{num_m.group(1)}a_{num_m.group(2)}")
    if not ans and len(pkey) > 1:
        # "6b" → try "6"
        num_only = re.match(r'(\d+)', pkey)
        if num_only:
            ans = answers.get(num_only.group(1))
    if not ans and "_" not in pkey:
        # "6b" → try combining "6b_i", "6b_ii", etc.
        for roman in ["i", "ii", "iii"]:
            k = f"{pkey}_{roman}"
            if k in answers:
                combined = [answers[f"{pkey}_{r}"] for r in ["i", "ii", "iii", "iv"] if f"{pkey}_{r}" in answers]
                ans = "\n\n".join(combined)
                break
    return ans


def copy_images(year_str: str, meta: dict) -> dict:
    """Copy relevant images to assets/img/papers/ with descriptive names."""
    IMG_DEST.mkdir(parents=True, exist_ok=True)
    prefix = f"{meta['session'].lower()[:1]}{str(meta['year'])[2:]}pd"

    copied = {}
    for idx, (qnum, desc) in sorted(meta["images"].items()):
        src = IMG_SRC_DIR / f"{year_str}-{idx:03d}.png"
        if not src.exists():
            src = IMG_SRC_DIR / f"{year_str}-{idx:03d}.jpg"
        if not src.exists():
            print(f"    Warning: image {idx} not found for {year_str}")
            continue

        safe_q = qnum.replace('_', '').replace(' ', '')
        dest_name = f"{prefix}-q{safe_q}-{idx:03d}.jpg"
        dest = IMG_DEST / dest_name

        from PIL import Image
        img = Image.open(src).convert('RGB')
        img.save(dest, 'JPEG', quality=85)
        copied[idx] = f"/assets/img/papers/{dest_name}"
        print(f"    Copied img {idx:03d} → {dest_name}")

    return copied


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
    groups = parse_qp_grouped(qp_text)
    total_parts = sum(len(g["parts"]) for g in groups)
    print(f"  Found {len(groups)} questions ({total_parts} parts)")

    print("  Parsing mark scheme…")
    answers = parse_ms(ms_text)
    print(f"  Found {len(answers)} MS entries — keys: {sorted(answers.keys())}")

    print("  Copying images…")
    img_map = copy_images(year_str, meta)

    # All images for a question grouped by main question number
    qnum_to_imgs: dict[str, list[str]] = {}
    for idx, path in sorted(img_map.items()):
        qkey = meta["images"][idx][0]
        main_qnum = re.match(r'(\d+)', qkey).group(1)
        qnum_to_imgs.setdefault(main_qnum, []).append(path)

    results = []
    prefix = f"{meta['session'].lower()[:1]}{str(meta['year'])[2:]}"

    for group_data in groups:
        qnum    = group_data["question_number"]
        context = group_data["context"]
        images  = qnum_to_imgs.get(qnum, [])

        parts = []
        for p in group_data["parts"]:
            pkey  = p["question_number"]
            ans   = find_answer(answers, pkey)
            label = make_part_label(pkey, qnum)

            part_entry = {
                "part":         pkey,
                "label":        label,
                "marks":        p["marks"],
                "type":         guess_type(p["question_text"], p["marks"]),
                "question":     p["question_text"],
                "answer":       ans or "ANSWER NOT FOUND — needs manual entry",
                "needs_review": ans is None or p["marks"] == 0,
            }
            parts.append(part_entry)

            matched = "✓" if ans else "✗"
            img_ind = "📷" if images else "  "
            print(f"    {matched}{img_ind} Q{pkey:8s} ({p['marks']}m)")

        total_marks = sum(p["marks"] for p in parts)
        all_types   = [p["type"] for p in parts]
        dom_type    = max(set(all_types), key=all_types.count) if all_types else "short-answer"

        all_text = context + " " + " ".join(p["question"] + " " + p["answer"] for p in parts)
        topic    = guess_topic(all_text)

        group_entry = {
            "id":              f"{prefix}-q{qnum}",
            "paper":           meta["code"],
            "year":            meta["year"],
            "session":         meta["session"],
            "question_number": qnum,
            "topic":           topic,
            "total_marks":     total_marks,
            "type":            dom_type,
            "images":          images,
            "context":         context,
            "parts":           parts,
        }
        results.append(group_entry)

    part_keys   = {p["part"] for g in results for p in g["parts"]}
    unmatched   = set(answers.keys()) - part_keys
    if unmatched:
        print(f"  Unmatched MS keys: {sorted(unmatched)}")

    print(f"  Wrote {len(results)} question groups → {year_str}.json")
    return results


def main():
    target = None
    if len(sys.argv) == 3 and sys.argv[1] == "--paper":
        target = sys.argv[2]

    OUTPUT_DIR.mkdir(exist_ok=True)
    all_groups = []

    for year_str, meta in PAPER_META.items():
        if target and year_str != target:
            continue
        groups = process_paper(year_str, meta)
        all_groups.extend(groups)

        out = OUTPUT_DIR / f"{year_str}.json"
        out.write_text(json.dumps(groups, indent=2, ensure_ascii=False))

    if not target:
        combined = OUTPUT_DIR / "all_questions.json"
        combined.write_text(json.dumps(all_groups, indent=2, ensure_ascii=False))

    # Summary
    topics  = {}
    matched = 0
    total_p = 0
    imgs    = 0
    for g in all_groups:
        topics[g["topic"]] = topics.get(g["topic"], 0) + 1
        if g["images"]:
            imgs += 1
        for p in g["parts"]:
            total_p += 1
            if "NOT FOUND" not in p["answer"]:
                matched += 1

    print(f"\nTotal: {len(all_groups)} question groups, {total_p} parts across all papers")
    print(f"Answers matched: {matched}/{total_p}")
    print(f"Questions with images: {imgs}/{len(all_groups)}")
    print("\nTopic breakdown:")
    for t, c in sorted(topics.items(), key=lambda x: -x[1]):
        print(f"  {t}: {c}")


if __name__ == "__main__":
    main()
