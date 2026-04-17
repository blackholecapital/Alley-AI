// Telegram outbound sender — real Telegram Bot API implementation.
// POSTs to api.telegram.org/bot{token}/sendMessage and returns a typed
// TelegramSendResult so call sites can distinguish success, network errors,
// HTTP errors, and Telegram API refusals without throwing.
// Ref: build-sheet-EXEC-AI-STAGE4-001 S2.

import type { TelegramSendResult } from './types';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

interface SendMessageOptions {
  replyToMessageId?: number;
  disableNotification?: boolean;
}

interface TelegramApiResponse {
  ok: boolean;
  result?: { message_id: number };
  description?: string;
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  opts: SendMessageOptions = {},
): Promise<TelegramSendResult> {
  if (!botToken) {
    return { ok: false, status: 0, description: 'TELEGRAM_BOT_TOKEN not configured' };
  }

  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (opts.replyToMessageId !== undefined) {
    body['reply_to_message_id'] = opts.replyToMessageId;
  }
  if (opts.disableNotification) {
    body['disable_notification'] = true;
  }

  let response: Response;
  try {
    response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      description: err instanceof Error ? err.message : 'network error reaching Telegram API',
    };
  }

  let payload: TelegramApiResponse;
  try {
    payload = (await response.json()) as TelegramApiResponse;
  } catch {
    return {
      ok: false,
      status: response.status,
      description: `non-JSON response from Telegram (HTTP ${response.status})`,
    };
  }

  if (!payload.ok || !payload.result) {
    return {
      ok: false,
      status: response.status,
      description: payload.description ?? `Telegram returned ok=false (HTTP ${response.status})`,
    };
  }

  return { ok: true, message_id: payload.result.message_id };
}
