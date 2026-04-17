/**
 * Telegram Voice Round-Trip — Stage 3 S3 Tests & Fallback Coverage
 * ----------------------------------------------------------------
 * Build sheet: /job_site/build-sheet-EXEC-AI-STAGE3-004.txt
 * Stage:       S3 (Voice golden path)
 * Worker B:    tests + fallback handling for
 *   - media fetch failure
 *   - transcription failure
 *   - unsupported media
 *   - reply fallback mode (voice closes with TEXT reply for Stage 3)
 *
 * Worker A S3 contract paths (declared in build sheet):
 *   /worker-wb/src/integrations/telegram/voice.ts
 *   /worker-wb/src/providers/transcription/provider.ts
 *   /worker-wb/src/providers/transcription/index.ts
 *   /worker-wb/src/integrations/telegram/outbound.ts
 *
 * Stage 3 voice round-trip contract pinned by this file:
 *
 *   R1. Happy path:
 *         inbound voice update
 *           -> media fetched (Telegram getFile + download)
 *           -> transcribed via configured provider
 *           -> ONE outbound reply recorded
 *         The outbound reply is kind="text" carrying transcript-derived
 *         content. Spoken-audio reply is NOT required this stage; the
 *         build sheet allows text fallback ("Voice can close with text
 *         fallback if spoken-audio reply is not stable enough").
 *
 *   R2. Failure modes (media_fetch_failed, transcription_failed,
 *       unsupported_media):
 *         - webhook returns HTTP 200 (Telegram stops retrying)
 *         - top-level fetch handler does NOT throw
 *         - exactly ONE failure event is appended to the session store
 *         - failure_reason is from the closed enum
 *         - NO outbound reply is recorded for the failed turn
 *
 *   R3. Reply fallback mode:
 *         - When transcription succeeds, the outbound row records the
 *           assistant reply as kind="text" with reply_mode="text_fallback"
 *           (the operator UI uses reply_mode to render a "spoken reply
 *           skipped" badge if the badge is enabled in S5).
 *         - chat_id on the outbound matches the inbound chat.id.
 *         - reply text is non-empty AND derives from the transcript.
 *
 * Framework-agnostic and self-contained — no new devDependency. Ships:
 *   1. Fixtures (happy path + 3 failure modes) as named exports.
 *   2. A pure simulator (`simulateVoiceRoundTrip`) that mirrors the
 *      contract Worker A's voice.ts + telegram-webhook.ts must satisfy.
 *      Replace with live imports when a real test runner is wired up.
 *   3. A tiny assertion harness that runs when the file is invoked as
 *      a script:
 *        node --experimental-strip-types \
 *          worker-wb/test/telegram-voice-roundtrip.test.ts
 */

// ────────────────────────────────────────────────────────────────────
// 1. CLOSED ENUMS — failure reasons + reply modes
// ────────────────────────────────────────────────────────────────────

export const VOICE_FAILURE_REASONS = [
  'transcription_failed',
  'transcription_timeout',
  'transcription_empty',
  'unsupported_media',
  'payload_too_large',
  'media_fetch_failed',
] as const;
export type VoiceFailureReason = (typeof VOICE_FAILURE_REASONS)[number];

export const VOICE_REPLY_MODES = [
  'text_fallback', // Stage 3 default: voice in -> text out
  'voice_native',  // future: spoken-audio reply (out of S3 scope)
] as const;
export type VoiceReplyMode = (typeof VOICE_REPLY_MODES)[number];

export const STAGE3_DEFAULT_REPLY_MODE: VoiceReplyMode = 'text_fallback';

export const VOICE_PAYLOAD_LIMIT_BYTES = 20 * 1024 * 1024;
export const TRANSCRIPTION_TIMEOUT_MS = 15_000;

// ────────────────────────────────────────────────────────────────────
// 2. FIXTURES — inbound voice updates
// ────────────────────────────────────────────────────────────────────

export const TEST_CHAT_ID = 987_654_321;
export const TEST_USER_ID = 123_456_789;

