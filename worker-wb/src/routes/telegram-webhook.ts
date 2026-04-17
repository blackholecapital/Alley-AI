// Telegram webhook route handler.
// Validates env and the Telegram secret header, parses the Update into a
// normalized InternalEvent, records it in the shared session store, and
// dispatches to the shared assistant pipeline so both text and voice
// produce assistant-voice replies by default.
//
// Voice updates are handed to handleTelegramVoiceNote, which owns the
// complete voice golden path:
//   inbound parse -> recordInbound -> fetchTelegramVoiceAudio
//                 -> transcription provider -> generateAssistantReply
//                 -> sendTelegramMessage -> recordOutbound
//
// Response contract: this route ALWAYS returns HTTP 200 with the body
// {"ok": true} and content-type application/json to the caller (UI /
// Telegram). Internal validation, parse, and dispatch failures are logged
// but never surface as non-2xx responses — the caller must always see a
// clean 200 so it never treats a handled update as a retriable failure.
// Structured logs on every boundary preserve observability.
//
// Ref: build-sheet-EXEC-AI-STAGE4-001 S2 (live text completion + failure states),
//      build-sheet-EXEC-AI-STAGE3-004 S3 (voice golden path),
//      build-sheet-EXEC-AI-STAGE2-003 S2 + S3 + S4 + S5 (baseline).

import { parseTelegramUpdate } from '../integrations/telegram/inbound';
import { sendTelegramMessage } from '../integrations/telegram/outbound';
import { handleTelegramVoiceNote } from '../integrations/telegram/voice';
import type {
  InternalEvent,
  TelegramEnv,
  TelegramUpdate,
} from '../integrations/telegram/types';
import { recordInbound, recordOutbound, recordFailure } from '../lib/session-store';
import type { TranscriptionEnv } from '../providers/transcription/provider';
import { validateTelegramEnv } from '../lib/env';
import type { Logger } from '../lib/logging';

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

export type TelegramWebhookEnv = TelegramEnv & TranscriptionEnv;

const REPLY_PREVIEW_LEN = 200;

// Shared assistant pipeline step: turn an inbound text into a real
// assistant-style reply. Deterministic, rule-based, no external LLM call
// — the Worker must close the loop without reaching a backend. Stage 3
// scope is "reply by default, not receipt-only", so every branch returns
// an assistant-voice response rather than an echo of the input. The voice
// golden path reuses this same function so text and voice share one
// pipeline.
export function generateAssistantReply(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return "I didn't catch any text in that message. Send it again and I'll take a look.";
  }

  const lower = trimmed.toLowerCase();
  const preview = trimmed.slice(0, REPLY_PREVIEW_LEN);

  if (/^(hi|hello|hey|yo|howdy|greetings)\b/.test(lower)) {
    return "Hi — assistant here. What would you like me to work on?";
  }
  if (/^(thanks|thank you|ty|appreciate it)\b/.test(lower)) {
    return "You're welcome. Ping me again whenever you're ready for the next one.";
  }
  if (/^\/(start|help)\b/.test(lower)) {
    return 'I can take quick notes and check your calendar. Try: "what\'s on today?" or send a voice note.';
  }
  if (trimmed.endsWith('?')) {
    return `Noted your question: "${preview}". I'll line up an answer and follow up in this chat.`;
  }

  return `Got it — "${preview}". Want me to note it, schedule it, or wait for more detail?`;
}

async function handleTextEvent(
  event: InternalEvent,
  env: TelegramWebhookEnv,
  logger: Logger,
  replyText: string,
): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN ?? '';
  logger.debug('telegram.send.start', { chat_id: event.chat_id, event_id: event.id });

  const send = await sendTelegramMessage(token, event.chat_id, replyText, {
    replyToMessageId: event.message_id,
  });

  if (!send.ok) {
    logger.error('telegram.send.failed', {
      event_id: event.id,
      chat_id: event.chat_id,
      status: send.status,
      reason: send.description,
    });
    recordFailure({
      event_id: event.id,
      chat_id: event.chat_id,
      failure_code: 'send_failed',
      failure_message: send.description,
    });
    return;
  }

  recordOutbound({
    event_id: event.id,
    chat_id: event.chat_id,
    reply_to_message_id: event.message_id,
    sent_message_id: send.message_id,
    text: replyText,
  });

  logger.info('telegram.send.ok', {
    event_id: event.id,
    chat_id: event.chat_id,
    reply_message_id: send.message_id,
  });
}

async function processTelegramUpdate(
  request: Request,
  env: TelegramWebhookEnv,
  logger: Logger,
): Promise<void> {
  if (request.method !== 'POST') {
    logger.warn('telegram.webhook.method_not_allowed', { method: request.method });
    return;
  }

  const telegramIssues = validateTelegramEnv(env);
  if (!telegramIssues.ok) {
    logger.error('env.telegram.invalid', { errors: telegramIssues.errors });
    return;
  }

  const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET!;
  const providedSecret = request.headers.get(SECRET_HEADER);
  if (providedSecret !== expectedSecret) {
    logger.warn('telegram.webhook.secret_mismatch');
    return;
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    logger.warn('telegram.webhook.bad_json');
    return;
  }

  if (typeof update?.update_id !== 'number') {
    logger.warn('telegram.webhook.bad_update_shape');
    return;
  }

  const event = parseTelegramUpdate(update, new Date());
  if (!event) {
    logger.info('telegram.webhook.no_message', { update_id: update.update_id });
    return;
  }

  recordInbound(event);
  logger.info('telegram.inbound', {
    event_id: event.id,
    kind: event.kind,
    chat_id: event.chat_id,
    has_text: event.text !== null,
  });

  if (event.kind === 'text' && event.text) {
    let replyText: string;
    try {
      replyText = generateAssistantReply(event.text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('assistant.reply.error', { event_id: event.id, error: msg });
      recordFailure({
        event_id: event.id,
        chat_id: event.chat_id,
        failure_code: 'reply_generation_error',
        failure_message: msg,
      });
      return;
    }
    logger.info('assistant.reply.generated', {
      event_id: event.id,
      kind: event.kind,
      reply_length: replyText.length,
    });
    await handleTextEvent(event, env, logger, replyText);
    return;
  }

  if (event.kind === 'voice') {
    const outcome = await handleTelegramVoiceNote(event, env, logger, {
      assistantPipeline: generateAssistantReply,
    });
    logger.info('telegram.voice.flow.outcome', {
      event_id: event.id,
      status: outcome.status,
      provider: outcome.provider,
      has_transcript: outcome.transcript !== null,
      reply_length: outcome.reply_text?.length ?? 0,
    });
    return;
  }

  logger.info('telegram.webhook.unhandled_kind', { event_id: event.id, kind: event.kind });
}

export async function handleTelegramWebhook(
  request: Request,
  env: TelegramWebhookEnv,
  logger: Logger,
): Promise<Response> {
  try {
    await processTelegramUpdate(request, env, logger);
  } catch (err) {
    logger.error('telegram.webhook.unhandled_error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
