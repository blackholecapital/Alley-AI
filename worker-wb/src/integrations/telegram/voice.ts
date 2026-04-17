// Telegram voice-note intake + complete voice flow.
//
// Owns the voice-note golden path end to end. grammY-style intake resolves
// the Telegram file via getFile and downloads the audio bytes from the Bot
// API file server; a size/duration guard short-circuits oversized or
// unsupported payloads before any network cost is paid.
//
// The full voice flow composes fetch → transcribe → assistant → reply:
//
//   1. fetchTelegramVoiceAudio   (Telegram file API)
//   2. transcription provider    (single-provider abstraction, HTTP)
//   3. assistant pipeline        (shared generateAssistantReply, injected)
//   4. outbound reply            (sendTelegramMessage + recordOutbound)
//
// Stage 3 scope permits a text fallback if the spoken-audio reply is not
// stable enough for this stage, so every failure mode closes the loop with
// a readable text reply rather than a silent drop. The outbound reply is
// the same stable contract the text path uses, so /session/latest renders
// both text and voice turns in the same event trail.
//
// Ref: build-sheet-EXEC-AI-STAGE3-004 S3 (voice golden path).
//      build-sheet-EXEC-AI-STAGE2-003 S4 (voice intake baseline).

import type { InternalEvent, TelegramEnv, TelegramVoice } from './types';
import { sendTelegramMessage } from './outbound';
import { recordInbound, recordOutbound, recordUiInbound, getLatest } from '../../lib/session-store';
import { getTranscriptionProvider } from '../../providers/transcription';
import type { TranscriptionEnv } from '../../providers/transcription/provider';
import { validateTranscriptionEnv } from '../../lib/env';
import type { Logger } from '../../lib/logging';
import { errorResponse, jsonResponse } from '../../lib/errors';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

export const DEFAULT_MAX_VOICE_BYTES = 20 * 1024 * 1024;
export const DEFAULT_MAX_VOICE_DURATION_SECONDS = 120;

export interface VoiceAudio {
  audio: ArrayBuffer;
  mime_type: string;
  size: number;
  duration_seconds: number;
  source_file_id: string;
}

export type VoiceFetchFailureReason =
  | 'missing_token'
  | 'duration_too_long'
  | 'size_too_large'
  | 'getfile_network_error'
  | 'getfile_http_error'
  | 'getfile_non_json'
  | 'getfile_missing_path'
  | 'download_network_error'
  | 'download_http_error'
  | 'download_size_exceeded';

export type VoiceFetchResult =
  | { ok: true; audio: VoiceAudio }
  | { ok: false; reason: VoiceFetchFailureReason; detail: string; status?: number };

export interface FetchVoiceOptions {
  maxBytes?: number;
  maxDurationSeconds?: number;
}

