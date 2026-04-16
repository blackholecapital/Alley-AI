// Telegram webhook route handler.
// Validates the Telegram secret header, parses the Update into a normalized
// InternalEvent, and for text events produces one outbound Telegram reply
// through the shared outbound sender. Non-text events are accepted with 200
// so Telegram does not retry; they will be handled by later stages.
// Ref: build-sheet-EXEC-AI-STAGE2-003 S2.

import { parseTelegramUpdate } from '../integrations/telegram/inbound';
import { sendTelegramMessage } from '../integrations/telegram/outbound';
import type {
  InternalEvent,
  TelegramEnv,
  TelegramUpdate,
} from '../integrations/telegram/types';
import { recordInbound, recordOutbound } from '../lib/session-store';

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function buildTextReply(event: InternalEvent): string {
  const preview = (event.text ?? '').slice(0, 200);
  return `received: ${preview}`;
}

export async function handleTelegramWebhook(
  request: Request,
  env: TelegramEnv,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  // Telegram webhook secret verification. When secret is unset on the Worker,
  // reject all requests — unauthenticated webhook intake is never safe.
  const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET;
  const providedSecret = request.headers.get(SECRET_HEADER);
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response('forbidden', { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response('bad request', { status: 400 });
  }

  if (typeof update?.update_id !== 'number') {
    return new Response('bad request', { status: 400 });
  }

  const event = parseTelegramUpdate(update, new Date());
  if (!event) {
    return jsonResponse({ ok: true, handled: false, reason: 'no_message' });
  }

  recordInbound(event);

  if (event.kind !== 'text' || !event.text) {
    return jsonResponse({ ok: true, handled: false, reason: `kind:${event.kind}`, event_id: event.id });
  }

  const token = env.TELEGRAM_BOT_TOKEN ?? '';
  const replyText = buildTextReply(event);
  const send = await sendTelegramMessage(token, event.chat_id, replyText, {
    replyToMessageId: event.message_id,
  });

  if (!send.ok) {
    return jsonResponse(
      { ok: false, handled: true, event_id: event.id, error: send.description },
      502,
    );
  }

  recordOutbound({
    event_id: event.id,
    chat_id: event.chat_id,
    reply_to_message_id: event.message_id,
    sent_message_id: send.message_id,
    text: replyText,
  });

  return jsonResponse({
    ok: true,
    handled: true,
    event_id: event.id,
    reply_message_id: send.message_id,
  });
}
