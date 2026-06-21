#!/usr/bin/env python3
"""Агент: контент-пайплайн уроков.

Превращает аудиофайлы уроков в готовый учебный материал и записывает
результат прямо в `data.json`. Три стадии, которые можно запускать по
отдельности:

  1. transcribe — аудио (`audio/<id>.mp3`) → черновая транскрипция
     (локально через faster-whisper). Сырой текст кладётся в
     `tools/transcripts/<id>.txt`, чтобы можно было его проверить и
     переиспользовать без повторного прогона модели.
  2. lesson — транскрипция → структурированный конспект урока
     (через Claude API). Пишется в поле `text` урока.
  3. tests — текст урока → вопросы в формате сайта
     ({question, options, correct}). Пишутся в поле `tests` урока.

Богословский контент: сгенерированные конспекты и тесты — это ЧЕРНОВИК.
Перед публикацией их должен проверить человек, разбирающийся в теме.
Пайплайн помечает свежесгенерированные уроки флагом `"draft": true` в
data.json, чтобы было видно, что материал ещё не вычитан.

Примеры:

    # одна стадия, один урок
    python tools/content_pipeline.py transcribe --lesson akyda-1-1

    # весь цикл целиком, все стадии
    python tools/content_pipeline.py all --section akyda --cycle akyda-1

    # перегенерировать только тесты для уже готовых текстов
    python tools/content_pipeline.py tests --section akyda

Переменные окружения:
    ANTHROPIC_API_KEY  — ключ для стадий lesson и tests.
    WHISPER_MODEL      — размер модели whisper (по умолчанию "small").
"""

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data.json"
TRANSCRIPTS_DIR = Path(__file__).resolve().parent / "transcripts"

MODEL = "claude-opus-4-8"


# --------------------------------------------------------------------------
# Работа с data.json
# --------------------------------------------------------------------------
def load_data():
    with open(DATA_PATH, encoding="utf-8") as f:
        return json.load(f)


def save_data(data):
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def iter_lessons(data, section=None, cycle=None, lesson=None):
    """Перебирает уроки с учётом фильтров section/cycle/lesson."""
    for sec in data["sections"]:
        if section and sec["id"] != section:
            continue
        for cyc in sec["cycles"]:
            if cycle and cyc["id"] != cycle:
                continue
            for les in cyc["lessons"]:
                if lesson and les["id"] != lesson:
                    continue
                yield sec, cyc, les


# --------------------------------------------------------------------------
# Стадия 1: транскрипция
# --------------------------------------------------------------------------
def transcribe_path(lesson_id):
    return TRANSCRIPTS_DIR / f"{lesson_id}.txt"


def stage_transcribe(les, *, force=False):
    audio_rel = les.get("audio") or ""
    audio_path = ROOT / audio_rel
    out_path = transcribe_path(les["id"])

    if not audio_rel or not audio_path.exists():
        print(f"  [skip] {les['id']}: нет аудиофайла ({audio_rel or '—'})")
        return False
    if out_path.exists() and not force:
        print(f"  [ok]   {les['id']}: транскрипция уже есть (--force чтобы перезаписать)")
        return False

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit(
            "Нужен faster-whisper: pip install -r tools/requirements.txt\n"
            "(стадия transcribe работает локально, без обращения к API)"
        )

    model_size = os.environ.get("WHISPER_MODEL", "small")
    print(f"  [run]  {les['id']}: транскрибирую ({model_size})…")
    model = WhisperModel(model_size, compute_type="int8")
    segments, _ = model.transcribe(str(audio_path), language="ru")
    text = " ".join(seg.text.strip() for seg in segments).strip()

    TRANSCRIPTS_DIR.mkdir(exist_ok=True)
    out_path.write_text(text, encoding="utf-8")
    print(f"  [done] {les['id']}: {len(text)} символов → {out_path.relative_to(ROOT)}")
    return True


# --------------------------------------------------------------------------
# Claude API (стадии 2 и 3)
# --------------------------------------------------------------------------
def get_client():
    try:
        import anthropic
    except ImportError:
        sys.exit("Нужен пакет anthropic: pip install -r tools/requirements.txt")
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("Не задан ANTHROPIC_API_KEY (нужен для стадий lesson и tests).")
    return anthropic.Anthropic()


def call_claude(client, system, user, *, max_tokens=8000):
    resp = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        thinking={"type": "adaptive"},
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    if resp.stop_reason == "refusal":
        raise RuntimeError("Модель отклонила запрос (refusal).")
    return "".join(b.text for b in resp.content if b.type == "text").strip()