interface TelegramFileMeta {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

interface GetFileResponse {
  ok: boolean;
  result?: TelegramFileMeta;
  description?: string;
}

export async function fetchTelegramVoiceAudio(
  botToken: string,
  voice: TelegramVoice,
  opts: FetchVoiceOptions = {},
): Promise<VoiceFetchResult> {
  if (!botToken) {
    return { ok: false, reason: 'missing_token', detail: 'telegram bot token not configured' };
  }

  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_VOICE_BYTES;
  const maxDuration = opts.maxDurationSeconds ?? DEFAULT_MAX_VOICE_DURATION_SECONDS;

  if (voice.duration > maxDuration) {
    return {
      ok: false,
      reason: 'duration_too_long',
      detail: `voice ${voice.duration}s exceeds max ${maxDuration}s`,
    };
  }

  if (typeof voice.file_size === 'number' && voice.file_size > maxBytes) {
    return {
      ok: false,
      reason: 'size_too_large',
      detail: `declared size ${voice.file_size} exceeds max ${maxBytes}`,
    };
  }

  const getFileUrl = `${TELEGRAM_API_BASE}/bot${botToken}/getFile?file_id=${encodeURIComponent(voice.file_id)}`;
  let metaResponse: Response;
  try {
    metaResponse = await fetch(getFileUrl, { method: 'GET' });
  } catch (err) {
    return {
      ok: false,
      reason: 'getfile_network_error',
      detail: err instanceof Error ? err.message : 'network error',
    };
  }

  if (!metaResponse.ok) {
    return {
      ok: false,
      reason: 'getfile_http_error',
      detail: `getFile returned ${metaResponse.status}`,
      status: metaResponse.status,
    };
  }

  let meta: GetFileResponse;
  try {
    meta = (await metaResponse.json()) as GetFileResponse;
  } catch {
    return { ok: false, reason: 'getfile_non_json', detail: 'getFile response was not json' };
  }

  if (!meta.ok || !meta.result?.file_path) {
    return {
      ok: false,
      reason: 'getfile_missing_path',
      detail: meta.description ?? 'telegram returned no file_path',
    };
  }

  if (typeof meta.result.file_size === 'number' && meta.result.file_size > maxBytes) {
    return {
      ok: false,
      reason: 'size_too_large',
      detail: `remote size ${meta.result.file_size} exceeds max ${maxBytes}`,
    };
  }

  const downloadUrl = `${TELEGRAM_API_BASE}/file/bot${botToken}/${meta.result.file_path}`;
  let fileResponse: Response;
  try {
    fileResponse = await fetch(downloadUrl);
  } catch (err) {
    return {
      ok: false,
      reason: 'download_network_error',
      detail: err instanceof Error ? err.message : 'network error',
    };
  }

  if (!fileResponse.ok) {
    return {
      ok: false,
      reason: 'download_http_error',
      detail: `download returned ${fileResponse.status}`,
      status: fileResponse.status,
    };
  }

  const audio = await fileResponse.arrayBuffer();
  if (audio.byteLength > maxBytes) {
    return {
      ok: false,
      reason: 'download_size_exceeded',
      detail: `downloaded ${audio.byteLength} exceeds max ${maxBytes}`,
    };
  }

  const mimeType =
    voice.mime_type ?? fileResponse.headers.get('content-type') ?? 'audio/ogg';

  return {
    ok: true,
    audio: {
      audio,
      mime_type: mimeType,
      size: audio.byteLength,
      duration_seconds: voice.duration,
      source_file_id: voice.file_id,
    },
  };
}

// ────────────────────────────────────────────────────────────────────
// Voice flow orchestrator
// ────────────────────────────────────────────────────────────────────

export type VoiceFlowEnv = TelegramEnv & TranscriptionEnv;

// Injected so voice.ts composes the same generateAssistantReply the text
// path uses — keeps "shared assistant pipeline" a real shared function
// rather than a voice-specific fork.
export type AssistantPipeline = (text: string) => string;

export interface VoiceFlowDeps {
  assistantPipeline: AssistantPipeline;
}

export type VoiceFlowStatus =
  | 'no_voice_payload'
  | 'fetch_failed'
  | 'transcription_env_invalid'
  | 'transcription_failed'
  | 'replied';

export interface VoiceFlowOutcome {
  status: VoiceFlowStatus;
  reply_text: string | null;
  transcript: string | null;
  provider: string | null;
}

const FETCH_FALLBACK_REPLY =
  "I couldn't pull that voice note from Telegram. Mind sending it again, or dropping a quick text?";
const TRANSCRIPTION_UNAVAILABLE_REPLY =
  "Voice transcription isn't configured for this environment yet — send me a quick text and I'll take it from there.";
const TRANSCRIPTION_FAILED_REPLY =
  "I heard the voice note but couldn't transcribe it cleanly. Want to try again or send it as text?";

async function deliverReply(
  event: InternalEvent,
  env: VoiceFlowEnv,
  logger: Logger,
  replyText: string,
): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN ?? '';
  const send = await sendTelegramMessage(token, event.chat_id, replyText, {
    replyToMessageId: event.message_id,
  });

