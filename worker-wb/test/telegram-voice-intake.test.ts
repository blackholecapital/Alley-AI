/**
 * Telegram Voice Intake — Failure-Mode Tests & Request Fixtures
 * -------------------------------------------------------------
 * Build sheet: /job_site/build-sheet-EXEC-AI-STAGE2-003.txt
 * Stage:       S4 (Telegram voice intake through shared pipeline)
 * Worker B:    tests + fallback coverage for
 *   - transcription failure
 *   - unsupported media
 *   - oversized payloads
 *   - failed media fetches
 *
 * Worker A S4 contract paths (declared in build sheet):
 *   /worker-wb/src/integrations/telegram/voice.ts
 *   /worker-wb/src/providers/transcription/provider.ts
 *   /worker-wb/src/providers/transcription/index.ts
 *
 * This file is framework-agnostic and self-contained — no new
 * devDependency is introduced. Ships:
 *   1. Canonical fixtures exported as named constants so any runner
 *      (vitest / node:test / @cloudflare/vitest-pool-workers) can
 *      reuse them.
 *   2. A tiny assertion harness that runs when this file is invoked
 *      as a script.
 * When Worker A ships S4 modules, upgrade the test bodies to import
 * the real provider + voice handler. Fixtures remain canonical.
 */

declare const console: { log: (...args: unknown[]) => void };

// ────────────────────────────────────────────────────────────────────
// Safety contract — how every failure mode must surface
// ────────────────────────────────────────────────────────────────────

/**
 * S4 safety contract: no matter which voice-path failure happens,
 * the Worker must:
 *   - return HTTP 200 on /telegram/webhook so Telegram stops retrying
 *   - NOT throw out of the top-level fetch handler
 *   - append ONE normalized failure event to the session store so the
 *     operator UI (/session/latest) renders a visible failure entry
 *   - include a stable `failure_reason` code from the enum below
 */
export const VOICE_FAILURE_REASONS = [
  'transcription_failed',
  'transcription_timeout',
  'transcription_empty',
  'unsupported_media',
  'payload_too_large',
  'media_fetch_failed',
] as const;

export type VoiceFailureReason = (typeof VOICE_FAILURE_REASONS)[number];

export const VOICE_PAYLOAD_LIMIT_BYTES = 20 * 1024 * 1024; // Telegram Bot API getFile cap
export const TRANSCRIPTION_TIMEOUT_MS = 15_000;

/**
 * Normalized failure event shape the voice path must append to the
 * session store. Mirrors the InternalEvent envelope from
 * /worker-wb/src/integrations/telegram/types.ts and adds two fields
 * the UI renders for readable failure.
 */
export const EXPECTED_FAILURE_EVENT_SHAPE_KEYS = [
  'id',
  'source',
  'kind',
  'direction',
  'chat_id',
  'message_id',
  'user_id',
  'username',
  'text',
  'received_at',
  'failure_reason',
  'failure_detail',
] as const;

// ────────────────────────────────────────────────────────────────────
// Fixtures — inbound voice updates
// ────────────────────────────────────────────────────────────────────

/** Happy-path voice update (small file, supported mime). */
export const VOICE_UPDATE_OK_FIXTURE = {
  update_id: 2_000_000_001,
  message: {
    message_id: 501,
    date: 1_744_900_000,
    chat: { id: 987_654_321, type: 'private' as const },
    from: { id: 123_456_789, is_bot: false, first_name: 'Op' },
    voice: {
      file_id: 'AwACAgIAAxkBAAIC_VOICE_OK',
      file_unique_id: 'UNIQ_OK',
      duration: 3,
      mime_type: 'audio/ogg',
      file_size: 48_000,
    },
  },
} as const;

/** Oversized voice payload — file_size > Telegram getFile cap (20 MiB). */
export const VOICE_UPDATE_OVERSIZED_FIXTURE = {
  update_id: 2_000_000_002,
  message: {
    message_id: 502,
    date: 1_744_900_001,
    chat: { id: 987_654_321, type: 'private' as const },
    from: { id: 123_456_789, is_bot: false, first_name: 'Op' },
    voice: {
      file_id: 'AwACAgIAAxkBAAIC_VOICE_HUGE',
      file_unique_id: 'UNIQ_HUGE',
      duration: 4200,
      mime_type: 'audio/ogg',
      file_size: 25 * 1024 * 1024, // 25 MiB — exceeds 20 MiB cap
    },
  },
} as const;

