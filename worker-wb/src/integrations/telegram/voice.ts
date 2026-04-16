// Telegram voice-note intake.
// Resolves the Telegram file path via getFile and downloads audio bytes via
// the Bot API file server. Enforces duration and size guards so oversized or
// out-of-scope payloads fail readably before transcription is attempted.
// Ref: build-sheet-EXEC-AI-STAGE2-003 S4.

import type { TelegramVoice } from './types';

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
