#!/usr/bin/env python3
"""Сборка тестов к урокам цикла Акыда-1.

Для каждого урока:
  * tests — до 5 тестовых вопросов (с вариантами), точно относящихся к уроку.
    Берутся из итогового теста по тематической раскладке TOPIC; для уроков 2
    и 3 — из уже занесённых вопросов (со скриншотов их форм), усечённых до 5.
  * questions — до 5 открытых вопросов (без вариантов), которые НЕ дублируют
    тестовые. Берутся из присланных вопросов к уроку.
  * гугл-формы (testUrl) удаляются — остаётся только встроенный тест.

    python tools/build_tests.py
"""

import importlib.util
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data.json"

_spec = importlib.util.spec_from_file_location("pft", ROOT / "tools" / "parse_final_test.py")
_pft = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_pft)

# Тематическая раскладка: id урока → номера вопросов итогового теста (1-based).
# Уроки 2 и 3 не здесь — у них свои тесты (со скриншотов форм).
TOPIC = {
    "akyda-1-1":  [1, 2, 10, 11, 12],
    "akyda-1-4":  [29, 31, 32, 33, 34],
    "akyda-1-5":  [37, 39, 85, 87],
    "akyda-1-6":  [88, 89, 90, 91, 93],
    "akyda-1-7":  [38, 79, 80, 81, 84],
    "akyda-1-8":  [76, 77, 78],
    "akyda-1-9":  [40, 71, 72, 74, 86],
    "akyda-1-10": [41, 49, 64, 66, 73],
    "akyda-1-11": [42, 55, 56, 57, 58],
    "akyda-1-12": [16, 43, 44, 97, 100],
    "akyda-1-13": [17, 18, 45, 47, 48],
    "akyda-1-14": [50, 51, 52],
}

STOP = set("что такое в и на не как ли о об у за по для из то же бы он его это "
           "всех все мы я а к со с от до или чем чём него нам нас".split())


def toks(s):
    s = s.lower().replace("ё", "е")
    s = re.sub(r"[^а-яa-z0-9 ]", " ", s)
    return {w for w in s.split() if len(w) > 2 and w not in STOP}


def jaccard(a, b):
    return len(a & b) / (len(a | b) or 1)


def main():
    final = _pft.parse()
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))

    for sec in data["sections"]:
        for cyc in sec["cycles"]:
            for les in cyc["lessons"]:
                lid = les["id"]
                if lid in TOPIC:
                    tests = [final[n - 1] for n in TOPIC[lid]][:5]
                elif les.get("tests"):
                    tests = les["tests"][:5]   # уроки 2, 3 — усекаем до 5
                else:
                    continue  # урок не из этого цикла

                les["tests"] = tests
                les.pop("testUrl", None)       # гугл-формы убираем

                # открытые вопросы: до 5, исключая дубли тестовых
                ttoks = [toks(t["question"]) for t in tests]
                kept = []
                for q in les.get("questions", []):
                    qt = toks(q)
                    if any(jaccard(qt, tt) >= 0.5 for tt in ttoks):
                        continue
                    kept.append(q)
                    if len(kept) >= 5:
                        break
                les["questions"] = kept
                les["draft"] = True
                print(f"{lid}: тест {len(tests)} вопр., открытых {len(kept)}")

    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Готово.")


if __name__ == "__main__":
    main()
