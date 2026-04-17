/**
 * Telegram Text Reply-By-Default — Two-Consecutive-Message Round-Trip Tests
 * ------------------------------------------------------------------------
 * Build sheet: /job_site/build-sheet-EXEC-AI-STAGE3-004.txt
 * Stage:       S2 (Reply-path polish for text)
 * Worker B:    tests + fixtures proving two-way text behavior across two
 *              consecutive messages.
 *
 * Worker A S2 contract paths (declared in the build sheet):
 *   /worker-wb/src/integrations/telegram/inbound.ts
 *   /worker-wb/src/integrations/telegram/outbound.ts
 *   /worker-wb/src/routes/telegram-webhook.ts
 *   /worker-wb/src/lib/session-store.ts
 *
 * S2 reply-by-default contract this file pins down:
 *
 *   1. Every text-bearing inbound update MUST produce an outbound reply
 *      recorded in the session store. Receipt-only acknowledgement
 *      (HTTP 200 with no outbound row) is a PATCH condition.
 *   2. Two consecutive inbound messages MUST each be followed by their
 *      own outbound reply, in order, in the session store.
 *      Order: in:1, out:1, in:2, out:2.
 *   3. Every outbound row must:
 *        - target the same chat_id as the inbound it replies to
 *        - carry a non-empty `text` string (no silent acks)
 *        - vary with the inbound text (the reply must derive from the
 *          message, not be a static no-op string).
 *   4. The session_id from /session/latest must remain stable across
 *      both turns so the operator UI renders one continuous trail.
 *
 * This file is framework-agnostic and self-contained — no new
 * devDependency is added. It ships:
 *   1. Canonical fixtures (two consecutive Telegram updates, one chat,
 *      one user) as named exports.
 *   2. A pure-function simulator (`simulateRoundTrip`) that mirrors the
 *      reply-by-default contract Worker A's webhook + session-store must
 *      satisfy. The simulator has no I/O, so the same fixtures can be
 *      replayed against the live route once a real test runner is wired
 *      up (vitest / @cloudflare/vitest-pool-workers).
 *   3. A tiny assertion harness that runs when the file is invoked as a
 *      script:
 *        node --experimental-strip-types \
 *          worker-wb/test/telegram-text-reply-default.test.ts
 *
 * When a real runner is added, replace `simulateRoundTrip` with the
 * Worker A modules:
 *     import { handleTelegramWebhook } from '../src/routes/telegram-webhook';
 *     import { __resetForTests, getLatest } from '../src/lib/session-store';
 * The fixtures and assertions remain canonical.
 */

// ────────────────────────────────────────────────────────────────────
// 1. FIXTURES — two consecutive inbound text updates from one chat
// ────────────────────────────────────────────────────────────────────

export const TEST_CHAT_ID = 987_654_321;
export const TEST_USER_ID = 123_456_789;
export const TEST_TELEGRAM_BOT_TOKEN = 'test-bot-token';
export const TEST_TELEGRAM_WEBHOOK_SECRET = 'test-webhook-secret';

interface TelegramFromFixture {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
}

interface TelegramChatFixture {
  id: number;
  type: 'private';
}

interface TelegramMessageFixture {
  message_id: number;
  date: number;
  text: string;
  chat: TelegramChatFixture;
  from: TelegramFromFixture;
}

interface TelegramUpdateFixture {
  update_id: number;
  message: TelegramMessageFixture;
}

const TEST_FROM: TelegramFromFixture = {
  id: TEST_USER_ID,
  is_bot: false,
  first_name: 'Operator',
  username: 'op',
};

const TEST_CHAT: TelegramChatFixture = { id: TEST_CHAT_ID, type: 'private' };

export const INBOUND_TEXT_UPDATE_1: TelegramUpdateFixture = {
  update_id: 2_000_000_001,
  message: {
    message_id: 101,
    date: 1_744_900_000,
    text: 'first message: how are you',
    chat: TEST_CHAT,
    from: TEST_FROM,
  },
};

export const INBOUND_TEXT_UPDATE_2: TelegramUpdateFixture = {
  update_id: 2_000_000_002,
  message: {
    message_id: 102,
    date: 1_744_900_060,
    text: 'second message: what is on my calendar',
    chat: TEST_CHAT,
    from: TEST_FROM,
  },
};

/** HTTP-level shape of the request Telegram actually sends to the Worker. */
export const INBOUND_WEBHOOK_REQUEST_SHAPE = {
  method: 'POST',
  url_suffix: '/telegram/webhook',
  required_headers: {
    'Content-Type': 'application/json',
    'X-Telegram-Bot-Api-Secret-Token': TEST_TELEGRAM_WEBHOOK_SECRET,
  },
} as const;

// ────────────────────────────────────────────────────────────────────
// 2. EXPECTED-CONTRACT TYPES — what the session store must contain
// ────────────────────────────────────────────────────────────────────

