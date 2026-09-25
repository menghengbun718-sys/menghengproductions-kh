import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

BOT_TOKEN = (os.getenv("TELEGRAM_BOT_TOKEN") or "8699783220:AAHBByYqDpHbSLn16X22FJqdqwZe4vhXJb8").strip()
CHAT_ID = (os.getenv("TELEGRAM_CHAT_ID") or "8651941543").strip()


def cambodia_now() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=7)


def send_telegram_message(message: str) -> bool:
    if not BOT_TOKEN or BOT_TOKEN in {"BOT TOKEN", "PASTE_BOT_TOKEN_HERE"}:
        print("Telegram bot token is missing or invalid.")
        return False

    if not CHAT_ID:
        print("Telegram chat ID is missing. Set TELEGRAM_CHAT_ID or edit the file.")
        return False

    payload = json.dumps({
        "chat_id": CHAT_ID,
        "text": message,
        "disable_web_page_preview": True,
    }).encode("utf-8")

    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    request = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            print(response.read().decode("utf-8"))
            return True
    except urllib.error.HTTPError as exc:
        print(f"Telegram HTTP error: {exc.code} {exc.read().decode('utf-8', errors='ignore')}")
        return False
    except Exception as exc:
        print(f"Telegram request error: {exc}")
        return False


if __name__ == "__main__":
    text = "MengHeng Productions log started at " + cambodia_now().strftime("%Y-%m-%d %H:%M:%S ICT")
    send_telegram_message(text)
