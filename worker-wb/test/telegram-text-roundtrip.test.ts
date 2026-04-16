/**
 * Telegram Text Round-Trip — Contract Tests & Request Fixtures
 * ------------------------------------------------------------
 * Build sheet: /job_site/build-sheet-EXEC-AI-STAGE2-003.txt
 * Stage:       S2 (Telegram text round trip)
 * Worker B:    tests/fixtures for
 *   - webhook registration
 *   - inbound text handling
 *   - normalized event creation
 *   - outbound Telegram reply behavior
 *
 * Worker A S2 contract paths (declared in build sheet, may not yet exist):
 *   /worker-wb/src/integrations/telegram/inbound.ts
 *   /worker-wb/src/integrations/telegram/outbound.ts
 *   /worker-wb/src/integrations/telegram/types.ts
 *   /worker-wb/src/routes/telegram-webhook.ts
 *
 * This file is framework-agnostic. It ships:
 *   1. Canonical request fixtures (Telegram-format payloads + declared
 *      normalized-event contract shape) as named exports, so any future
 *      test runner (vitest / node:test / @cloudflare/vitest-pool-workers)
 *      can import them unchanged.
 *   2. A self-contained assertion runner that validates the fixtures
 *      against the declared contract without requiring any Worker A
 *      source file to exist yet. Run with:
 *          node --experimental-strip-types worker-wb/test/telegram-text-roundtrip.test.ts
 *      or via any TS-aware runner.
 *
 * No external dev-dependency is added. When Worker A ships the S2
 * modules, upgrade this file to import the real handler and swap the
 * assertions against live behavior — the fixtures remain canonical.
 */

// ────────────────────────────────────────────────────────────────────
// 1. CANONICAL FIXTURES — webhook registration
// ────────────────────────────────────────────────────────────────────

/**
 * Telegram setWebhook call shape. Registered once after Worker deploy.
 * Bot token and URL vary per environment; secret is a random slug
 * stored in the Worker as TELEGRAM_WEBHOOK_SECRET. Telegram echoes
 * that secret on every inbound update in the
 * X-Telegram-Bot-Api-Secret-Token header.
 *
 * Reference: https://core.telegram.org/bots/api#setwebhook
 */
export const WEBHOOK_REGISTRATION_FIXTURE = {
  endpoint: "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook",
  method: "POST",
  contentType: "application/x-www-form-urlencoded",
  body: {
    url: "https://ali-ai.<account>.workers.dev/telegram/webhook",
    secret_token: "<TELEGRAM_WEBHOOK_SECRET>",
    allowed_updates: ["message"],
  },
  expected_response: { ok: true, result: true },
} as const;

// ────────────────────────────────────────────────────────────────────
// 2. CANONICAL FIXTURES — inbound Telegram text update
// ────────────────────────────────────────────────────────────────────

/**
 * Minimal Telegram "message" update with text. Everything Worker A's
 * /telegram/webhook route must be able to parse in the happy path.
 * Reference: https://core.telegram.org/bots/api#update
 */
export const INBOUND_TEXT_UPDATE_FIXTURE = {
  update_id: 1_000_000_001,
  message: {
    message_id: 42,
    date: 1_744_800_000,
    text: "hello assistant",
    chat: { id: 987_654_321, type: "private" as const },
    from: {
      id: 123_456_789,
      is_bot: false,
      first_name: "Operator",
      username: "op",
    },
  },
} as const;

/** Inbound with no text payload — webhook must ack 200 without crashing. */
export const INBOUND_NON_TEXT_UPDATE_FIXTURE = {
  update_id: 1_000_000_002,
  message: {
    message_id: 43,
    date: 1_744_800_001,
    chat: { id: 987_654_321, type: "private" as const },
    from: { id: 123_456_789, is_bot: false, first_name: "Operator" },
    sticker: { file_id: "CAACAg..." },
  },
} as const;