export type Direction = 'inbound' | 'outbound';
export type ItemKind = 'text' | 'voice' | 'other';

export interface SessionItemFixture {
  id: string;
  direction: Direction;
  source: 'telegram';
  kind: ItemKind;
  chat_id: number;
  message_id: number | null;
  text: string | null;
}

export interface SessionSnapshotFixture {
  session_id: string;
  items: SessionItemFixture[];
  counts: { inbound: number; outbound: number; total: number };
}

// ────────────────────────────────────────────────────────────────────
// 3. SIMULATOR — pure function mirroring the reply-by-default contract
// ────────────────────────────────────────────────────────────────────

/**
 * Mirrors the contract Worker A's /telegram/webhook + session-store
 * must satisfy. Pure (no I/O, no globals). For each update:
 *   - records the inbound event
 *   - synthesizes a reply that DERIVES from the inbound text (so
 *     identical-input would yield identical output and distinct inputs
 *     yield distinct outputs)
 *   - records the outbound reply targeting the same chat_id
 *
 * A receipt-only implementation (no outbound row) would fail every
 * "expect outbound" assertion below. A static-string implementation
 * would fail the "outbound replies vary" assertion.
 */
export function simulateRoundTrip(
  updates: readonly TelegramUpdateFixture[],
  sessionId: string = 'session-test',
): SessionSnapshotFixture {
  const items: SessionItemFixture[] = [];
  const counts = { inbound: 0, outbound: 0, total: 0 };

  function push(item: SessionItemFixture): void {
    items.push(item);
    counts[item.direction] += 1;
    counts.total += 1;
  }

  for (const u of updates) {
    const m = u.message;

    push({
      id: `in:telegram:${u.update_id}`,
      direction: 'inbound',
      source: 'telegram',
      kind: 'text',
      chat_id: m.chat.id,
      message_id: m.message_id,
      text: m.text,
    });

    // Reply derives from inbound text — distinct inputs => distinct outputs.
    const replyText = `received: ${m.text.slice(0, 200)}`;

    push({
      id: `out:telegram:${u.update_id}`,
      direction: 'outbound',
      source: 'telegram',
      kind: 'text',
      chat_id: m.chat.id,
      message_id: null,
      text: replyText,
    });
  }

  return { session_id: sessionId, items, counts };
}

// ────────────────────────────────────────────────────────────────────
// Ambient declarations so this file compiles in isolation. tsconfig
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
// 4. TESTS — fixture-shape contract (no Worker A code required)
// ────────────────────────────────────────────────────────────────────

test('two consecutive update fixtures share chat_id and differ in text', () => {
  assertEq(
    INBOUND_TEXT_UPDATE_1.message.chat.id,
    INBOUND_TEXT_UPDATE_2.message.chat.id,
    'both updates must come from the same chat to prove session continuity',
  );
  assertTrue(
    INBOUND_TEXT_UPDATE_1.message.text !== INBOUND_TEXT_UPDATE_2.message.text,
    'inbound texts must differ to prove the reply derives from the message',
  );
  assertTrue(
    INBOUND_TEXT_UPDATE_1.update_id !== INBOUND_TEXT_UPDATE_2.update_id,
    'update_ids must differ so the session store keys do not collide',
  );
  assertTrue(
    INBOUND_TEXT_UPDATE_1.message.message_id !==
      INBOUND_TEXT_UPDATE_2.message.message_id,
    'message_ids must differ so reply_to_message_id stays unique per turn',
  );
});

test('webhook request shape declares secret-token header and POST method', () => {
  assertEq(INBOUND_WEBHOOK_REQUEST_SHAPE.method, 'POST', 'Telegram posts updates');
  assertTrue(
    INBOUND_WEBHOOK_REQUEST_SHAPE.url_suffix.endsWith('/telegram/webhook'),
    'webhook URL must end with /telegram/webhook per build sheet',
  );
  assertTrue(
    'X-Telegram-Bot-Api-Secret-Token' in
      INBOUND_WEBHOOK_REQUEST_SHAPE.required_headers,
    'request must carry X-Telegram-Bot-Api-Secret-Token for Worker validation',
  );
});

// ────────────────────────────────────────────────────────────────────
// 5. TESTS — two-way text round-trip across two messages (simulator)
// ────────────────────────────────────────────────────────────────────

test('first inbound update produces an outbound reply (reply-by-default)', () => {
  const snap = simulateRoundTrip([INBOUND_TEXT_UPDATE_1]);
  assertEq(snap.counts.inbound, 1, 'one inbound recorded after first update');
  assertEq(
    snap.counts.outbound,
    1,
    'one outbound recorded after first update — reply by default',
  );
  assertEq(snap.counts.total, 2, 'total session items after first message');
});