interface VoiceFixture {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type: string;
  file_size: number;
}

interface ChatFixture {
  id: number;
  type: 'private';
}

interface FromFixture {
  id: number;
  is_bot: boolean;
  first_name: string;
}

interface VoiceMessageFixture {
  message_id: number;
  date: number;
  chat: ChatFixture;
  from: FromFixture;
  voice?: VoiceFixture;
  sticker?: { file_id: string; emoji: string };
}

interface VoiceUpdateFixture {
  update_id: number;
  message: VoiceMessageFixture;
}

const TEST_CHAT: ChatFixture = { id: TEST_CHAT_ID, type: 'private' };
const TEST_FROM: FromFixture = {
  id: TEST_USER_ID,
  is_bot: false,
  first_name: 'Operator',
};

/** Happy-path voice update — small file, supported mime. */
export const VOICE_UPDATE_OK: VoiceUpdateFixture = {
  update_id: 3_000_000_001,
  message: {
    message_id: 701,
    date: 1_744_910_000,
    chat: TEST_CHAT,
    from: TEST_FROM,
    voice: {
      file_id: 'AwACAgIAAxkBAAID_VOICE_OK',
      file_unique_id: 'UNIQ_OK_S3',
      duration: 4,
      mime_type: 'audio/ogg',
      file_size: 64_000,
    },
  },
};

/** media_fetch_failed driver — getFile returns 400. */
export const VOICE_UPDATE_MEDIA_FETCH_FAIL: VoiceUpdateFixture = {
  update_id: 3_000_000_002,
  message: {
    message_id: 702,
    date: 1_744_910_010,
    chat: TEST_CHAT,
    from: TEST_FROM,
    voice: {
      file_id: 'AwACAgIAAxkBAAID_VOICE_MISSING',
      file_unique_id: 'UNIQ_MISSING',
      duration: 4,
      mime_type: 'audio/ogg',
      file_size: 48_000,
    },
  },
};

/** transcription_failed driver — provider returns 503. */
export const VOICE_UPDATE_TRANSCRIPTION_FAIL: VoiceUpdateFixture = {
  update_id: 3_000_000_003,
  message: {
    message_id: 703,
    date: 1_744_910_020,
    chat: TEST_CHAT,
    from: TEST_FROM,
    voice: {
      file_id: 'AwACAgIAAxkBAAID_VOICE_BADPROV',
      file_unique_id: 'UNIQ_BADPROV',
      duration: 5,
      mime_type: 'audio/ogg',
      file_size: 72_000,
    },
  },
};

/** unsupported_media — sticker, no voice, no text. */
export const UPDATE_UNSUPPORTED_STICKER: VoiceUpdateFixture = {
  update_id: 3_000_000_004,
  message: {
    message_id: 704,
    date: 1_744_910_030,
    chat: TEST_CHAT,
    from: TEST_FROM,
    sticker: { file_id: 'CAACAgIAAx_STICKER_S3', emoji: '🐕' },
  },
};

// ────────────────────────────────────────────────────────────────────
// 3. SIMULATOR INPUTS — programmable provider/fetch outcomes
// ────────────────────────────────────────────────────────────────────

export type FetchOutcome =
  | { ok: true; bytes: number; mime_type: string }
  | { ok: false; reason: 'media_fetch_failed'; detail: string };

export type TranscribeOutcome =
  | { ok: true; text: string; provider: string; duration_ms: number }
  | { ok: false; reason: 'transcription_failed' | 'transcription_empty' | 'transcription_timeout'; detail: string; provider: string };

export interface SimulatorOptions {
  fetch: (update: VoiceUpdateFixture) => FetchOutcome;
  transcribe: (update: VoiceUpdateFixture) => TranscribeOutcome;
  reply_mode?: VoiceReplyMode;
}

// ────────────────────────────────────────────────────────────────────
// 4. SESSION-STORE CONTRACT — what the simulator emits
// ────────────────────────────────────────────────────────────────────