/** HTTP-level shape of the request Telegram actually sends to the Worker. */
export const INBOUND_WEBHOOK_REQUEST_FIXTURE = {
  url: "https://ali-ai.<account>.workers.dev/telegram/webhook",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Telegram-Bot-Api-Secret-Token": "<TELEGRAM_WEBHOOK_SECRET>",
  },
  body: JSON.stringify(INBOUND_TEXT_UPDATE_FIXTURE),
} as const;

// ────────────────────────────────────────────────────────────────────
// 3. CANONICAL CONTRACT — normalized internal event
// ────────────────────────────────────────────────────────────────────

/**
 * Normalized event contract that Worker A's
 * /worker-wb/src/integrations/telegram/inbound.ts must emit when it
 * receives INBOUND_TEXT_UPDATE_FIXTURE. This is the shape the shared
 * pipeline (S3 session/latest) will consume for both text and voice.
 */
export const NORMALIZED_TEXT_EVENT_FIXTURE = {
  kind: "message" as const,
  direction: "inbound" as const,
  channel: "telegram" as const,
  session_id: "telegram:987654321",
  user_id: "telegram:123456789",
  text: "hello assistant",
  source: {
    provider: "telegram" as const,
    update_id: 1_000_000_001,
    message_id: 42,
  },
  received_at_ms: 1_744_800_000_000,
} as const;

/** Required keys every normalized event must expose. */
export const NORMALIZED_EVENT_REQUIRED_KEYS = [
  "kind",
  "direction",
  "channel",
  "session_id",
  "user_id",
  "text",
  "source",
  "received_at_ms",
] as const;

// ────────────────────────────────────────────────────────────────────
// 4. CANONICAL FIXTURES — outbound Telegram reply
// ────────────────────────────────────────────────────────────────────

/**
 * Outbound sendMessage call Worker A's
 * /worker-wb/src/integrations/telegram/outbound.ts must issue in
 * response to NORMALIZED_TEXT_EVENT_FIXTURE. Text content is
 * provider-free (assistant reply string is supplied by the caller).
 *
 * Reference: https://core.telegram.org/bots/api#sendmessage
 */
export const OUTBOUND_REPLY_FIXTURE = {
  endpoint: "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage",
  method: "POST",
  contentType: "application/json",
  body: {
    chat_id: 987_654_321,
    text: "hello back",
  },
  expected_response: {
    ok: true,
    result: {
      message_id: 44,
      date: 1_744_800_001,
      chat: { id: 987_654_321, type: "private" },
      text: "hello back",
    },
  },
} as const;

// ────────────────────────────────────────────────────────────────────
// Ambient decls — keeps this file compilable in isolation (without
// relying on @types/node or DOM lib). tsconfig.json scopes typecheck
// to src/, so these do not affect the Worker build.
// ────────────────────────────────────────────────────────────────────
declare const console: { log: (...args: unknown[]) => void };

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
// Tests — pure contract checks against fixtures; no import of Worker A
// source required. These guarantee the fixtures themselves stay
// coherent with the build-sheet-declared contract.
// ────────────────────────────────────────────────────────────────────

test("webhook registration targets /telegram/webhook path", () => {
  assertTrue(
    WEBHOOK_REGISTRATION_FIXTURE.body.url.endsWith("/telegram/webhook"),
    "setWebhook url must end with /telegram/webhook per build sheet",
  );
  assertEq(
    WEBHOOK_REGISTRATION_FIXTURE.body.allowed_updates,
    ["message"],
    "Stage 2 scope is text messages only",
  );
  assertTrue(
    WEBHOOK_REGISTRATION_FIXTURE.body.secret_token.length > 0,
    "secret_token must be set so Worker can validate X-Telegram-Bot-Api-Secret-Token",
  );
});

test("inbound text update carries the fields the Worker must read", () => {
  const m = INBOUND_TEXT_UPDATE_FIXTURE.message;
  assertTrue(typeof m.text === "string" && m.text.length > 0, "message.text present");
  assertTrue(typeof m.chat.id === "number", "message.chat.id present");
  assertTrue(typeof m.from.id === "number", "message.from.id present");
  assertTrue(typeof INBOUND_TEXT_UPDATE_FIXTURE.update_id === "number", "update_id present");
});

