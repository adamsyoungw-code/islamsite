#!/usr/bin/env python3
"""
Агент для скачивания аудио из Telegram-канала вместе с их названиями.

Скачивает все аудиозаписи (музыка / голосовые / аудио-документы) из
указанного канала и сохраняет их в папку с именами файлов по названию
трека. Дополнительно пишет manifest.json с метаданными (название,
исполнитель, длительность, дата, ссылка на сообщение).

Использование:
    1. Получите api_id и api_hash на https://my.telegram.org -> API development tools
    2. Установите зависимость:  pip install -r tools/requirements.txt
    3. Запустите:
         python tools/telegram_audio_downloader.py --channel @channel_name

Параметры можно задать через переменные окружения или аргументы:
    TG_API_ID, TG_API_HASH  — данные приложения Telegram
    --channel               — @username, ссылка t.me/... или числовой id канала
    --out                   — папка для сохранения (по умолчанию ./audio)
    --limit                 — сколько последних сообщений просмотреть (0 = все)
"""

import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path

try:
    from telethon import TelegramClient
    from telethon.tl.types import (
        DocumentAttributeAudio,
        DocumentAttributeFilename,
    )
except ImportError:
    sys.exit(
        "Не установлена библиотека telethon.\n"
        "Установите её: pip install -r tools/requirements.txt"
    )


def sanitize_filename(name: str) -> str:
    """Убирает символы, недопустимые в именах файлов."""
    name = name.strip()
    # запрещённые символы в именах файлов на разных ОС
    name = re.sub(r'[\\/:*?"<>|\n\r\t]+', " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    # ограничим длину, чтобы не упереться в лимиты ФС
    return name[:150] if name else "audio"


def audio_attributes(document):
    """Возвращает (DocumentAttributeAudio | None, имя_файла | None)."""
    audio_attr = None
    file_name = None
    for attr in document.attributes:
        if isinstance(attr, DocumentAttributeAudio):
            audio_attr = attr
        elif isinstance(attr, DocumentAttributeFilename):
            file_name = attr.file_name
    return audio_attr, file_name


def build_title(audio_attr, file_name, message) -> str:
    """Собирает осмысленное название трека."""
    if audio_attr is not None and not audio_attr.voice:
        title = (audio_attr.title or "").strip()
        performer = (audio_attr.performer or "").strip()
        if title and performer:
            return f"{performer} - {title}"
        if title:
            return title
    # запасной вариант — исходное имя файла без расширения
    if file_name:
        return Path(file_name).stem
    # для голосовых / без метаданных — текст подписи или id сообщения
    caption = (message.message or "").strip().splitlines()
    if caption and caption[0]:
        return caption[0]
    return f"audio_{message.id}"


def guess_extension(file_name, audio_attr) -> str:
    if file_name and "." in file_name:
        return Path(file_name).suffix
    if audio_attr is not None and audio_attr.voice:
        return ".ogg"
    return ".mp3"


async def run(args):
    api_id = args.api_id or os.environ.get("TG_API_ID")
    api_hash = args.api_hash or os.environ.get("TG_API_HASH")
    if not api_id or not api_hash:
        sys.exit(
            "Не заданы TG_API_ID / TG_API_HASH.\n"
            "Получите их на https://my.telegram.org и передайте через\n"
            "переменные окружения или аргументы --api-id / --api-hash."
        )

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest_path = out_dir / "manifest.json"
    manifest = []
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            manifest = []
    done_ids = {item["message_id"] for item in manifest}

    used_names = set()
    client = TelegramClient("tg_audio_session", int(api_id), api_hash)

    async with client:
        entity = await client.get_entity(args.channel)
        print(f"Канал: {getattr(entity, 'title', args.channel)}")

        limit = None if args.limit in (0, None) else args.limit
        downloaded = 0

        async for message in client.iter_messages(entity, limit=limit):
            doc = getattr(message, "document", None)
            if not doc:
                continue
            audio_attr, file_name = audio_attributes(doc)
            is_audio = audio_attr is not None or (
                doc.mime_type and doc.mime_type.startswith("audio")
            )
            if not is_audio:
                continue

            if message.id in done_ids:
                continue

            title = build_title(audio_attr, file_name, message)
            ext = guess_extension(file_name, audio_attr)
            base = sanitize_filename(title)

            # избегаем коллизий имён
            candidate = f"{base}{ext}"
            counter = 2
            while candidate in used_names or (out_dir / candidate).exists():
                candidate = f"{base} ({counter}){ext}"
                counter += 1
            used_names.add(candidate)

            target = out_dir / candidate
            print(f"↓ {candidate}")
            await client.download_media(message, file=str(target))

            manifest.append(
                {
                    "message_id": message.id,
                    "title": title,
                    "file": candidate,
                    "performer": getattr(audio_attr, "performer", None),
                    "duration_sec": getattr(audio_attr, "duration", None),
                    "date": message.date.isoformat() if message.date else None,
                    "link": f"https://t.me/{getattr(entity, 'username', '')}/{message.id}"
                    if getattr(entity, "username", None)
                    else None,
                }
            )
            done_ids.add(message.id)
            downloaded += 1

            # сохраняем manifest по ходу, чтобы не потерять прогресс
            manifest_path.write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

        print(f"\nГотово. Скачано новых файлов: {downloaded}")
        print(f"Всего записей в manifest: {len(manifest)}")
        print(f"Папка: {out_dir.resolve()}")


def parse_args():
    p = argparse.ArgumentParser(
        description="Скачивает аудио из Telegram-канала с их названиями."
    )
    p.add_argument(
        "--channel",
        required=True,
        help="@username, ссылка t.me/... или числовой id канала",
    )
    p.add_argument("--out", default="audio", help="папка для сохранения (по умолчанию ./audio)")
    p.add_argument("--limit", type=int, default=0, help="сколько сообщений просмотреть (0 = все)")
    p.add_argument("--api-id", dest="api_id", help="Telegram api_id (или TG_API_ID)")
    p.add_argument("--api-hash", dest="api_hash", help="Telegram api_hash (или TG_API_HASH)")
    return p.parse_args()


if __name__ == "__main__":
    try:
        asyncio.run(run(parse_args()))
    except KeyboardInterrupt:
        print("\nПрервано пользователем.")
