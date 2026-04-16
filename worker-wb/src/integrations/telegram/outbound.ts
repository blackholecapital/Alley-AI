// Telegram outbound sender.
// Issues a sendMessage call against the Bot API. Returns a typed result so
// callers can render readable success/failure without throwing.
// Ref: build-sheet-EXEC-AI-STAGE2-003 S2.

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
  error_code?: number;
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  opts: SendMessageOptions = {},
): Promise<TelegramSendResult> {
  if (!botToken) {
    return { ok: false, status: 0, description: 'missing bot token' };
  }

  const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
  };
  if (opts.replyToMessageId !== undefined) body.reply_to_message_id = opts.replyToMessageId;
  if (opts.disableNotification !== undefined) body.disable_notification = opts.disableNotification;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      description: err instanceof Error ? err.message : 'network error',
    };
  }

  let payload: TelegramApiResponse | null = null;
  try {
    payload = (await response.json()) as TelegramApiResponse;
  } catch {
    return {
      ok: false,
      status: response.status,
      description: 'non-json response from telegram',
    };
  }

  if (!response.ok || !payload.ok || !payload.result) {
    return {
      ok: false,
      status: response.status,
      description: payload.description ?? `telegram send failed (${response.status})`,
    };
  }

  return { ok: true, message_id: payload.result.message_id };
}