LESSON_SYSTEM = (
    "Ты — редактор учебных материалов по исламским наукам. "
    "Из сырой расшифровки аудиоурока сделай чистый, структурированный "
    "конспект на русском языке: связный текст с подзаголовками, ключевыми "
    "тезисами и определениями терминов. Сохраняй смысл оригинала, не "
    "добавляй ничего от себя и не выноси спорных богословских суждений. "
    "Если в расшифровке есть цитаты из Корана или хадисов — оформи их "
    "аккуратно, но не выдумывай источники. Верни только текст конспекта."
)


def stage_lesson(client, les, *, force=False):
    if les.get("text") and not force:
        print(f"  [ok]   {les['id']}: текст уже есть (--force чтобы перезаписать)")
        return False
    tpath = transcribe_path(les["id"])
    if not tpath.exists():
        print(f"  [skip] {les['id']}: нет транскрипции — сначала стадия transcribe")
        return False

    transcript = tpath.read_text(encoding="utf-8")
    print(f"  [run]  {les['id']}: генерирую конспект…")
    user = f"Заголовок урока: {les['title']}\n\nРасшифровка аудио:\n{transcript}"
    les["text"] = call_claude(client, LESSON_SYSTEM, user)
    les["draft"] = True
    print(f"  [done] {les['id']}: {len(les['text'])} символов (помечен draft)")
    return True


TESTS_SYSTEM = (
    "Ты составляешь проверочные тесты по тексту урока исламских наук. "
    "По данному тексту сделай 3–5 вопросов для самопроверки. "
    "Каждый вопрос — это объект с полями: question (строка), "
    "options (массив из 3–4 вариантов ответа), correct (индекс "
    "правильного варианта, начиная с 0). Вопросы должны проверять "
    "понимание именно этого урока, а не общие знания. "
    "Верни СТРОГО валидный JSON-массив таких объектов, без markdown и "
    "пояснений."
)


def stage_tests(client, les, *, force=False):
    if les.get("tests") and not force:
        print(f"  [ok]   {les['id']}: тесты уже есть (--force чтобы перезаписать)")
        return False
    if not les.get("text"):
        print(f"  [skip] {les['id']}: нет текста урока — сначала стадия lesson")
        return False

    print(f"  [run]  {les['id']}: генерирую тесты…")
    raw = call_claude(client, TESTS_SYSTEM, les["text"], max_tokens=4000)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1].lstrip("json").strip()
    try:
        tests = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"  [err]  {les['id']}: ответ не распарсился как JSON ({e}) — пропускаю")
        return False

    valid = [
        t for t in tests
        if isinstance(t, dict)
        and isinstance(t.get("question"), str)
        and isinstance(t.get("options"), list)
        and isinstance(t.get("correct"), int)
        and 0 <= t["correct"] < len(t["options"])
    ]
    if not valid:
        print(f"  [err]  {les['id']}: не нашёл валидных вопросов — пропускаю")
        return False

    les["tests"] = valid
    les["draft"] = True
    print(f"  [done] {les['id']}: {len(valid)} вопросов (помечен draft)")
    return True


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Контент-пайплайн уроков.")
    parser.add_argument(
        "stage",
        choices=["transcribe", "lesson", "tests", "all"],
        help="какую стадию запустить (all = все три по очереди)",
    )
    parser.add_argument("--section", help="id раздела (например, akyda)")
    parser.add_argument("--cycle", help="id цикла (например, akyda-1)")
    parser.add_argument("--lesson", help="id урока (например, akyda-1-1)")
    parser.add_argument(
        "--force", action="store_true",
        help="перезаписать уже заполненные поля",
    )
    args = parser.parse_args()

    data = load_data()
    targets = list(iter_lessons(data, args.section, args.cycle, args.lesson))
    if not targets:
        sys.exit("Под фильтры не попал ни один урок.")

    stages = ["transcribe", "lesson", "tests"] if args.stage == "all" else [args.stage]

    # Клиент создаём лениво — только если нужны стадии с API.
    client = None
    if {"lesson", "tests"} & set(stages):
        client = get_client()

    changed = False
    for stage in stages:
        print(f"\n=== Стадия: {stage} ===")
        for _sec, _cyc, les in targets:
            if stage == "transcribe":
                changed |= stage_transcribe(les, force=args.force)
            elif stage == "lesson":
                changed |= stage_lesson(client, les, force=args.force)
            elif stage == "tests":
                changed |= stage_tests(client, les, force=args.force)
            # Сохраняем после каждого урока на стадиях с API — чтобы не
            # потерять результат, если что-то упадёт на следующем.
            if stage in ("lesson", "tests") and changed:
                save_data(data)

    if changed:
        save_data(data)
        print("\nГотово. data.json обновлён. Поля с draft:true ждут проверки человеком.")
    else:
        print("\nНичего не изменилось.")


if __name__ == "__main__":
    main()
