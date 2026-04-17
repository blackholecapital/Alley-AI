// Telegram webhook route handler.
// Validates env and the Telegram secret header, parses the Update into a
// normalized InternalEvent, records it in the shared session store,
// invokes the assistant pipeline to generate a reply, and records the
// outbound reply in-worker. Voice notes are promoted into the same
// pipeline via the configured transcription provider. The outbound path
// does NOT reach an external backend (no PROXY_BACKEND_URL fetch, no
// Telegram Bot API call) — the reply text is synthesized in-worker and
// recorded through recordOutbound so /session/latest closes the UI loop.
//
// Handler flow (grammY-style, shared assistant pipeline):
//   inbound parse -> recordInbound (session) -> generateAssistantReply
//                 -> sendTelegramMessage -> recordOutbound (session)
//
// Text messages now produce assistant replies by default rather than
// receipt-only acknowledgements.
//
// Response contract: this route ALWAYS returns HTTP 200 with the body
// {"ok": true} and content-type application/json to the caller (UI /
// Telegram). Internal validation, parse, and dispatch failures are logged
// but never surface as non-2xx responses — the caller must always see a
// clean 200 so it never treats a handled update as a retriable failure.
// Structured logs on every boundary preserve observability.
// Ref: build-sheet-EXEC-AI-STAGE3-004 S2 (reply-path polish for text).
//      build-sheet-EXEC-AI-STAGE2-003 S2 + S3 + S4 + S5 (baseline).

import { parseTelegramUpdate } from '../integrations/telegram/inbound';
import { sendTelegramMessage } from '../integrations/telegram/outbound';
import { fetchTelegramVoiceAudio } from '../integrations/telegram/voice';
import type {
  InternalEvent,
  TelegramEnv,
  TelegramUpdate,
} from '../integrations/telegram/types';
import { recordInbound, recordOutbound } from '../lib/session-store';
import { getTranscriptionProvider } from '../providers/transcription';
import type { TranscriptionEnv } from '../providers/transcription/provider';
import { validateTelegramEnv, validateTranscriptionEnv } from '../lib/env';
import type { Logger } from '../lib/logging';

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

export type TelegramWebhookEnv = TelegramEnv & TranscriptionEnv;

const REPLY_PREVIEW_LEN = 200;

// Shared assistant pipeline step: turn an inbound text into a real
// assistant-style reply. Deterministic, rule-based, no external LLM call
// — the Worker must close the loop without reaching a backend. Stage 3
// scope is "reply by default, not receipt-only", so every branch returns
// an assistant-voice response rather than an echo of the input.
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

function buildVoiceReply(transcript: string): string {
  const preview = transcript.slice(0, REPLY_PREVIEW_LEN);
  return `transcribed: ${preview}`;
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

async function handleVoiceEvent(
  event: InternalEvent,
  env: TelegramWebhookEnv,
  logger: Logger,
): Promise<void> {
  const voice = event.raw.message?.voice ?? event.raw.edited_message?.voice;
  if (!voice) {
    logger.warn('telegram.voice.payload_missing', { event_id: event.id });
    return;
  }

  const token = env.TELEGRAM_BOT_TOKEN ?? '';
  logger.info('telegram.voice.fetch.start', {
    event_id: event.id,
    file_id: voice.file_id,
    duration: voice.duration,
  });

  const fetched = await fetchTelegramVoiceAudio(token, voice);
  if (!fetched.ok) {
    logger.error('telegram.voice.fetch.failed', {
      event_id: event.id,
      reason: fetched.reason,
      detail: fetched.detail,
      status: fetched.status,
    });
    return;
  }

  const transcriptionIssues = validateTranscriptionEnv(env);
  if (!transcriptionIssues.ok) {
    logger.error('env.transcription.invalid', { errors: transcriptionIssues.errors });
    return;
  }

  const provider = getTranscriptionProvider(env);
  logger.info('transcription.start', {
    event_id: event.id,
    provider: provider.name,
    ready: provider.ready,
    bytes: fetched.audio.size,
  });

  const transcript = await provider.transcribe({
    audio: fetched.audio.audio,
    mime_type: fetched.audio.mime_type,
    duration_seconds: fetched.audio.duration_seconds,
    source_id: event.id,
  });

  if (!transcript.ok) {
    logger.error('transcription.failed', {
      event_id: event.id,
      provider: transcript.provider,
      reason: transcript.reason,
      retryable: transcript.retryable,
    });
    return;
  }

  logger.info('transcription.ok', {
    event_id: event.id,
    provider: transcript.provider,
    text_length: transcript.text.length,
    duration_ms: transcript.duration_ms,
  });

  const transcribedEvent: InternalEvent = {
    ...event,
    text: transcript.text,
  };
  recordInbound(transcribedEvent);

  await handleTextEvent(transcribedEvent, env, logger, buildVoiceReply(transcript.text));
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
    const replyText = generateAssistantReply(event.text);
    logger.info('assistant.reply.generated', {
      event_id: event.id,
      kind: event.kind,
      reply_length: replyText.length,
    });
    await handleTextEvent(event, env, logger, replyText);
    return;
  }

  if (event.kind === 'voice') {
    await handleVoiceEvent(event, env, logger);
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