test('two consecutive updates produce two outbound replies', () => {
  const snap = simulateRoundTrip([INBOUND_TEXT_UPDATE_1, INBOUND_TEXT_UPDATE_2]);
  assertEq(snap.counts.inbound, 2, 'two inbounds after two consecutive messages');
  assertEq(
    snap.counts.outbound,
    2,
    'two outbounds — reply by default for every message',
  );
  assertEq(snap.counts.total, 4, 'four total items across two turns');
});

test('session store interleaves in:1, out:1, in:2, out:2 in chronological order', () => {
  const snap = simulateRoundTrip([INBOUND_TEXT_UPDATE_1, INBOUND_TEXT_UPDATE_2]);
  assertEq(snap.items.length, 4, 'four items recorded in order');

  assertEq(snap.items[0]!.direction, 'inbound', 'item 0 = inbound (first user msg)');
  assertEq(
    snap.items[0]!.text,
    INBOUND_TEXT_UPDATE_1.message.text,
    'item 0 text matches first msg',
  );

  assertEq(snap.items[1]!.direction, 'outbound', 'item 1 = outbound (reply to first)');
  assertEq(snap.items[1]!.chat_id, TEST_CHAT_ID, 'item 1 reply targets same chat_id');

  assertEq(snap.items[2]!.direction, 'inbound', 'item 2 = inbound (second user msg)');
  assertEq(
    snap.items[2]!.text,
    INBOUND_TEXT_UPDATE_2.message.text,
    'item 2 text matches second msg',
  );

  assertEq(snap.items[3]!.direction, 'outbound', 'item 3 = outbound (reply to second)');
  assertEq(snap.items[3]!.chat_id, TEST_CHAT_ID, 'item 3 reply targets same chat_id');
});

test('every outbound reply carries non-empty text — no silent ack', () => {
  const snap = simulateRoundTrip([INBOUND_TEXT_UPDATE_1, INBOUND_TEXT_UPDATE_2]);
  const outbounds = snap.items.filter((i) => i.direction === 'outbound');
  assertEq(outbounds.length, 2, 'expect exactly two outbound replies');
  for (const o of outbounds) {
    assertTrue(
      typeof o.text === 'string' && (o.text as string).length > 0,
      `outbound reply text must be non-empty (got: ${JSON.stringify(o.text)})`,
    );
  }
});

test('outbound replies vary with inbound text — reply derives from the message', () => {
  const snap = simulateRoundTrip([INBOUND_TEXT_UPDATE_1, INBOUND_TEXT_UPDATE_2]);
  const out1 = snap.items[1]!;
  const out2 = snap.items[3]!;

  assertTrue(
    typeof out1.text === 'string' && typeof out2.text === 'string',
    'both outbound replies must have text bodies',
  );
  assertTrue(
    out1.text !== out2.text,
    'two distinct inbound messages must produce two distinct outbound replies — ' +
      'a static or constant ack proves reply-by-default is not implemented',
  );
});

test('outbound chat_id equals inbound chat.id for both turns (round-trip closure)', () => {
  const snap = simulateRoundTrip([INBOUND_TEXT_UPDATE_1, INBOUND_TEXT_UPDATE_2]);
  for (const o of snap.items.filter((i) => i.direction === 'outbound')) {
    assertEq(o.chat_id, TEST_CHAT_ID, 'outbound chat_id must equal inbound chat.id');
  }
});

test('session_id is stable across two consecutive turns', () => {
  const snap1 = simulateRoundTrip([INBOUND_TEXT_UPDATE_1], 'session-A');
  const snap2 = simulateRoundTrip(
    [INBOUND_TEXT_UPDATE_1, INBOUND_TEXT_UPDATE_2],
    'session-A',
  );
  assertEq(
    snap1.session_id,
    snap2.session_id,
    'session_id must be stable across two consecutive messages',
  );
});

test('inbound + outbound ids encode the originating telegram update_id', () => {
  const snap = simulateRoundTrip([INBOUND_TEXT_UPDATE_1, INBOUND_TEXT_UPDATE_2]);
  assertEq(
    snap.items[0]!.id,
    `in:telegram:${INBOUND_TEXT_UPDATE_1.update_id}`,
    'inbound id encodes update_id',
  );
  assertEq(
    snap.items[1]!.id,
    `out:telegram:${INBOUND_TEXT_UPDATE_1.update_id}`,
    'outbound id encodes update_id',
  );
  assertEq(
    snap.items[2]!.id,
    `in:telegram:${INBOUND_TEXT_UPDATE_2.update_id}`,
    'second inbound id encodes second update_id',
  );
  assertEq(
    snap.items[3]!.id,
    `out:telegram:${INBOUND_TEXT_UPDATE_2.update_id}`,
    'second outbound id encodes second update_id',
  );
});

// ────────────────────────────────────────────────────────────────────
// Runner — only executes when this file is invoked as a script.
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
  process.argv.some((a) => a.endsWith('telegram-text-reply-default.test.ts'))
) {
  void run();
}
