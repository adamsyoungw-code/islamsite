#!/usr/bin/env python3
"""Извлекатель «текста к уроку» из книги цикла (PDF).

Книга устроена как пронумерованные вопросы-ответы (1..100), сгруппированные
по главам; в начале каждой главы есть вступительная проза («введение»).
Скрипт нарезает книгу по диапазонам вопросов, заданным для каждого урока, и
кладёт результат в поле `text` уроков в data.json (с пометкой draft:true).

Если диапазон урока начинается с первого вопроса главы — в текст урока
включается и вступительная проза этой главы (то самое «введение»).

Карта уроков (id урока → диапазон вопросов) задаётся ниже в MAPPING.

    python tools/extract_book.py --dry-run   # показать границы, ничего не писать
    python tools/extract_book.py --apply     # записать в data.json
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data.json"
PDF_PATH = ROOT / "books" / "akyda-1.pdf"

# id урока → (первый вопрос, последний вопрос). Книга содержит вопросы 1..100,
# поэтому верхняя граница урока 14 фактически усекается до 100.
MAPPING = {
    "akyda-1-1":  (1, 3),
    "akyda-1-2":  (4, 12),
    "akyda-1-3":  (13, 21),
    "akyda-1-4":  (22, 29),
    "akyda-1-5":  (30, 40),
    "akyda-1-6":  (41, 48),
    "akyda-1-7":  (49, 55),
    "akyda-1-8":  (56, 59),
    "akyda-1-9":  (60, 67),
    "akyda-1-10": (68, 78),
    "akyda-1-11": (79, 85),
    "akyda-1-12": (86, 91),
    "akyda-1-13": (92, 98),
    "akyda-1-14": (99, 102),
}


def build_index():
    """Возвращает (text, q_offsets, chapter_first, chapter_offsets)."""
    import fitz

    d = fitz.open(PDF_PATH)
    pages = [d.load_page(i).get_text() for i in range(d.page_count)]
    text = "\n".join(pages)

    # офсет начала каждой страницы в склеенном тексте
    page_off = []
    acc = 0
    for p in pages:
        page_off.append(acc)
        acc += len(p) + 1  # +1 за "\n"

    # Кандидаты «N.» в начале строки. Настоящий вопрос — вопросительный
    # (в пределах ~400 символов до следующего кандидата есть «?»); пункты
    # нумерованных списков («1. Вера в Аллаха.») «?» не содержат и отсеиваются.
    cands = [
        (int(m.group(1)), m.start())
        for m in re.finditer(r"(?m)^\s*(\d{1,3})\.\s", text)
        if 1 <= int(m.group(1)) <= 110
    ]
    cands.sort(key=lambda c: c[1])
    starts = [off for _n, off in cands]

    import bisect

    def interrogative(off):
        i = bisect.bisect_right(starts, off)
        nxt = starts[i] if i < len(starts) else off + 400
        return "?" in text[off : min(nxt, off + 400)]

    # Пасс 1: якоря по вопросительным пунктам (с «?»). Для каждого номера —
    # самый ранний вопросительный кандидат после предыдущего. Так отсекается
    # нумерованный список из предисловия (в нём нет «?»).
    q_off = {}
    last = -1
    for n in range(1, 111):
        opts = [off for num, off in cands if num == n and off > last and interrogative(off)]
        if opts:
            q_off[n] = min(opts)
            last = q_off[n]

    # Пасс 2: добиваем пропуски — повелительные пункты («Расскажите…», без «?»).
    # Берём кандидата с номером n, зажатого между соседями q_off[n-1] и q_off[n+1].
    nums_known = sorted(q_off)
    if nums_known:
        for n in range(nums_known[0], nums_known[-1] + 1):
            if n in q_off:
                continue
            lo = q_off.get(n - 1, -1)
            hi = q_off.get(n + 1, len(text))
            opts = [off for num, off in cands if num == n and lo < off < hi]
            if opts:
                q_off[n] = min(opts)

    # главы из оглавления (страница → офсет начала страницы)
    chap = []  # (offset, title)
    for _lvl, title, pg in d.get_toc():
        if 1 <= pg <= len(page_off):
            chap.append((page_off[pg - 1], title))
    chap.sort()

    # первый вопрос каждой главы = наименьший вопрос с офсетом >= офсета главы
    chapter_first = {}  # номер первого вопроса главы → заголовок
    for c_off, title in chap:
        cand = [n for n, off in q_off.items() if off >= c_off]
        if cand:
            chapter_first[min(cand)] = title

    return text, q_off, chapter_first, chap


def clean(s):
    # 1. выкинуть строки-номера страниц (только цифры)
    lines = [ln for ln in s.splitlines() if not re.fullmatch(r"\s*\d{1,3}\s*", ln)]
    s = "\n".join(lines)

    # перенос по дефису: «Ахлю-с-\nСунна» → «Ахлю-с-Сунна»
    s = re.sub(r"(\S)-\n\s*(\S)", r"\1-\2", s)

    # 2. абзацы разделены пустыми строками; внутри абзаца PDF переносит строки
    #    по ширине страницы — «расклеиваем» их в пробелы (на сайте
    #    white-space: pre-wrap, иначе текст рвётся посреди предложений).
    paras = re.split(r"\n\s*\n", s)
    out = []
    for p in paras:
        p = re.sub(r"\s*\n\s*", " ", p)   # переносы внутри абзаца → пробел
        p = re.sub(r"[ \t]{2,}", " ", p).strip()
        if p:
            out.append(p)
    return "\n\n".join(out)


def slice_for(text, q_off, chapter_first, chap, first, last):
    maxq = max(q_off)
    first = min(first, maxq)
    last = min(last, maxq)

    # старт: если урок начинается с первого вопроса главы — от заголовка главы
    # (введение). Ищем заголовок в тексте перед вопросом, чтобы не зацепить
    # оглавление.
    start = q_off[first]
    if first in chapter_first:
        title = chapter_first[first]
        window_start = max(0, q_off[first] - 3000)
        pos = text.rfind(title, window_start, q_off[first])
        if pos != -1:
            start = pos

    # конец: начало вопроса last+1, иначе конец текста
    nxt = last + 1
    end = q_off[nxt] if nxt in q_off else len(text)

    return clean(text[start:end])


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true", help="показать границы, не писать")
    g.add_argument("--apply", action="store_true", help="записать в data.json")
    args = ap.parse_args()

    try:
        import fitz  # noqa: F401
    except ImportError:
        sys.exit("Нужен pymupdf: pip install pymupdf")

    text, q_off, chapter_first, chap = build_index()

    extracted = {}
    for lid, (a, b) in MAPPING.items():
        body = slice_for(text, q_off, chapter_first, chap, a, b)
        extracted[lid] = body
        intro = f" (+введение: {chapter_first[a]})" if a in chapter_first else ""
        head = body[:90].replace("\n", " ")
        tail = body[-90:].replace("\n", " ")
        print(f"\n{lid}: вопросы {a}-{b}{intro} — {len(body)} симв.")
        print(f"  ↳ начало: {head}…")
        print(f"  ↳ конец:  …{tail}")

    if args.dry_run:
        print("\n[dry-run] data.json не изменён.")
        return

    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    count = 0
    for sec in data["sections"]:
        for cyc in sec["cycles"]:
            for les in cyc["lessons"]:
                if les["id"] in extracted:
                    les["text"] = extracted[les["id"]]
                    les["draft"] = True
                    count += 1
    DATA_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"\n[apply] Обновлено уроков: {count}. Все помечены draft:true — нужна вычитка.")


if __name__ == "__main__":
    main()
