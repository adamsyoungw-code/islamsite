#!/usr/bin/env python3
"""Парсер итогового теста (books/akyda-1-itogovyy-test.pdf).

Возвращает список из 100 вопросов вида {question, options, correct},
где correct — индекс варианта, отмеченного ✅ в PDF.
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "books" / "akyda-1-itogovyy-test.pdf"
ZW = "​"


def parse():
    import fitz

    d = fitz.open(PDF)
    text = "\n".join(d.load_page(i).get_text() for i in range(d.page_count))

    questions = []
    q = None          # текущий вопрос {question, options, correct}
    buf = None        # текущий буфер (список строк) — вопрос или вариант
    target = None     # "q" | "opt"

    def flush_opt():
        nonlocal buf, target
        if target == "opt" and buf is not None:
            txt = " ".join(buf).strip()
            correct = txt.startswith("✅")
            txt = txt.lstrip("✅").strip()
            txt = re.sub(r"\s{2,}", " ", txt)
            if correct:
                q["correct"] = len(q["options"])
            q["options"].append(txt)
        buf, target = None, None

    for raw in text.splitlines():
        line = raw.replace(ZW, "").rstrip()
        mq = re.match(r"^\s*(\d{1,3})\.(?!\d)\s*(.*)$", line)
        mo = re.match(r"^\s*○\s*(.*)$", line)
        if mq:
            flush_opt()
            if q:
                questions.append(q)
            q = {"question": mq.group(2).strip(), "options": [], "correct": None}
            buf, target = None, None
        elif mo:
            flush_opt()
            buf, target = [mo.group(1)], "opt"
        elif line.strip() == "":
            continue
        else:
            # продолжение текста вопроса или варианта
            if target == "opt" and buf is not None:
                buf.append(line.strip())
            elif q and not q["options"]:
                q["question"] += " " + line.strip()
    flush_opt()
    if q:
        questions.append(q)

    # нормализация текста вопроса
    for it in questions:
        it["question"] = re.sub(r"\s{2,}", " ", it["question"]).strip()
    return questions


if __name__ == "__main__":
    import argparse
    import json

    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="записать итоговый тест в data.json")
    ap.add_argument("--cycle", default="akyda-1", help="id цикла")
    ap.add_argument("--minutes", type=int, default=45, help="лимит времени, мин")
    args = ap.parse_args()

    qs = parse()
    bad = [i + 1 for i, q in enumerate(qs) if q["correct"] is None or len(q["options"]) < 2]
    print(f"вопросов: {len(qs)} | проблемных: {bad}")
    if bad:
        raise SystemExit("Есть проблемные вопросы — проверьте PDF/парсер.")

    if not args.apply:
        for i, q in enumerate(qs, 1):
            print(f"{i:>3}. [{q['correct']}] {q['question'][:70]}")
        raise SystemExit(0)

    data_path = ROOT / "data.json"
    data = json.loads(data_path.read_text(encoding="utf-8"))
    found = False
    for sec in data["sections"]:
        for cyc in sec["cycles"]:
            if cyc["id"] == args.cycle:
                cyc.pop("finalTestUrl", None)  # внешнюю форму заменяем встроенным тестом
                cyc["finalTest"] = {"timeLimitMin": args.minutes, "questions": qs}
                found = True
    if not found:
        raise SystemExit(f"Цикл {args.cycle} не найден.")
    data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Итоговый тест ({len(qs)} вопросов, лимит {args.minutes} мин) записан в цикл {args.cycle}.")