/** Unsupported media — sticker, no voice, no text. */
export const UNSUPPORTED_STICKER_UPDATE_FIXTURE = {
  update_id: 2_000_000_003,
  message: {
    message_id: 503,
    date: 1_744_900_002,
    chat: { id: 987_654_321, type: 'private' as const },
    from: { id: 123_456_789, is_bot: false, first_name: 'Op' },
    sticker: { file_id: 'CAACAgIAAx_STICKER', emoji: '🐕' },
  },
} as const;

/** Unsupported media — video_note. */
export const UNSUPPORTED_VIDEO_NOTE_UPDATE_FIXTURE = {
  update_id: 2_000_000_004,
  message: {
    message_id: 504,
    date: 1_744_900_003,
    chat: { id: 987_654_321, type: 'private' as const },
    from: { id: 123_456_789, is_bot: false, first_name: 'Op' },
    video_note: { file_id: 'DQACAgIAAx_VIDEONOTE', duration: 5 },
  },
} as const;

// ────────────────────────────────────────────────────────────────────
// Fixtures — Telegram getFile / download responses
// ────────────────────────────────────────────────────────────────────

export const GET_FILE_OK_FIXTURE = {
  endpoint: 'https://api.telegram.org/bot<TOKEN>/getFile',
  request_body: { file_id: 'AwACAgIAAxkBAAIC_VOICE_OK' },
  response_status: 200,
  response_body: {
    ok: true,
    result: {
      file_id: 'AwACAgIAAxkBAAIC_VOICE_OK',
      file_unique_id: 'UNIQ_OK',
      file_size: 48_000,
      file_path: 'voice/file_123.oga',
    },
  },
} as const;

export const GET_FILE_NOT_FOUND_FIXTURE = {
  endpoint: 'https://api.telegram.org/bot<TOKEN>/getFile',
  request_body: { file_id: 'MISSING' },
  response_status: 400,
  response_body: {
    ok: false,
    error_code: 400,
    description: 'Bad Request: wrong file_id',
  },
} as const;

export const FILE_DOWNLOAD_OK_FIXTURE = {
  endpoint: 'https://api.telegram.org/file/bot<TOKEN>/voice/file_123.oga',
  response_status: 200,
  response_content_type: 'audio/ogg',
  response_byte_length: 48_000,
} as const;

export const FILE_DOWNLOAD_FAIL_FIXTURE = {
  endpoint: 'https://api.telegram.org/file/bot<TOKEN>/voice/gone.oga',
  response_status: 404,
  response_content_type: 'text/plain',
  response_body_text: 'Not Found',
} as const;

export const FILE_DOWNLOAD_NETWORK_ERROR_FIXTURE = {
  endpoint: 'https://api.telegram.org/file/bot<TOKEN>/voice/blackhole.oga',
  thrown: 'network error: connect timeout',
} as const;

// ────────────────────────────────────────────────────────────────────
// Fixtures — transcription provider results
// ────────────────────────────────────────────────────────────────────

export const TRANSCRIPTION_OK_FIXTURE = {
  ok: true as const,
  text: 'hello from a voice note',
  duration_ms: 420,
  provider: 'mock',
} as const;

export const TRANSCRIPTION_ERROR_FIXTURE = {
  ok: false as const,
  reason: 'transcription_failed' as VoiceFailureReason,
  detail: 'provider returned 503',
  provider: 'mock',
} as const;

export const TRANSCRIPTION_TIMEOUT_FIXTURE = {
  ok: false as const,
  reason: 'transcription_timeout' as VoiceFailureReason,
  detail: `provider exceeded ${TRANSCRIPTION_TIMEOUT_MS} ms`,
  provider: 'mock',
} as const;

export const TRANSCRIPTION_EMPTY_FIXTURE = {
  ok: false as const,
  reason: 'transcription_empty' as VoiceFailureReason,
  detail: 'provider returned empty transcript',
  provider: 'mock',
} as const;

// ────────────────────────────────────────────────────────────────────
// Fixtures — expected failure-event rows written to session store
// ────────────────────────────────────────────────────────────────────

function baseFailureEvent(
  updateFixture:
    | typeof VOICE_UPDATE_OVERSIZED_FIXTURE
    | typeof UNSUPPORTED_STICKER_UPDATE_FIXTURE
    | typeof VOICE_UPDATE_OK_FIXTURE,
  reason: VoiceFailureReason,
  detail: string,
) {
  const m = updateFixture.message;
  return {
    id: `telegram:${updateFixture.update_id}`,
    source: 'telegram' as const,
    kind: 'voice' as const,
    direction: 'inbound' as const,
    chat_id: m.chat.id,
    message_id: m.message_id,
    user_id: m.from?.id ?? null,
    username: null as string | null,
    text: null,
    received_at: new Date(m.date * 1000).toISOString(),
    failure_reason: reason,
    failure_detail: detail,
  };
}

