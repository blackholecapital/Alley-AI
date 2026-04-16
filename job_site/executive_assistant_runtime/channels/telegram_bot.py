"""
telegram_bot.py — EXEC-AI-RAPID-002 / S3.1

Telegram channel entry point.

Responsibilities:
  - Read bot token from environment (or use demo placeholder)
  - Instantiate aiogram Bot + Dispatcher
  - Wire handler router from telegram_handlers
  - Expose run() for polling and send_message() for direct sends

No assistant logic here. This file only owns the Telegram transport layer.
The AssistantCore is received from outside and passed into the handler router.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Token constants
# ---------------------------------------------------------------------------

TOKEN_ENV_VAR = "TELEGRAM_BOT_TOKEN"
DEMO_TOKEN = "0000000000:DEMO_MODE_TOKEN_PLACEHOLDER_DO_NOT_USE"


def _resolve_token(token: Optional[str]) -> str:
    """Return the token to use, with clear demo-mode logging."""
    if token:
        return token
    env_token = os.getenv(TOKEN_ENV_VAR, "").strip()
    if env_token:
        return env_token
    logger.warning(
        "No TELEGRAM_BOT_TOKEN set. Running in demo mode with placeholder token. "
        "Polling will not connect to Telegram."
    )
    return DEMO_TOKEN


# ---------------------------------------------------------------------------
# TelegramBot
# ---------------------------------------------------------------------------

class TelegramBot:
    """
    Wraps aiogram Bot + Dispatcher for the executive assistant Telegram channel.

    Usage (production):
        core = AssistantCore(demo_mode=False)
        bot = TelegramBot(core)
        asyncio.run(bot.run())

    Usage (demo / test):
        core = AssistantCore(demo_mode=True)
        bot = TelegramBot(core, token="demo")
        # Don't call run(); use bot.dp and bot.bot directly in tests.
    """

    def __init__(
        self,
        assistant_core,                    # AssistantCore — imported lazily to avoid cycles
        token: Optional[str] = None,
        demo_mode: bool = True,
    ) -> None:
        # Deferred import so aiogram is optional at import time
        # (allows tests to mock before import resolves)
        try:
            from aiogram import Bot, Dispatcher
            from aiogram.client.default import DefaultBotProperties
            from aiogram.enums import ParseMode
        except ImportError as exc:
            raise ImportError(
                "aiogram is required for the Telegram channel. "
                "Install it with: pip install aiogram"
            ) from exc

        from .telegram_handlers import build_router

        self.demo_mode = demo_mode
        self.core = assistant_core
        self._token = _resolve_token(token)

        self.bot = Bot(
            token=self._token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
        self.dp = Dispatcher()

        router = build_router(self.core)
        self.dp.include_router(router)

        logger.info(
            "TelegramBot initialized | demo_mode=%s token_source=%s",
            self.demo_mode,
            "arg" if token else ("env" if os.getenv(TOKEN_ENV_VAR) else "demo"),
        )

    # ------------------------------------------------------------------
    # Run
    # ------------------------------------------------------------------

    async def run(self) -> None:
        """
        Start long-polling. Blocks until interrupted.
        Safe to call with asyncio.run(bot.run()).
        """
        if self._token == DEMO_TOKEN:
            logger.warning(
                "TelegramBot.run() called in demo mode — "
                "polling will fail without a real token. Set TELEGRAM_BOT_TOKEN."
            )
        logger.info("TelegramBot: starting polling")
        try:
            await self.dp.start_polling(self.bot)
        finally:
            await self.bot.session.close()
            logger.info("TelegramBot: polling stopped")

    # ------------------------------------------------------------------
    # Convenience helpers
    # ------------------------------------------------------------------

    async def send_message(self, chat_id: int | str, text: str) -> None:
        """Send a plain-text message to a chat. HTML parse mode active."""
        await self.bot.send_message(chat_id=chat_id, text=text)

    async def close(self) -> None:
        """Close the bot session gracefully."""
        await self.bot.session.close()


# ---------------------------------------------------------------------------
# Module-level factory — used by one-command boot (start_all.sh / Makefile)
# ---------------------------------------------------------------------------

def create_bot(demo_mode: bool = True) -> TelegramBot:
    """
    Convenience factory that wires AssistantCore → TelegramBot.
    Importable without triggering aiogram at module load.
    """
    # Import here so the channels package doesn't force a core import at top-level
    import sys
    import os
    # Allow running from job_site root or repo root
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    from core.assistant_core import AssistantCore

    core = AssistantCore(demo_mode=demo_mode)
    return TelegramBot(core, demo_mode=demo_mode)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, stream=sys.stdout)
    bot = create_bot(demo_mode="--demo" in sys.argv)
    asyncio.run(bot.run())
