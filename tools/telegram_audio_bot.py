#!/usr/bin/env python3
"""
Агент-бот для скачивания аудио из Telegram-канала.

В отличие от telegram_audio_downloader.py (вход по аккаунту), этот скрипт
работает через БОТА. Боты в Telegram не видят старую историю канала —
только сообщения, приходящие в реальном времени. Поэтому:

    1. Запустите этот скрипт (бот начнёт слушать).
    2. В вашем канале перешлите / заново отправьте аудио.
    3. Бот поймает каждое аудио и сохранит его с названием.

Требования:
    - Бот создан через @BotFather, есть его токен.
    - Бот добавлен АДМИНИСТРАТОРОМ в канал.
    - pip install -r tools/requirements.txt

Запуск:
    set TG_BOT_TOKEN=123456:AA...        (Windows)
    export TG_BOT_TOKEN=123456:AA...     (macOS/Linux)
    python tools/telegram_audio_bot.py --out audio

Нужны api_id / api_hash (как и для любого Telethon-приложения) —
получаются один раз на https://my.telegram.org. Если их нет, можно
использовать публичные тестовые значения Telethon (см. ниже DEFAULT_*),
но лучше свои.
"""

import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path

try:
    from telethon import TelegramClient, events
    from telethon.tl.types import (
        DocumentAttributeAudio,
        DocumentAttributeFilename,
    )
except ImportError:
    sys.exit(
        "Не установлена библиотека telethon.\n"
        "Установите её: pip install -r tools/requirements.txt"
    )

# Для запуска бота api_id/api_hash формально нужны, но при входе по токену
# Telegram их не проверяет строго. Можно подставить свои через переменные
# окружения TG_API_ID / TG_API_HASH.
DEFAULT_API_ID = 149467            # публичный пример из доков Telethon
DEFAULT_API_HASH = "f6dab3d6d47c5d4a59b9a2b9f29e57a9"