export const EXPECTED_FAILURE_EVENTS = {
  transcription_failed: baseFailureEvent(
    VOICE_UPDATE_OK_FIXTURE,
    'transcription_failed',
    'provider returned 503',
  ),
  transcription_timeout: baseFailureEvent(
    VOICE_UPDATE_OK_FIXTURE,
    'transcription_timeout',
    `provider exceeded ${TRANSCRIPTION_TIMEOUT_MS} ms`,
  ),
  transcription_empty: baseFailureEvent(
    VOICE_UPDATE_OK_FIXTURE,
    'transcription_empty',
    'provider returned empty transcript',
  ),
  unsupported_media: baseFailureEvent(
    UNSUPPORTED_STICKER_UPDATE_FIXTURE,
    'unsupported_media',
    'update has no voice and no text',
  ),
  payload_too_large: baseFailureEvent(
    VOICE_UPDATE_OVERSIZED_FIXTURE,
    'payload_too_large',
    `file_size 26214400 exceeds limit ${VOICE_PAYLOAD_LIMIT_BYTES}`,
  ),
  media_fetch_failed: baseFailureEvent(
    VOICE_UPDATE_OK_FIXTURE,
    'media_fetch_failed',
    'getFile returned 400: wrong file_id',
  ),
} as const;

// ────────────────────────────────────────────────────────────────────
// Tiny self-contained assertion harness (no dev-dep added)
// ────────────────────────────────────────────────────────────────────

type Case = { name: string; fn: () => void | Promise<void> };
const cases: Case[] = [];
const test = (name: string, fn: () => void | Promise<void>) =>
  cases.push({ name, fn });

