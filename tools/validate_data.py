#!/usr/bin/env python3
"""Контент-валидатор: проверяет data.json на типовые ошибки.

Запускается в CI на каждый push/PR (см. .github/workflows/validate.yml),
но можно гонять и локально:

    python tools/validate_data.py

Что проверяется:
  * data.json — валидный JSON и имеет ожидаемую структуру;
  * id разделов, циклов и уроков уникальны (глобально по всему файлу);
  * у каждого аудио-пути вида audio/... существует файл на диске
    (внешние http(s)-ссылки не проверяются);
  * тесты валидны: question — непустая строка, options — список из 2+
    строк, correct — индекс внутри options;
  * книги библиотеки имеют title и корректный url.

Код возврата 0 — всё чисто, 1 — есть ошибки (CI падает).
Предупреждения (например, пустой текст урока) не валят сборку.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data.json"

errors = []
warnings = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def check_tests(tests, where):
    if not isinstance(tests, list):
        err(f"{where}: поле tests должно быть массивом")
        return
    for i, t in enumerate(tests):
        w = f"{where}: тест #{i}"
        if not isinstance(t, dict):
            err(f"{w}: должен быть объектом")
            continue
        q = t.get("question")
        if not isinstance(q, str) or not q.strip():
            err(f"{w}: question должен быть непустой строкой")
        opts = t.get("options")
        if not isinstance(opts, list) or len(opts) < 2:
            err(f"{w}: options должен быть списком из 2+ вариантов")
            continue
        if not all(isinstance(o, str) and o.strip() for o in opts):
            err(f"{w}: все варианты в options должны быть непустыми строками")
        c = t.get("correct")
        if not isinstance(c, int) or isinstance(c, bool) or not (0 <= c < len(opts)):
            err(f"{w}: correct должен быть индексом внутри options (0..{len(opts) - 1})")


def check_audio(audio, where):
    if not audio:
        warn(f"{where}: нет аудио (будет показано «будет добавлено позже»)")
        return
    if audio.startswith(("http://", "https://")):
        return  # внешние ссылки не проверяем
    if not (ROOT / audio).exists():
        err(f"{where}: аудиофайл не найден: {audio}")


def main():
    if not DATA_PATH.exists():
        err("data.json не найден")
        return finish()

    try:
        with open(DATA_PATH, encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        err(f"data.json — невалидный JSON: {e}")
        return finish()

    if not isinstance(data, dict) or "sections" not in data:
        err("data.json должен быть объектом с ключом 'sections'")
        return finish()

    seen_ids = {}

    def claim_id(id_, where):
        if not id_:
            err(f"{where}: пустой id")
            return
        if id_ in seen_ids:
            err(f"{where}: дублирующийся id '{id_}' (уже у {seen_ids[id_]})")
        else:
            seen_ids[id_] = where

    for s_i, sec in enumerate(data["sections"]):
        s_where = f"раздел #{s_i} ({sec.get('title', '?')})"
        claim_id(sec.get("id"), s_where)
        for c_i, cyc in enumerate(sec.get("cycles", [])):
            c_where = f"{sec.get('id', '?')} / цикл #{c_i} ({cyc.get('title', '?')})"
            claim_id(cyc.get("id"), c_where)
            for l_i, les in enumerate(cyc.get("lessons", [])):
                les_id = les.get("id") or f"{cyc.get('id', '?')}-#{l_i}"
                l_where = f"урок {les_id}"
                claim_id(les.get("id"), l_where)
                if not les.get("title"):
                    err(f"{l_where}: нет заголовка")
                check_audio(les.get("audio", ""), l_where)
                check_tests(les.get("tests", []), l_where)
                if not les.get("text"):
                    warn(f"{l_where}: пустой текст урока")

    for b_i, book in enumerate(data.get("library", [])):
        b_where = f"библиотека / книга #{b_i} ({book.get('title', '?')})"
        if not book.get("title"):
            err(f"{b_where}: нет названия")
        url = book.get("url", "")
        if url and not url.startswith(("http://", "https://")):
            err(f"{b_where}: url должен начинаться с http(s):// — {url}")

    return finish()


def finish():
    for w in warnings:
        print(f"⚠️  {w}")
    for e in errors:
        print(f"❌ {e}")
    if errors:
        print(f"\nНайдено ошибок: {len(errors)} (предупреждений: {len(warnings)})")
        sys.exit(1)
    print(f"✅ data.json в порядке (предупреждений: {len(warnings)})")
    sys.exit(0)


if __name__ == "__main__":
    main()