test("inbound webhook request declares secret-token header", () => {
  assertTrue(
    "X-Telegram-Bot-Api-Secret-Token" in INBOUND_WEBHOOK_REQUEST_FIXTURE.headers,
    "webhook request must carry X-Telegram-Bot-Api-Secret-Token for Worker validation",
  );
  assertEq(
    INBOUND_WEBHOOK_REQUEST_FIXTURE.method,
    "POST",
    "Telegram posts webhook updates",
  );
});

test("non-text inbound update is acceptable shape (must 200-ack, not 500)", () => {
  const u = INBOUND_NON_TEXT_UPDATE_FIXTURE;
  assertTrue("message" in u, "still a message update");
  // @ts-expect-error — deliberately no text key on this fixture
  assertTrue(u.message.text === undefined, "no text key — Worker must ack without crashing");
});

test("normalized event exposes every required contract key", () => {
  const keys = Object.keys(NORMALIZED_TEXT_EVENT_FIXTURE);
  for (const req of NORMALIZED_EVENT_REQUIRED_KEYS) {
    assertTrue(keys.includes(req), `normalized event missing required key: ${req}`);
  }
});

test("normalized event preserves Telegram identifiers", () => {
  const n = NORMALIZED_TEXT_EVENT_FIXTURE;
  const src = INBOUND_TEXT_UPDATE_FIXTURE;
  assertEq(n.session_id, `telegram:${src.message.chat.id}`, "session_id = telegram:<chat.id>");
  assertEq(n.user_id, `telegram:${src.message.from.id}`, "user_id = telegram:<from.id>");
  assertEq(n.text, src.message.text, "text passes through verbatim");
  assertEq(n.source.update_id, src.update_id, "source.update_id mirrors Telegram update_id");
  assertEq(n.source.message_id, src.message.message_id, "source.message_id mirrors Telegram message_id");
});

test("outbound reply routes to Telegram sendMessage for the same chat", () => {
  assertTrue(
    OUTBOUND_REPLY_FIXTURE.endpoint.endsWith("/sendMessage"),
    "outbound must POST /sendMessage",
  );
  assertEq(
    OUTBOUND_REPLY_FIXTURE.body.chat_id,
    INBOUND_TEXT_UPDATE_FIXTURE.message.chat.id,
    "reply chat_id equals inbound chat.id (round trip closure)",
  );
  assertTrue(
    typeof OUTBOUND_REPLY_FIXTURE.body.text === "string" &&
      OUTBOUND_REPLY_FIXTURE.body.text.length > 0,
    "reply text is a non-empty string",
  );
});

test("round-trip integrity: inbound chat.id == outbound chat_id", () => {
  assertEq(
    OUTBOUND_REPLY_FIXTURE.body.chat_id,
    INBOUND_TEXT_UPDATE_FIXTURE.message.chat.id,
    "text round trip requires chat identity to be preserved end-to-end",
  );
});

// ────────────────────────────────────────────────────────────────────
// Runner — only executes when this file is invoked as a script.
// Harmless when imported by a test framework.
// ────────────────────────────────────────────────────────────────────

declare const process: { argv: string[]; exit: (n: number) => never } | undefined;

async function run(): Promise<void> {
  let pass = 0;
  let fail = 0;
  for (const c of cases) {
    try {
      await c.fn();
      // eslint-disable-next-line no-console
      console.log(`  ok   ${c.name}`);
      pass++;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(`  FAIL ${c.name}\n    ${String(err)}`);
      fail++;
    }
  }
  // eslint-disable-next-line no-console
  console.log(`\n${pass} passed, ${fail} failed (${cases.length} total)`);
  if (fail > 0 && typeof process !== "undefined") process.exit(1);
}

if (
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv.some((a) => a.endsWith("telegram-text-roundtrip.test.ts"))
) {
  void run();
}