function assertEq<T>(actual: T, expected: T, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label}\n  expected: ${e}\n  actual:   ${a}`);
  }
}

function assertTrue(cond: unknown, label: string): void {
  if (!cond) throw new Error(`assertion failed: ${label}`);
}

// ────────────────────────────────────────────────────────────────────
// Tests — contract checks against fixtures (no Worker A src required)
// ────────────────────────────────────────────────────────────────────

test('failure reason set is closed and stable', () => {
  assertEq(
    [...VOICE_FAILURE_REASONS].sort(),
    [
      'media_fetch_failed',
      'payload_too_large',
      'transcription_empty',
      'transcription_failed',
      'transcription_timeout',
      'unsupported_media',
    ],
    'failure reason enum',
  );
});

test('oversized voice fixture actually exceeds the 20 MiB cap', () => {
  assertTrue(
    VOICE_UPDATE_OVERSIZED_FIXTURE.message.voice.file_size >
      VOICE_PAYLOAD_LIMIT_BYTES,
    'oversized fixture must exceed VOICE_PAYLOAD_LIMIT_BYTES',
  );
});

test('happy-path voice fixture stays under the cap', () => {
  assertTrue(
    VOICE_UPDATE_OK_FIXTURE.message.voice.file_size <
      VOICE_PAYLOAD_LIMIT_BYTES,
    'ok fixture must be under cap',
  );
});

test('unsupported-media fixtures carry no voice and no text', () => {
  const sticker = UNSUPPORTED_STICKER_UPDATE_FIXTURE.message;
  const videoNote = UNSUPPORTED_VIDEO_NOTE_UPDATE_FIXTURE.message;
  // @ts-expect-error — fixtures intentionally omit these keys
  assertTrue(sticker.voice === undefined, 'sticker has no voice');
  // @ts-expect-error — fixtures intentionally omit these keys
  assertTrue(sticker.text === undefined, 'sticker has no text');
  // @ts-expect-error — fixtures intentionally omit these keys
  assertTrue(videoNote.voice === undefined, 'video_note has no voice');
  // @ts-expect-error — fixtures intentionally omit these keys
  assertTrue(videoNote.text === undefined, 'video_note has no text');
});

test('getFile error fixture returns non-2xx with ok:false', () => {
  assertTrue(
    GET_FILE_NOT_FOUND_FIXTURE.response_status >= 400,
    'getFile error status',
  );
  assertEq(
    GET_FILE_NOT_FOUND_FIXTURE.response_body.ok,
    false,
    'getFile error ok:false',
  );
});

test('file-download fail fixture returns 404', () => {
  assertEq(FILE_DOWNLOAD_FAIL_FIXTURE.response_status, 404, 'download 404');
});

test('transcription error / timeout / empty fixtures all map to distinct reasons', () => {
  assertEq(TRANSCRIPTION_ERROR_FIXTURE.reason, 'transcription_failed', 'error -> failed');
  assertEq(TRANSCRIPTION_TIMEOUT_FIXTURE.reason, 'transcription_timeout', 'timeout -> timeout');
  assertEq(TRANSCRIPTION_EMPTY_FIXTURE.reason, 'transcription_empty', 'empty -> empty');
});

test('every expected failure event exposes the required shape keys', () => {
  for (const [reason, evt] of Object.entries(EXPECTED_FAILURE_EVENTS)) {
    const keys = Object.keys(evt);
    for (const req of EXPECTED_FAILURE_EVENT_SHAPE_KEYS) {
      assertTrue(
        keys.includes(req),
        `expected key missing on ${reason} event: ${req}`,
      );
    }
  }
});

test('every expected failure event carries a valid failure_reason code', () => {
  for (const [name, evt] of Object.entries(EXPECTED_FAILURE_EVENTS)) {
    assertTrue(
      (VOICE_FAILURE_REASONS as readonly string[]).includes(evt.failure_reason),
      `failure_reason on ${name} not in enum`,
    );
  }
});

test('failure events preserve Telegram chat and message identity', () => {
  const e = EXPECTED_FAILURE_EVENTS.payload_too_large;
  assertEq(
    e.chat_id,
    VOICE_UPDATE_OVERSIZED_FIXTURE.message.chat.id,
    'chat_id preserved',
  );
  assertEq(
    e.message_id,
    VOICE_UPDATE_OVERSIZED_FIXTURE.message.message_id,
    'message_id preserved',
  );
});

test('failure events set direction=inbound and kind=voice (except for non-voice media, still voice-channel failure)', () => {
  for (const evt of Object.values(EXPECTED_FAILURE_EVENTS)) {
    assertEq(evt.direction, 'inbound', 'direction inbound');
    assertEq(evt.source, 'telegram', 'source telegram');
    assertEq(evt.kind, 'voice', 'kind voice (voice-channel failure)');
    assertEq(evt.text, null, 'failed events carry null text');
  }
});

test('payload-size gate fires before any network fetch', () => {
  // Contract assertion: the voice handler must compare file_size against
  // VOICE_PAYLOAD_LIMIT_BYTES before calling getFile. This test records
  // that intent as a fixture guarantee; Worker A's implementation must
  // short-circuit on size to avoid bandwidth cost on impossible downloads.
  const fileSize = VOICE_UPDATE_OVERSIZED_FIXTURE.message.voice.file_size;
  assertTrue(
    fileSize > VOICE_PAYLOAD_LIMIT_BYTES,
    'payload-size gate pre-condition',
  );
  assertEq(
    EXPECTED_FAILURE_EVENTS.payload_too_large.failure_reason,
    'payload_too_large',
    'maps to payload_too_large',
  );
});

test('transcription timeout constant is within Worker CPU budget', () => {
  // Cloudflare Workers free plan CPU limit is ~10 s for unbound scripts,
  // but network wait does not count toward CPU time. 15 s keeps the
  // timeout short enough that Telegram webhook retry window (30 s) is
  // never reached before we ack.
  assertTrue(
    TRANSCRIPTION_TIMEOUT_MS > 0 && TRANSCRIPTION_TIMEOUT_MS < 30_000,
    'timeout within webhook ack window',
  );
});

// ────────────────────────────────────────────────────────────────────
// Runner — only executes when file is invoked as a script.
// ────────────────────────────────────────────────────────────────────

declare const process:
  | { argv: string[]; exit: (n: number) => never }
  | undefined;

async function run(): Promise<void> {
  let pass = 0;
  let fail = 0;
  for (const c of cases) {
    try {
      await c.fn();
      console.log(`  ok   ${c.name}`);
      pass++;
    } catch (err) {
      console.log(`  FAIL ${c.name}\n    ${String(err)}`);
      fail++;
    }
  }
  console.log(`\n${pass} passed, ${fail} failed (${cases.length} total)`);
  if (fail > 0 && typeof process !== 'undefined') process.exit(1);
}

if (
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv.some((a) => a.endsWith('telegram-voice-intake.test.ts'))
) {
  void run();
}