  if (!send.ok) {
    logger.error('telegram.voice.send.failed', {
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

  logger.info('telegram.voice.send.ok', {
    event_id: event.id,
    chat_id: event.chat_id,
    reply_message_id: send.message_id,
    reply_length: replyText.length,
  });
}

export async function handleTelegramVoiceNote(
  event: InternalEvent,
  env: VoiceFlowEnv,
  logger: Logger,
  deps: VoiceFlowDeps,
): Promise<VoiceFlowOutcome> {
  const voice =
    event.raw.message?.voice ?? event.raw.edited_message?.voice ?? null;

  if (!voice) {
    logger.warn('telegram.voice.payload_missing', { event_id: event.id });
    return { status: 'no_voice_payload', reply_text: null, transcript: null, provider: null };
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
    await deliverReply(event, env, logger, FETCH_FALLBACK_REPLY);
    return {
      status: 'fetch_failed',
      reply_text: FETCH_FALLBACK_REPLY,
      transcript: null,
      provider: null,
    };
  }

  const transcriptionIssues = validateTranscriptionEnv(env);
  if (!transcriptionIssues.ok) {
    logger.error('env.transcription.invalid', { errors: transcriptionIssues.errors });
    await deliverReply(event, env, logger, TRANSCRIPTION_UNAVAILABLE_REPLY);
    return {
      status: 'transcription_env_invalid',
      reply_text: TRANSCRIPTION_UNAVAILABLE_REPLY,
      transcript: null,
      provider: null,
    };
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
    await deliverReply(event, env, logger, TRANSCRIPTION_FAILED_REPLY);
    return {
      status: 'transcription_failed',
      reply_text: TRANSCRIPTION_FAILED_REPLY,
      transcript: null,
      provider: transcript.provider,
    };
  }

  logger.info('transcription.ok', {
    event_id: event.id,
    provider: transcript.provider,
    text_length: transcript.text.length,
    duration_ms: transcript.duration_ms,
  });

  const transcribedEvent: InternalEvent = { ...event, text: transcript.text };
  recordInbound(transcribedEvent);

  const replyText = deps.assistantPipeline(transcript.text);
  logger.info('assistant.reply.generated', {
    event_id: event.id,
    kind: 'voice',
    reply_length: replyText.length,
  });

  await deliverReply(event, env, logger, replyText);

  return {
    status: 'replied',
    reply_text: replyText,
    transcript: transcript.text,
    provider: transcript.provider,
  };
}

// ────────────────────────────────────────────────────────────────────
// Browser voice capture handler — POST /voice/capture
// ────────────────────────────────────────────────────────────────────
//
// Receives multipart/form-data from the browser operator UI, validates
// the audio blob, and forwards it into the shared transcription pipeline.
// No reply handling: caller polls /session/latest for final state.
// Contract: /job_site/voice_capture_contract.txt (ENDPOINT CONTRACT)

const ACCEPTED_AUDIO_MIME_BASES = ['audio/webm', 'audio/ogg', 'audio/mp4'];

function isAcceptedAudioMime(type: string): boolean {
  const base = type.split(';')[0]!.trim().toLowerCase();
  return ACCEPTED_AUDIO_MIME_BASES.some((p) => base === p);
}

export async function handleVoiceCapture(
  request: Request,
  env: TranscriptionEnv,
  logger: Logger,
): Promise<Response> {
  if (request.method !== 'POST') {
    logger.warn('voice.capture.method_not_allowed', { method: request.method });
    return errorResponse('method_not_allowed', {
      message: 'POST required',
      correlationId: logger.correlationId,
    });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    logger.warn('voice.capture.parse_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('bad_request', {
      message: 'expected multipart/form-data with audio field',
      correlationId: logger.correlationId,
    });
  }

  const audioEntry = formData.get('audio');
  if (!audioEntry || typeof audioEntry === 'string') {
    logger.warn('voice.capture.missing_audio_field');
    return errorResponse('bad_request', {
      message: 'audio field required (must be a file blob)',
      correlationId: logger.correlationId,
    });
  }

  // FormDataEntryValue is string | File; the string branch is handled above.
  const audioFile = audioEntry as File;
  const mimeType = audioFile.type || 'audio/webm';
  if (!isAcceptedAudioMime(mimeType)) {
    logger.warn('voice.capture.unsupported_mime', { mime_type: mimeType });
    return errorResponse('bad_request', {
      message: `unsupported audio type: ${mimeType}`,
      correlationId: logger.correlationId,
      status: 415,
    });
  }

  if (audioFile.size === 0) {
    logger.warn('voice.capture.empty_audio');
    return errorResponse('bad_request', {
      message: 'audio file must not be empty',
      correlationId: logger.correlationId,
    });
  }

  if (audioFile.size > DEFAULT_MAX_VOICE_BYTES) {
    logger.warn('voice.capture.size_exceeded', {
      size: audioFile.size,
      max: DEFAULT_MAX_VOICE_BYTES,
    });
    return errorResponse('bad_request', {
      message: `audio exceeds ${DEFAULT_MAX_VOICE_BYTES} byte limit`,
      correlationId: logger.correlationId,
      status: 413,
    });
  }

  const sourceId = crypto.randomUUID();
  logger.info('voice.capture.received', {
    source_id: sourceId,
    mime_type: mimeType,
    size: audioFile.size,
  });

  const audio = await audioFile.arrayBuffer();
  const provider = getTranscriptionProvider(env);

  let transcriptText: string | null = null;
  if (provider.ready) {
    const result = await provider.transcribe({
      audio,
      mime_type: mimeType,
      source_id: sourceId,
    });

    if (result.ok) {
      transcriptText = result.text;
      logger.info('voice.capture.transcribed', {
        source_id: sourceId,
        provider: result.provider,
        text_length: result.text.length,
      });
    } else {
      logger.warn('voice.capture.transcription_failed', {
        source_id: sourceId,
        provider: result.provider,
        reason: result.reason,
      });
    }
  } else {
    logger.info('voice.capture.transcription_stub', {
      source_id: sourceId,
      provider: provider.name,
    });
  }

  recordUiInbound({
    text: transcriptText ?? `[voice: ${mimeType}, ${audioFile.size} bytes]`,
  });
  const sessionId = getLatest().session.session_id;

  logger.info('voice.capture.ok', { source_id: sourceId, session_id: sessionId });

  return jsonResponse(
    { ok: true, session_id: sessionId },
    { correlationId: logger.correlationId, headers: { 'cache-control': 'no-store' } },
  );
}
