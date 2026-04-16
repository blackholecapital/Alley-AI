// Telegram webhook route handler.
// Validates the Telegram secret header, parses the Update into a normalized
// InternalEvent, records it in the shared session store, and produces one
// outbound Telegram reply. Voice notes are promoted into the text pipeline
// via the configured transcription provider.
// Ref: build-sheet-EXEC-AI-STAGE2-003 S2 + S3 + S4.

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

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

export type TelegramWebhookEnv = TelegramEnv & TranscriptionEnv;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

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
  replyText: string,
): Promise<Response> {
  const token = env.TELEGRAM_BOT_TOKEN ?? '';
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

async function handleVoiceEvent(
  event: InternalEvent,
  env: TelegramWebhookEnv,
): Promise<Response> {
  const voice = event.raw.message?.voice ?? event.raw.edited_message?.voice;
  if (!voice) {
    return jsonResponse(
      { ok: false, handled: false, event_id: event.id, reason: 'voice_payload_missing' },
      400,
    );
  }

  const token = env.TELEGRAM_BOT_TOKEN ?? '';
  const fetched = await fetchTelegramVoiceAudio(token, voice);
  if (!fetched.ok) {
    return jsonResponse(
      {
        ok: false,
        handled: true,
        event_id: event.id,
        stage: 'voice_fetch',
        reason: fetched.reason,
        detail: fetched.detail,
      },
      502,
    );
  }

  const provider = getTranscriptionProvider(env);
  const transcript = await provider.transcribe({
    audio: fetched.audio.audio,
    mime_type: fetched.audio.mime_type,
    duration_seconds: fetched.audio.duration_seconds,
    source_id: event.id,
  });

  if (!transcript.ok) {
    return jsonResponse(
      {
        ok: false,
        handled: true,
        event_id: event.id,
        stage: 'transcription',
        provider: transcript.provider,
        reason: transcript.reason,
        retryable: transcript.retryable,
      },
      502,
    );
  }

  const transcribedEvent: InternalEvent = {
    ...event,
    text: transcript.text,
  };
  recordInbound(transcribedEvent);

  return handleTextEvent(transcribedEvent, env, buildVoiceReply(transcript.text));
}

export async function handleTelegramWebhook(
  request: Request,
  env: TelegramWebhookEnv,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

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

  if (event.kind === 'text' && event.text) {
    return handleTextEvent(event, env, buildTextReply(event.text));
  }

  if (event.kind === 'voice') {
    return handleVoiceEvent(event, env);
  }

  return jsonResponse({
    ok: true,
    handled: false,
    reason: `kind:${event.kind}`,
    event_id: event.id,
  });
}