def sanitize_filename(name: str) -> str:
    name = name.strip()
    name = re.sub(r'[\\/:*?"<>|\n\r\t]+', " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name[:150] if name else "audio"


def audio_attributes(document):
    audio_attr = None
    file_name = None
    for attr in document.attributes:
        if isinstance(attr, DocumentAttributeAudio):
            audio_attr = attr
        elif isinstance(attr, DocumentAttributeFilename):
            file_name = attr.file_name
    return audio_attr, file_name


def build_title(audio_attr, file_name, message) -> str:
    if audio_attr is not None and not audio_attr.voice:
        title = (audio_attr.title or "").strip()
        performer = (audio_attr.performer or "").strip()
        if title and performer:
            return f"{performer} - {title}"
        if title:
            return title
    if file_name:
        return Path(file_name).stem
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


def parse_proxy(value):
    """Разбирает строку прокси из TG_PROXY / --proxy.

    Поддерживаются форматы:
        socks5://[user:pass@]host:port
        socks4://host:port
        http://[user:pass@]host:port
        mtproxy://host:port:secret     (MTProto-прокси Telegram)

    Возвращает (proxy, connection_cls) для TelegramClient или (None, None).
    """
    if not value:
        return None, None
    value = value.strip()

    if value.startswith("mtproxy://"):
        rest = value[len("mtproxy://"):]
        try:
            host, port, secret = rest.split(":")
        except ValueError:
            sys.exit("Неверный формат mtproxy. Нужно: mtproxy://host:port:secret")
        from telethon.network import ConnectionTcpMTProxyRandomizedIntermediate
        return (host, int(port), secret), ConnectionTcpMTProxyRandomizedIntermediate

    m = re.match(r"^(socks5|socks4|http)://(?:([^:@]+):([^@]+)@)?([^:]+):(\d+)$", value)
    if not m:
        sys.exit(
            "Неверный формат прокси. Примеры:\n"
            "  socks5://host:port\n"
            "  socks5://user:pass@host:port\n"
            "  mtproxy://host:port:secret"
        )
    scheme, user, password, host, port = m.groups()
    try:
        import python_socks  # noqa: F401
    except ImportError:
        sys.exit(
            "Для SOCKS/HTTP-прокси нужна библиотека python-socks:\n"
            "  pip install python-socks[asyncio]"
        )
    from python_socks import ProxyType
    ptype = {"socks5": ProxyType.SOCKS5, "socks4": ProxyType.SOCKS4,
             "http": ProxyType.HTTP}[scheme]
    proxy = {"proxy_type": ptype, "addr": host, "port": int(port)}
    if user:
        proxy["username"] = user
        proxy["password"] = password
    return proxy, None


def load_manifest(path: Path):
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return []
    return []


async def run(args):
    api_id = os.environ.get("TG_API_ID") or DEFAULT_API_ID
    api_hash = os.environ.get("TG_API_HASH") or DEFAULT_API_HASH
    bot_token = args.bot_token or os.environ.get("TG_BOT_TOKEN")
    if not bot_token:
        sys.exit(
            "Не задан токен бота.\n"
            "Передайте его через TG_BOT_TOKEN или --bot-token "
            "(получается у @BotFather)."
        )

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / "manifest.json"
    manifest = load_manifest(manifest_path)
    done_ids = {(item.get("chat_id"), item["message_id"]) for item in manifest}
    used_names = {item["file"] for item in manifest}

    proxy, connection_cls = parse_proxy(args.proxy or os.environ.get("TG_PROXY"))
    client_kwargs = {}
    if proxy is not None:
        client_kwargs["proxy"] = proxy
        print("Подключение через прокси.")
    if connection_cls is not None:
        client_kwargs["connection"] = connection_cls

    client = TelegramClient("tg_audio_bot_session", int(api_id), api_hash, **client_kwargs)
    await client.start(bot_token=bot_token)

    me = await client.get_me()
    print(f"Бот запущен: @{me.username}")
    print("Слушаю новые сообщения. Перешлите/отправьте аудио в канал, где бот — админ.")
    print("Остановить: Ctrl+C\n")

    async def handle(message):
        doc = getattr(message, "document", None)
        if not doc:
            return
        audio_attr, file_name = audio_attributes(doc)
        is_audio = audio_attr is not None or (
            doc.mime_type and doc.mime_type.startswith("audio")
        )
        if not is_audio:
            return

        key = (message.chat_id, message.id)
        if key in done_ids:
            return

        title = build_title(audio_attr, file_name, message)
        ext = guess_extension(file_name, audio_attr)
        base = sanitize_filename(title)
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
                "chat_id": message.chat_id,
                "message_id": message.id,
                "title": title,
                "file": candidate,
                "performer": getattr(audio_attr, "performer", None),
                "duration_sec": getattr(audio_attr, "duration", None),
                "date": message.date.isoformat() if message.date else None,
            }
        )
        done_ids.add(key)
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"  сохранено ({len(manifest)} всего)")

    @client.on(events.NewMessage())
    async def on_new(event):
        await handle(event.message)

    # каналы могут приходить как "channel post" — ловим и их
    @client.on(events.Album())
    async def on_album(event):
        for msg in event.messages:
            await handle(msg)

    await client.run_until_disconnected()


def parse_args():
    p = argparse.ArgumentParser(
        description="Скачивает аудио из Telegram-канала через бота (в реальном времени)."
    )
    p.add_argument("--out", default="audio", help="папка для сохранения (по умолчанию ./audio)")
    p.add_argument("--bot-token", dest="bot_token", help="токен бота (или TG_BOT_TOKEN)")
    p.add_argument(
        "--proxy",
        help="прокси (или TG_PROXY): socks5://host:port, socks5://user:pass@host:port, "
        "http://host:port, mtproxy://host:port:secret",
    )
    return p.parse_args()


if __name__ == "__main__":
    try:
        asyncio.run(run(parse_args()))
    except KeyboardInterrupt:
        print("\nОстановлено.")