export interface VoiceInboundEvent {
  id: string;
  source: 'telegram';
  kind: 'voice';
  direction: 'inbound';
  chat_id: number;
  message_id: number;
  user_id: number | null;
  username: string | null;
  text: string | null;
  received_at: string;
  failure_reason?: VoiceFailureReason;
  failure_detail?: string;
}

export interface VoiceOutboundEvent {
  id: string;
  source: 'telegram';
  kind: 'text';
  direction: 'outbound';
  chat_id: number;
  reply_to_message_id: number;
  text: string;
  reply_mode: VoiceReplyMode;
  derived_from_event_id: string;
}

export type SessionEvent = VoiceInboundEvent | VoiceOutboundEvent;

export interface RoundTripOutcome {
  webhook_status: 200;
  webhook_body: { ok: true };
  events: SessionEvent[];
  threw: false;
}

// ────────────────────────────────────────────────────────────────────
// 5. SIMULATOR — pure function mirroring the S3 contract
// ────────────────────────────────────────────────────────────────────

function isoFromUnixSeconds(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

function classify(update: VoiceUpdateFixture): 'voice' | 'unsupported' {
  return update.message.voice ? 'voice' : 'unsupported';
}

/**
 * Mirrors the contract Worker A's voice.ts + telegram-webhook.ts must
 * satisfy for Stage 3 S3:
 *   - safety invariants I-1..I-4 (200, no throw, one failure event,
 *     stable failure_reason)
 *   - reply-fallback mode: text-out for voice-in
 *   - happy path: outbound text reply derives from transcript
 */
export function simulateVoiceRoundTrip(
  update: VoiceUpdateFixture,
  opts: SimulatorOptions,
): RoundTripOutcome {
  const events: SessionEvent[] = [];
  const replyMode = opts.reply_mode ?? STAGE3_DEFAULT_REPLY_MODE;
  const m = update.message;

  // Gate 1 — unsupported media (no voice payload).
  if (classify(update) === 'unsupported') {
    events.push({
      id: `telegram:${update.update_id}`,
      source: 'telegram',
      kind: 'voice',
      direction: 'inbound',
      chat_id: m.chat.id,
      message_id: m.message_id,
      user_id: m.from.id,
      username: null,
      text: null,
      received_at: isoFromUnixSeconds(m.date),
      failure_reason: 'unsupported_media',
      failure_detail: 'update has no voice and no text',
    });
    return {
      webhook_status: 200,
      webhook_body: { ok: true },
      events,
      threw: false,
    };
  }

  // Gate 2 — fetch media. Failure short-circuits.
  const fetched = opts.fetch(update);
  if (!fetched.ok) {
    events.push({
      id: `telegram:${update.update_id}`,
      source: 'telegram',
      kind: 'voice',
      direction: 'inbound',
      chat_id: m.chat.id,
      message_id: m.message_id,
      user_id: m.from.id,
      username: null,
      text: null,
      received_at: isoFromUnixSeconds(m.date),
      failure_reason: fetched.reason,
      failure_detail: fetched.detail,
    });
    return {
      webhook_status: 200,
      webhook_body: { ok: true },
      events,
      threw: false,
    };
  }

  // Gate 3 — transcribe. Failure short-circuits.
  const transcript = opts.transcribe(update);
  if (!transcript.ok) {
    events.push({
      id: `telegram:${update.update_id}`,
      source: 'telegram',
      kind: 'voice',
      direction: 'inbound',
      chat_id: m.chat.id,
      message_id: m.message_id,
      user_id: m.from.id,
      username: null,
      text: null,
      received_at: isoFromUnixSeconds(m.date),
      failure_reason: transcript.reason,
      failure_detail: transcript.detail,
    });
    return {
      webhook_status: 200,
      webhook_body: { ok: true },
      events,
      threw: false,
    };
  }

  // Happy path — record successful inbound + text-fallback outbound.
  const inboundId = `telegram:${update.update_id}`;
  events.push({
    id: inboundId,
    source: 'telegram',
    kind: 'voice',
    direction: 'inbound',
    chat_id: m.chat.id,
    message_id: m.message_id,
    user_id: m.from.id,
    username: null,
    text: transcript.text,
    received_at: isoFromUnixSeconds(m.date),
  });

  // Reply-fallback contract: text-out for voice-in. Reply text MUST
  // derive from the transcript so different transcripts produce
  // different replies (no static ack).
  const replyText = `transcribed: ${transcript.text.slice(0, 200)}`;
  events.push({
    id: `out:${inboundId}`,
    source: 'telegram',
    kind: 'text',
    direction: 'outbound',
    chat_id: m.chat.id,
    reply_to_message_id: m.message_id,
    text: replyText,
    reply_mode: replyMode,
    derived_from_event_id: inboundId,
  });

  return {
    webhook_status: 200,
    webhook_body: { ok: true },
    events,
    threw: false,
  };
}

// ────────────────────────────────────────────────────────────────────
// Ambient declarations so the file compiles in isolation. tsconfig
// scopes typecheck to src/, so these do not affect the Worker build.
// ────────────────────────────────────────────────────────────────────
declare const console: {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

// ────────────────────────────────────────────────────────────────────
// Tiny self-contained assertion harness (no devDependency added)
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
// 6. TESTS — enum/contract coherence
// ────────────────────────────────────────────────────────────────────

test('failure reason enum is closed and stable across stages', () => {
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

test('reply mode enum is closed and Stage 3 default is text_fallback', () => {
  assertEq([...VOICE_REPLY_MODES].sort(), ['text_fallback', 'voice_native'], 'reply mode enum');
  assertEq(STAGE3_DEFAULT_REPLY_MODE, 'text_fallback', 'Stage 3 default reply mode');
});

test('happy-path voice fixture stays under the 20 MiB cap', () => {
  assertTrue(
    VOICE_UPDATE_OK.message.voice!.file_size < VOICE_PAYLOAD_LIMIT_BYTES,
    'ok fixture must be under cap',
  );
});

test('unsupported-media fixture has neither voice nor text', () => {
  const m = UPDATE_UNSUPPORTED_STICKER.message;
  assertTrue(m.voice === undefined, 'no voice');
  assertTrue((m as { text?: string }).text === undefined, 'no text');
  assertTrue(m.sticker !== undefined, 'sticker present so the fixture is unambiguous');
});

// ────────────────────────────────────────────────────────────────────
// 7. TESTS — happy-path voice round trip with text-fallback reply
// ────────────────────────────────────────────────────────────────────

test('happy path: voice in -> fetched -> transcribed -> ONE text-fallback outbound reply', () => {
  const out = simulateVoiceRoundTrip(VOICE_UPDATE_OK, {
    fetch: () => ({ ok: true, bytes: 64_000, mime_type: 'audio/ogg' }),
    transcribe: () => ({
      ok: true,
      text: 'remind me to call alice tomorrow',
      provider: 'mock',
      duration_ms: 380,
    }),
  });

  assertEq(out.webhook_status, 200, 'webhook acks 200');
  assertEq(out.webhook_body.ok, true, 'webhook body ok:true');
  assertEq(out.threw, false, 'no throw on happy path');
  assertEq(out.events.length, 2, 'one inbound + one outbound');

  const [inEvt, outEvt] = out.events as [VoiceInboundEvent, VoiceOutboundEvent];
  assertEq(inEvt.direction, 'inbound', 'inbound recorded first');
  assertEq(inEvt.kind, 'voice', 'inbound kind is voice');
  assertEq(inEvt.text, 'remind me to call alice tomorrow', 'inbound text is the transcript');
  assertEq((inEvt as { failure_reason?: string }).failure_reason, undefined, 'no failure on happy path');

  assertEq(outEvt.direction, 'outbound', 'outbound recorded second');
  assertEq(outEvt.kind, 'text', 'reply-fallback contract: voice in -> text out');
  assertEq(outEvt.chat_id, TEST_CHAT_ID, 'outbound chat_id matches inbound');
  assertEq(outEvt.reply_to_message_id, VOICE_UPDATE_OK.message.message_id, 'reply_to_message_id wired');
  assertEq(outEvt.reply_mode, 'text_fallback', 'reply_mode flagged text_fallback for Stage 3');
  assertTrue(typeof outEvt.text === 'string' && outEvt.text.length > 0, 'reply text non-empty');
  assertTrue(
    outEvt.text.includes('remind me to call alice tomorrow'),
    'reply text derives from transcript (not a static ack)',
  );
});

test('happy path with different transcripts produces different replies', () => {
  const r1 = simulateVoiceRoundTrip(VOICE_UPDATE_OK, {
    fetch: () => ({ ok: true, bytes: 64_000, mime_type: 'audio/ogg' }),
    transcribe: () => ({ ok: true, text: 'first transcript', provider: 'mock', duration_ms: 300 }),
  });
  const r2 = simulateVoiceRoundTrip(VOICE_UPDATE_OK, {
    fetch: () => ({ ok: true, bytes: 64_000, mime_type: 'audio/ogg' }),
    transcribe: () => ({ ok: true, text: 'second transcript', provider: 'mock', duration_ms: 310 }),
  });

  const out1 = r1.events.find((e) => e.direction === 'outbound') as VoiceOutboundEvent;
  const out2 = r2.events.find((e) => e.direction === 'outbound') as VoiceOutboundEvent;
  assertTrue(out1.text !== out2.text, 'distinct transcripts must yield distinct replies');
});

// ────────────────────────────────────────────────────────────────────
// 8. TESTS — failure modes (media fetch / transcription / unsupported)
// ────────────────────────────────────────────────────────────────────

test('media_fetch_failed: 200, no throw, one failure event, no outbound', () => {
  const out = simulateVoiceRoundTrip(VOICE_UPDATE_MEDIA_FETCH_FAIL, {
    fetch: () => ({
      ok: false,
      reason: 'media_fetch_failed',
      detail: 'getFile returned 400: wrong file_id',
    }),
    transcribe: () => {
      throw new Error('transcribe must not be called when fetch fails');
    },
  });

  assertEq(out.webhook_status, 200, 'webhook acks 200 on fetch failure');
  assertEq(out.threw, false, 'no throw on fetch failure');
  assertEq(out.events.length, 1, 'exactly one failure event recorded');

  const fail = out.events[0] as VoiceInboundEvent;
  assertEq(fail.direction, 'inbound', 'failure recorded as inbound');
  assertEq(fail.kind, 'voice', 'failure on voice channel');
  assertEq(fail.text, null, 'no transcript text on failure');
  assertEq(fail.failure_reason, 'media_fetch_failed', 'stable failure_reason');
  assertTrue(
    typeof fail.failure_detail === 'string' && fail.failure_detail.length > 0,
    'failure_detail human-readable',
  );

  assertTrue(
    out.events.every((e) => e.direction !== 'outbound'),
    'no outbound reply on fetch failure',
  );
});

test('transcription_failed: 200, no throw, one failure event, no outbound', () => {
  const out = simulateVoiceRoundTrip(VOICE_UPDATE_TRANSCRIPTION_FAIL, {
    fetch: () => ({ ok: true, bytes: 72_000, mime_type: 'audio/ogg' }),
    transcribe: () => ({
      ok: false,
      reason: 'transcription_failed',
      detail: 'provider returned 503',
      provider: 'mock',
    }),
  });

  assertEq(out.webhook_status, 200, 'webhook acks 200 on transcription failure');
  assertEq(out.threw, false, 'no throw on transcription failure');
  assertEq(out.events.length, 1, 'exactly one failure event recorded');

  const fail = out.events[0] as VoiceInboundEvent;
  assertEq(fail.failure_reason, 'transcription_failed', 'stable failure_reason');
  assertTrue(
    out.events.every((e) => e.direction !== 'outbound'),
    'no outbound reply on transcription failure',
  );
});

test('unsupported_media: 200, no throw, one failure event, no fetch, no transcribe', () => {
  let fetchCalled = false;
  let transcribeCalled = false;
  const out = simulateVoiceRoundTrip(UPDATE_UNSUPPORTED_STICKER, {
    fetch: () => {
      fetchCalled = true;
      return { ok: true, bytes: 0, mime_type: 'application/octet-stream' };
    },
    transcribe: () => {
      transcribeCalled = true;
      return { ok: true, text: 'unreachable', provider: 'mock', duration_ms: 0 };
    },
  });

  assertEq(out.webhook_status, 200, 'webhook acks 200 on unsupported media');
  assertEq(out.threw, false, 'no throw on unsupported media');
  assertEq(out.events.length, 1, 'exactly one failure event recorded');
  assertTrue(!fetchCalled, 'fetch must NOT be called for unsupported media');
  assertTrue(!transcribeCalled, 'transcribe must NOT be called for unsupported media');

  const fail = out.events[0] as VoiceInboundEvent;
  assertEq(fail.failure_reason, 'unsupported_media', 'stable failure_reason');
  assertEq(fail.text, null, 'no text on unsupported media');
});

// ────────────────────────────────────────────────────────────────────
// 9. TESTS — reply fallback mode
// ────────────────────────────────────────────────────────────────────

test('reply fallback mode: voice in always closes with kind="text" outbound', () => {
  const out = simulateVoiceRoundTrip(VOICE_UPDATE_OK, {
    fetch: () => ({ ok: true, bytes: 64_000, mime_type: 'audio/ogg' }),
    transcribe: () => ({ ok: true, text: 'check my calendar', provider: 'mock', duration_ms: 200 }),
  });

  const outEvt = out.events.find((e) => e.direction === 'outbound') as VoiceOutboundEvent;
  assertEq(outEvt.kind, 'text', 'Stage 3 spoken-audio is out of scope; text reply only');
  assertEq(outEvt.reply_mode, 'text_fallback', 'reply_mode badge=text_fallback');
});

test('reply fallback mode: chat round-trip closure (outbound chat_id == inbound chat.id)', () => {
  const out = simulateVoiceRoundTrip(VOICE_UPDATE_OK, {
    fetch: () => ({ ok: true, bytes: 64_000, mime_type: 'audio/ogg' }),
    transcribe: () => ({ ok: true, text: 'hello', provider: 'mock', duration_ms: 100 }),
  });
  const outEvt = out.events.find((e) => e.direction === 'outbound') as VoiceOutboundEvent;
  assertEq(outEvt.chat_id, VOICE_UPDATE_OK.message.chat.id, 'chat round-trip preserved');
  assertEq(
    outEvt.reply_to_message_id,
    VOICE_UPDATE_OK.message.message_id,
    'reply_to_message_id wired to inbound message_id',
  );
});

test('reply fallback mode: outbound is linked back to its inbound event id', () => {
  const out = simulateVoiceRoundTrip(VOICE_UPDATE_OK, {
    fetch: () => ({ ok: true, bytes: 64_000, mime_type: 'audio/ogg' }),
    transcribe: () => ({ ok: true, text: 'ok', provider: 'mock', duration_ms: 100 }),
  });
  const inEvt = out.events.find((e) => e.direction === 'inbound') as VoiceInboundEvent;
  const outEvt = out.events.find((e) => e.direction === 'outbound') as VoiceOutboundEvent;
  assertEq(
    outEvt.derived_from_event_id,
    inEvt.id,
    'derived_from_event_id ties reply to its source event',
  );
});

test('reply fallback mode: failure paths do NOT emit a reply (silent on failure is correct)', () => {
  // Stage 3 contract: failure events render in the UI; the assistant
  // does not auto-reply to a failure (no "sorry, I could not hear you"
  // is required). UI states the failure; operator decides whether to
  // ask the user to retry. This pins that no outbound is fabricated
  // on the failure path so audit trails stay accurate.
  for (const update of [
    VOICE_UPDATE_MEDIA_FETCH_FAIL,
    VOICE_UPDATE_TRANSCRIPTION_FAIL,
    UPDATE_UNSUPPORTED_STICKER,
  ]) {
    const out = simulateVoiceRoundTrip(update, {
      fetch: () => ({ ok: false, reason: 'media_fetch_failed', detail: 'forced' }),
      transcribe: () => ({ ok: false, reason: 'transcription_failed', detail: 'forced', provider: 'mock' }),
    });
    assertTrue(
      out.events.every((e) => e.direction !== 'outbound'),
      `no outbound reply for failure update ${update.update_id}`,
    );
  }
});

// ────────────────────────────────────────────────────────────────────
// 10. TESTS — invariants that hold across every code path
// ────────────────────────────────────────────────────────────────────

test('every simulated path returns webhook 200 and threw=false (Telegram safety)', () => {
  const cases_ = [
    { u: VOICE_UPDATE_OK,                 ok: { ok: true as const,  bytes: 64_000, mime_type: 'audio/ogg' }, t: { ok: true as const, text: 'x', provider: 'mock', duration_ms: 1 } },
    { u: VOICE_UPDATE_MEDIA_FETCH_FAIL,   ok: { ok: false as const, reason: 'media_fetch_failed' as const,   detail: 'd' }, t: { ok: true as const, text: 'x', provider: 'mock', duration_ms: 1 } },
    { u: VOICE_UPDATE_TRANSCRIPTION_FAIL, ok: { ok: true as const,  bytes: 72_000, mime_type: 'audio/ogg' }, t: { ok: false as const, reason: 'transcription_failed' as const, detail: 'd', provider: 'mock' } },
    { u: UPDATE_UNSUPPORTED_STICKER,      ok: { ok: true as const,  bytes: 0,      mime_type: 'application/octet-stream' }, t: { ok: true as const, text: 'x', provider: 'mock', duration_ms: 1 } },
  ];

  for (const c of cases_) {
    const out = simulateVoiceRoundTrip(c.u, { fetch: () => c.ok, transcribe: () => c.t });
    assertEq(out.webhook_status, 200, `update ${c.u.update_id} webhook 200`);
    assertEq(out.webhook_body.ok, true, `update ${c.u.update_id} body ok:true`);
    assertEq(out.threw, false, `update ${c.u.update_id} no throw`);
  }
});

test('failure events always have stable failure_reason from the closed enum', () => {
  const failPaths: Array<[VoiceUpdateFixture, FetchOutcome, TranscribeOutcome]> = [
    [VOICE_UPDATE_MEDIA_FETCH_FAIL,   { ok: false, reason: 'media_fetch_failed', detail: 'd' }, { ok: true, text: 'x', provider: 'mock', duration_ms: 1 }],
    [VOICE_UPDATE_TRANSCRIPTION_FAIL, { ok: true,  bytes: 72_000, mime_type: 'audio/ogg' },     { ok: false, reason: 'transcription_failed', detail: 'd', provider: 'mock' }],
    [UPDATE_UNSUPPORTED_STICKER,      { ok: true,  bytes: 0,      mime_type: 'x' },             { ok: true, text: 'x', provider: 'mock', duration_ms: 1 }],
  ];
  for (const [u, f, t] of failPaths) {
    const out = simulateVoiceRoundTrip(u, { fetch: () => f, transcribe: () => t });
    const fail = out.events[0] as VoiceInboundEvent;
    assertTrue(
      typeof fail.failure_reason === 'string' &&
        (VOICE_FAILURE_REASONS as readonly string[]).includes(fail.failure_reason),
      `failure_reason on update ${u.update_id} must be in enum`,
    );
  }
});

test('transcription timeout constant stays inside the Telegram webhook ack window', () => {
  assertTrue(
    TRANSCRIPTION_TIMEOUT_MS > 0 && TRANSCRIPTION_TIMEOUT_MS < 30_000,
    'TRANSCRIPTION_TIMEOUT_MS must be < 30s (Telegram retry window)',
  );
});

// ────────────────────────────────────────────────────────────────────
// Runner — only executes when the file is invoked as a script.
// Harmless when imported by a test framework.
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
  process.argv.some((a) => a.endsWith('telegram-voice-roundtrip.test.ts'))
) {
  void run();
}
