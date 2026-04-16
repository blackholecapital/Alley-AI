// Telegram webhook route handler.
// Validates env and the Telegram secret header, parses the Update into a
// normalized InternalEvent, records it in the shared session store, and
// produces one outbound reply in-worker. Voice notes are promoted into the
// text pipeline via the configured transcription provider. The outbound
// path does NOT reach an external backend (no PROXY_BACKEND_URL fetch, no
// Telegram Bot API call) — the reply text is synthesized in-worker and
// recorded through recordOutbound so /session/latest closes the UI loop.
// Every response carries a correlation_id and structured logs are emitted
// at each boundary.
// Ref: build-sheet-EXEC-AI-STAGE2-003 S2 + S3 + S4 + S5.

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
import { errorResponse, jsonResponse } from '../lib/errors';
import type { Logger } from '../lib/logging';

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

export type TelegramWebhookEnv = TelegramEnv & TranscriptionEnv;

function buildTextReply(text: string): string {
  const preview = text.slice(0, 200);
  return `received: ${preview}`;
}

function buildVoiceReply(transcript: string): string {
  const preview = transcript.slice(0, 200);
  return `transcribed: ${preview}`;
}

async function handleTextEvent(
  event: InternalEvent,
  env: TelegramWebhookEnv,
  logger: Logger,
  replyText: string,
): Promise<Response> {
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
    return errorResponse('upstream_error', {
      message: 'telegram sendMessage failed',
      detail: send.description,
      correlationId: logger.correlationId,
      extra: { event_id: event.id, stage: 'telegram_send', status: send.status },
    });
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

  return jsonResponse(
    {
      ok: true,
      handled: true,
      event_id: event.id,
      reply_message_id: send.message_id,
    },
    { correlationId: logger.correlationId },
  );
}

async function handleVoiceEvent(
  event: InternalEvent,
  env: TelegramWebhookEnv,
  logger: Logger,
): Promise<Response> {
  const voice = event.raw.message?.voice ?? event.raw.edited_message?.voice;
  if (!voice) {
    logger.warn('telegram.voice.payload_missing', { event_id: event.id });
    return errorResponse('bad_request', {
      message: 'voice payload missing from update',
      correlationId: logger.correlationId,
      extra: { event_id: event.id },
    });
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
    return errorResponse('upstream_error', {
      message: 'telegram voice fetch failed',
      detail: fetched.detail,
      correlationId: logger.correlationId,
      extra: { event_id: event.id, stage: 'voice_fetch', reason: fetched.reason },
    });
  }

  const transcriptionIssues = validateTranscriptionEnv(env);
  if (!transcriptionIssues.ok) {
    logger.error('env.transcription.invalid', { errors: transcriptionIssues.errors });
    return errorResponse('config_error', {
      message: 'transcription provider is not configured correctly',
      detail: transcriptionIssues.errors.map((e) => `${e.key}: ${e.message}`),
      correlationId: logger.correlationId,
      extra: { event_id: event.id, stage: 'transcription_config' },
    });
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
    return errorResponse('upstream_error', {
      message: 'transcription failed',
      detail: transcript.reason,
      correlationId: logger.correlationId,
      extra: {
        event_id: event.id,
        stage: 'transcription',
        provider: transcript.provider,
        retryable: transcript.retryable,
      },
    });
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

  return handleTextEvent(transcribedEvent, env, logger, buildVoiceReply(transcript.text));
}

export async function handleTelegramWebhook(
  request: Request,
  env: TelegramWebhookEnv,
  logger: Logger,
): Promise<Response> {
  if (request.method !== 'POST') {
    logger.warn('telegram.webhook.method_not_allowed', { method: request.method });
    return errorResponse('method_not_allowed', {
      message: 'POST required',
      correlationId: logger.correlationId,
    });
  }

  const telegramIssues = validateTelegramEnv(env);
  if (!telegramIssues.ok) {
    logger.error('env.telegram.invalid', { errors: telegramIssues.errors });
    return errorResponse('config_error', {
      message: 'telegram environment is not configured',
      detail: telegramIssues.errors.map((e) => `${e.key}: ${e.message}`),
      correlationId: logger.correlationId,
    });
  }

  const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET!;
  const providedSecret = request.headers.get(SECRET_HEADER);
  if (providedSecret !== expectedSecret) {
    logger.warn('telegram.webhook.secret_mismatch');
    return errorResponse('forbidden', {
      message: 'webhook secret header invalid',
      correlationId: logger.correlationId,
    });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    logger.warn('telegram.webhook.bad_json');
    return errorResponse('bad_request', {
      message: 'request body was not valid json',
      correlationId: logger.correlationId,
    });
  }

  if (typeof update?.update_id !== 'number') {
    logger.warn('telegram.webhook.bad_update_shape');
    return errorResponse('bad_request', {
      message: 'telegram update shape invalid',
      correlationId: logger.correlationId,
    });
  }

  const event = parseTelegramUpdate(update, new Date());
  if (!event) {
    logger.info('telegram.webhook.no_message', { update_id: update.update_id });
    return jsonResponse(
      { ok: true, handled: false, reason: 'no_message' },
      { correlationId: logger.correlationId },
    );
  }

  recordInbound(event);
  logger.info('telegram.inbound', {
    event_id: event.id,
    kind: event.kind,
    chat_id: event.chat_id,
    has_text: event.text !== null,
  });

  if (event.kind === 'text' && event.text) {
    return handleTextEvent(event, env, logger, buildTextReply(event.text));
  }

  if (event.kind === 'voice') {
    return handleVoiceEvent(event, env, logger);
  }

  logger.info('telegram.webhook.unhandled_kind', { event_id: event.id, kind: event.kind });
  return jsonResponse(
    { ok: true, handled: false, reason: `kind:${event.kind}`, event_id: event.id },
    { correlationId: logger.correlationId },
  );
}
