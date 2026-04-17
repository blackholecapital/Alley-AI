/**
 * Calendar Single Action — Stage 3 S4 Tests
 * ------------------------------------------
 * Build sheet: /job_site/build-sheet-EXEC-AI-STAGE3-004.txt
 * Stage:       S4 (Single calendar action)
 * Worker B:    tests + operator proof steps for
 *   - one successful calendar command (happy path: CALENDAR_LIST_TODAY)
 *   - one safe failure case when provider config or permissions are missing
 *
 * Worker A S4 contract paths (declared in build sheet):
 *   /worker-wb/src/integrations/calendar/index.ts
 *   /worker-wb/src/integrations/calendar/provider.ts
 *   /worker-wb/src/routes/calendar-status.ts
 *   /worker-wb/src/lib/action-router.ts
 *
 * Stage 3 S4 contract pinned by this file:
 *
 *   C1. Exactly ONE action is registered: CALENDAR_LIST_TODAY.
 *       No create, no update, no delete, no second action.
 *
 *   C2. Happy path (DemoCalendarProvider):
 *         dispatch({ action_type: CALENDAR_LIST_TODAY })
 *           -> ok=true
 *           -> reply_text non-empty, event-list derived
 *           -> payload carries provider, window, events, event_count
 *
 *   C3. Failure: provider not configured (UnconfiguredCalendarProvider):
 *         dispatch({ action_type: CALENDAR_LIST_TODAY })
 *           -> ok=false
 *           -> reply_text is the canned human-readable message
 *           -> error.code = "provider_not_ready" or "provider_error"
 *           -> does NOT throw
 *
 *   C4. Failure: unknown action type dispatched to router:
 *         router.dispatch({ action_type: "calendar.unknown" })
 *           -> ok=false
 *           -> error.code = "unknown_action"
 *           -> does NOT throw
 *
 *   C5. Safety: dispatch never throws regardless of provider state.
 *
 *   C6. formatScheduleReply contract:
 *         empty event list -> "clear schedule" message
 *         non-empty event list -> starts with header + bullet lines
 *         ok=false -> returns canned reply by reason
 *
 *   C7. parseTimezoneOffset contract:
 *         empty/missing -> 0
 *         valid integer -> parsed integer
 *         out-of-range -> 0
 *         non-numeric -> 0
 *
 *   C8. Calendar status route contract (__resetCalendarStatusForTests):
 *         GET /calendar/status with no ?run -> provider status, no invocation
 *         GET /calendar/status?run=1 with demo provider -> invocation.ok=true
 *         GET /calendar/status?run=1 with unconfigured -> invocation.ok=false,
 *              readable reply_text, no throw
 *
 * Framework-agnostic and self-contained — no new devDependency. Ships:
 *   1. A tiny assertion harness.
 *   2. Tests that run against the actual src/ contracts.
 *   3. A runner script:
 *        node --experimental-strip-types \
 *          worker-wb/test/calendar-single-action.test.ts
 */

// ────────────────────────────────────────────────────────────────────
// Ambient declarations — test file compiles in isolation; tsconfig
// scopes typecheck to src/ only.
// ────────────────────────────────────────────────────────────────────

declare const console: {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

declare const process:
  | { argv: string[]; exit: (n: number) => never }
  | undefined;

// ────────────────────────────────────────────────────────────────────
// 1. IMPORTS — actual src contracts
// ────────────────────────────────────────────────────────────────────

import {
  CALENDAR_LIST_TODAY,
  buildCalendarListTodayHandler,
  formatScheduleReply,
  registerCalendarActions,
} from '../src/integrations/calendar/index';

import {
  UnconfiguredCalendarProvider,
  DemoCalendarProvider,
  getCalendarProvider,
  parseTimezoneOffset,
  type CalendarReadResult,
} from '../src/integrations/calendar/provider';

import { ActionRouter } from '../src/lib/action-router';

import {
  handleCalendarStatus,
  __resetCalendarStatusForTests,
} from '../src/routes/calendar-status';

// ────────────────────────────────────────────────────────────────────
// 2. STUB LOGGER — satisfies Logger interface, captures calls
// ────────────────────────────────────────────────────────────────────

interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  tag: string;
  data?: unknown;
}

function makeLogger(correlationId = 'test-corr-id') {
  const entries: LogEntry[] = [];
  return {
    correlationId,
    debug: (tag: string, data?: unknown) => entries.push({ level: 'debug', tag, data }),
    info:  (tag: string, data?: unknown) => entries.push({ level: 'info',  tag, data }),
    warn:  (tag: string, data?: unknown) => entries.push({ level: 'warn',  tag, data }),
    error: (tag: string, data?: unknown) => entries.push({ level: 'error', tag, data }),
    entries,
  };
}

// ────────────────────────────────────────────────────────────────────
// 3. ASSERTION HARNESS
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

function assertIncludes(haystack: string, needle: string, label: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}\n  expected to include: "${needle}"\n  actual: "${haystack}"`);
  }
}

// ────────────────────────────────────────────────────────────────────
// 4. TESTS — scope lock: exactly ONE action type registered
// ────────────────────────────────────────────────────────────────────

test('CALENDAR_LIST_TODAY constant is "calendar.list_today"', () => {
  assertEq(CALENDAR_LIST_TODAY, 'calendar.list_today', 'action type constant');
});

test('registerCalendarActions registers exactly one action — CALENDAR_LIST_TODAY', () => {
  const router = new ActionRouter();
  registerCalendarActions(router, { env: { CALENDAR_PROVIDER: 'demo' } });
  assertEq(router.list().length, 1, 'exactly one registered action');
  assertEq(router.list()[0].action_type, CALENDAR_LIST_TODAY, 'registered action type');
  assertTrue(router.has(CALENDAR_LIST_TODAY), 'router.has() confirms registration');
});

test('router does NOT have any action except CALENDAR_LIST_TODAY after registration', () => {
  const router = new ActionRouter();
  registerCalendarActions(router, { env: { CALENDAR_PROVIDER: 'demo' } });
  assertTrue(!router.has('calendar.create_event'), 'create_event not registered');
  assertTrue(!router.has('calendar.delete_event'), 'delete_event not registered');
  assertTrue(!router.has('calendar.update_event'), 'update_event not registered');
});

// ────────────────────────────────────────────────────────────────────
// 5. TESTS — happy path: DemoCalendarProvider
// ────────────────────────────────────────────────────────────────────

test('DemoCalendarProvider.ready is true and status() returns ready provider', () => {
  const p = new DemoCalendarProvider();
  assertEq(p.ready, true, 'demo provider is ready');
  assertEq(p.status().ready, true, 'status.ready');
  assertEq(p.status().provider, 'demo', 'status.provider name');
});

test('happy path: dispatch CALENDAR_LIST_TODAY with demo provider returns ok=true', async () => {
  const router = new ActionRouter();
  registerCalendarActions(router, { env: { CALENDAR_PROVIDER: 'demo' } });
  const logger = makeLogger();

  const result = await router.dispatch({ action_type: CALENDAR_LIST_TODAY }, logger);

  assertEq(result.ok, true, 'result.ok on demo provider');
  assertEq(result.action_type, CALENDAR_LIST_TODAY, 'result.action_type');
  assertTrue(typeof result.reply_text === 'string' && result.reply_text.length > 0, 'reply_text non-empty');
  assertTrue(typeof result.handled_at === 'string', 'handled_at is string');
  assertTrue(typeof result.duration_ms === 'number' && result.duration_ms >= 0, 'duration_ms present');
});

test('happy path: result payload carries provider, window, events, event_count', async () => {
  const router = new ActionRouter();
  registerCalendarActions(router, { env: { CALENDAR_PROVIDER: 'demo' } });
  const logger = makeLogger();

  const result = await router.dispatch({ action_type: CALENDAR_LIST_TODAY }, logger);

  assertTrue(result.ok === true, 'precondition: ok=true');
  const payload = result.payload as Record<string, unknown>;
  assertTrue(payload !== undefined, 'payload present');
  assertTrue(
    (payload.provider as { ready: boolean }).ready === true,
    'payload.provider.ready=true',
  );
  assertTrue(
    typeof (payload.event_count as number) === 'number',
    'payload.event_count is a number',
  );
  assertTrue(Array.isArray(payload.events), 'payload.events is an array');
  assertTrue(
    payload.window !== undefined &&
      typeof (payload.window as { from_iso: string }).from_iso === 'string',
    'payload.window has from_iso',
  );
});

test('happy path: DemoCalendarProvider returns 3 demo events anchored to today', async () => {
  const p = new DemoCalendarProvider();
  const read = await p.readTodaysSchedule({
    now: new Date(),
    timezone_offset_minutes: 0,
  });
  assertTrue(read.ok === true, 'demo read ok');
  if (read.ok) {
    assertEq(read.events.length, 3, 'demo seed has 3 events');
    assertEq(read.events[0].event_id, 'demo-001', 'first event id');
    assertEq(read.events[1].event_id, 'demo-002', 'second event id');
    assertEq(read.events[2].event_id, 'demo-003', 'third event id');
    assertTrue(read.events.every(e => e.status === 'confirmed'), 'all events confirmed');
  }
});

test('happy path: reply_text lists events with bullet markers when events exist', async () => {
  const p = new DemoCalendarProvider();
  const read = await p.readTodaysSchedule({ now: new Date() });
  assertTrue(read.ok === true, 'precondition: demo read ok');
  if (read.ok) {
    const text = formatScheduleReply(read, 0);
    assertTrue(text.includes('•'), 'bullet markers present in reply text');
    assertTrue(text.includes('Team standup'), 'first demo event title present');
    assertTrue(text.includes('Product review'), 'second demo event title present');
    assertTrue(text.includes('1:1 with Alex'), 'third demo event title present');
  }
});

test('happy path: reply_text header uses plural for multiple events', async () => {
  const p = new DemoCalendarProvider();
  const read = await p.readTodaysSchedule({ now: new Date() });
  assertTrue(read.ok === true, 'precondition: demo read ok');
  if (read.ok) {
    const text = formatScheduleReply(read, 0);
    assertIncludes(text, "today's 3 events", 'plural header for 3 events');
  }
});

test('happy path: distinct now values produce correctly anchored event timestamps', async () => {
  const p = new DemoCalendarProvider();
  const now1 = new Date('2026-04-17T12:00:00Z');
  const now2 = new Date('2026-04-18T12:00:00Z');
  const r1 = await p.readTodaysSchedule({ now: now1 });
  const r2 = await p.readTodaysSchedule({ now: now2 });
  assertTrue(r1.ok && r2.ok, 'both reads ok');
  if (r1.ok && r2.ok) {
    assertTrue(
      r1.events[0].start_iso !== r2.events[0].start_iso,
      'different days produce different event timestamps',
    );
  }
});

// ────────────────────────────────────────────────────────────────────
// 6. TESTS — failure: provider not configured / permissions missing
// ────────────────────────────────────────────────────────────────────

test('UnconfiguredCalendarProvider.ready is false', () => {
  const p = new UnconfiguredCalendarProvider();
  assertEq(p.ready, false, 'unconfigured provider ready=false');
  assertEq(p.status().ready, false, 'status.ready=false');
  assertEq(p.status().reason, 'provider_not_configured', 'status.reason');
  assertEq(p.status().provider, 'unconfigured', 'status.provider name');
});

test('failure: dispatch CALENDAR_LIST_TODAY with unconfigured provider returns ok=false', async () => {
  const router = new ActionRouter();
  registerCalendarActions(router, { env: {} });  // no CALENDAR_PROVIDER set
  const logger = makeLogger();

  const result = await router.dispatch({ action_type: CALENDAR_LIST_TODAY }, logger);

  assertEq(result.ok, false, 'result.ok=false when unconfigured');
  assertEq(result.action_type, CALENDAR_LIST_TODAY, 'result.action_type');
  assertTrue(
    typeof result.reply_text === 'string' && result.reply_text.length > 0,
    'reply_text non-empty on failure',
  );
});

test('failure: unconfigured provider reply_text is the canned human-readable message', async () => {
  const router = new ActionRouter();
  registerCalendarActions(router, { env: {} });
  const logger = makeLogger();

  const result = await router.dispatch({ action_type: CALENDAR_LIST_TODAY }, logger);

  assertIncludes(
    result.reply_text,
    "calendar connected",
    'canned message references calendar connection',
  );
  assertIncludes(
    result.reply_text,
    "CALENDAR_PROVIDER",
    'canned message references the env var the operator must set',
  );
});

test('failure: unconfigured provider result has error.code = "provider_not_ready"', async () => {
  const router = new ActionRouter();
  registerCalendarActions(router, { env: {} });
  const logger = makeLogger();

  const result = await router.dispatch({ action_type: CALENDAR_LIST_TODAY }, logger);

  assertTrue(result.error !== undefined, 'error block present on failure');
  assertEq(result.error!.code, 'provider_not_ready', 'error.code = provider_not_ready');
});

test('failure: dispatch does NOT throw when provider is unconfigured', async () => {
  const router = new ActionRouter();
  registerCalendarActions(router, { env: {} });
  const logger = makeLogger();

  let threw = false;
  try {
    await router.dispatch({ action_type: CALENDAR_LIST_TODAY }, logger);
  } catch {
    threw = true;
  }
  assertEq(threw, false, 'dispatch must not throw on unconfigured provider');
});

test('failure: unknown action type returns ok=false with error.code=unknown_action', async () => {
  const router = new ActionRouter();
  registerCalendarActions(router, { env: { CALENDAR_PROVIDER: 'demo' } });
  const logger = makeLogger();

  const result = await router.dispatch({ action_type: 'calendar.create_event' }, logger);

  assertEq(result.ok, false, 'unknown action type returns ok=false');
  assertTrue(result.error !== undefined, 'error block present');
  assertEq(result.error!.code, 'unknown_action', 'error.code=unknown_action');
  assertTrue(result.reply_text.includes('calendar.create_event'), 'reply_text names the unknown type');
});

test('failure: unsupported provider name returns ok=false with provider_unsupported reason', async () => {
  const p = getCalendarProvider({ CALENDAR_PROVIDER: 'google' });
  const logger = makeLogger();
  const handler = buildCalendarListTodayHandler(p, 0);

  let threw = false;
  let result;
  try {
    result = await handler({ action_type: CALENDAR_LIST_TODAY }, logger);
  } catch {
    threw = true;
  }

  assertEq(threw, false, 'unsupported provider must not throw');
  assertTrue(result !== undefined && result.ok === false, 'unsupported provider result ok=false');
  if (result) {
    assertIncludes(result.reply_text, 'supported', 'canned message tells operator provider is not supported');
  }
});

// ────────────────────────────────────────────────────────────────────
// 7. TESTS — safety invariants
// ────────────────────────────────────────────────────────────────────

test('safety: dispatch never throws with demo provider', async () => {
  const router = new ActionRouter();
  registerCalendarActions(router, { env: { CALENDAR_PROVIDER: 'demo' } });
  const logger = makeLogger();

  let threw = false;
  try {
    await router.dispatch({ action_type: CALENDAR_LIST_TODAY }, logger);
  } catch {
    threw = true;
  }
  assertEq(threw, false, 'no throw on demo provider dispatch');
});

test('safety: dispatch never throws with none/empty provider', async () => {
  for (const value of [undefined, '', 'none', 'unconfigured']) {
    const router = new ActionRouter();
    registerCalendarActions(router, { env: { CALENDAR_PROVIDER: value } });
    const logger = makeLogger();
    let threw = false;
    try {
      await router.dispatch({ action_type: CALENDAR_LIST_TODAY }, logger);
    } catch {
      threw = true;
    }
    assertEq(threw, false, `no throw on provider="${value}"`);
  }
});

test('safety: every result carries handled_at as ISO string', async () => {
  const router = new ActionRouter();
  registerCalendarActions(router, { env: { CALENDAR_PROVIDER: 'demo' } });
  const logger = makeLogger();
  const result = await router.dispatch({ action_type: CALENDAR_LIST_TODAY }, logger);
  assertTrue(
    typeof result.handled_at === 'string' && result.handled_at.includes('T'),
    'handled_at is ISO string',
  );
});

// ────────────────────────────────────────────────────────────────────
// 8. TESTS — formatScheduleReply contract
// ────────────────────────────────────────────────────────────────────

test('formatScheduleReply: empty event list returns "clear schedule" message', () => {
  const read: CalendarReadResult = {
    ok: true,
    provider: 'demo',
    window: { from_iso: '2026-04-17T00:00:00.000Z', to_iso: '2026-04-18T00:00:00.000Z' },
    events: [],
    fetched_at: new Date().toISOString(),
  };
  const text = formatScheduleReply(read, 0);
  assertIncludes(text, 'clear', 'empty schedule message says "clear"');
});

test('formatScheduleReply: single event uses singular header', () => {
  const read: CalendarReadResult = {
    ok: true,
    provider: 'demo',
    window: { from_iso: '2026-04-17T00:00:00.000Z', to_iso: '2026-04-18T00:00:00.000Z' },
    events: [
      {
        event_id: 'e-1',
        title: 'Solo meeting',
        start_iso: '2026-04-17T09:00:00.000Z',
        end_iso: '2026-04-17T09:30:00.000Z',
        status: 'confirmed',
      },
    ],
    fetched_at: new Date().toISOString(),
  };
  const text = formatScheduleReply(read, 0);
  assertIncludes(text, "single event", 'singular header for one event');
  assertIncludes(text, 'Solo meeting', 'event title present');
});

test('formatScheduleReply: ok=false returns canned reason message without throwing', () => {
  const reasons = [
    'provider_not_configured',
    'provider_not_ready',
    'provider_unsupported',
    'upstream_error',
    'invalid_window',
  ] as const;

  for (const reason of reasons) {
    const read: CalendarReadResult = {
      ok: false,
      provider: 'demo',
      reason,
      detail: 'test detail',
      retryable: false,
    };
    let threw = false;
    let text = '';
    try {
      text = formatScheduleReply(read, 0);
    } catch {
      threw = true;
    }
    assertEq(threw, false, `formatScheduleReply must not throw on reason="${reason}"`);
    assertTrue(typeof text === 'string' && text.length > 0, `reply text non-empty for reason="${reason}"`);
  }
});

test('formatScheduleReply: location appended when present', () => {
  const read: CalendarReadResult = {
    ok: true,
    provider: 'demo',
    window: { from_iso: '2026-04-17T00:00:00.000Z', to_iso: '2026-04-18T00:00:00.000Z' },
    events: [
      {
        event_id: 'e-1',
        title: 'Standup',
        start_iso: '2026-04-17T09:00:00.000Z',
        end_iso: '2026-04-17T09:15:00.000Z',
        location: 'Zoom',
        status: 'confirmed',
      },
    ],
    fetched_at: new Date().toISOString(),
  };
  const text = formatScheduleReply(read, 0);
  assertIncludes(text, 'Zoom', 'location appended to event line');
});

// ────────────────────────────────────────────────────────────────────
// 9. TESTS — parseTimezoneOffset contract
// ────────────────────────────────────────────────────────────────────

test('parseTimezoneOffset: missing or empty value returns 0', () => {
  assertEq(parseTimezoneOffset({}), 0, 'undefined returns 0');
  assertEq(parseTimezoneOffset({ CALENDAR_TIMEZONE_OFFSET_MINUTES: '' }), 0, 'empty string returns 0');
});

test('parseTimezoneOffset: valid integer is parsed', () => {
  assertEq(parseTimezoneOffset({ CALENDAR_TIMEZONE_OFFSET_MINUTES: '60' }), 60, 'positive offset');
  assertEq(parseTimezoneOffset({ CALENDAR_TIMEZONE_OFFSET_MINUTES: '-300' }), -300, 'negative offset');
  assertEq(parseTimezoneOffset({ CALENDAR_TIMEZONE_OFFSET_MINUTES: '0' }), 0, 'zero offset');
});

test('parseTimezoneOffset: out-of-range values are clamped to 0', () => {
  assertEq(parseTimezoneOffset({ CALENDAR_TIMEZONE_OFFSET_MINUTES: '9999' }), 0, 'too large returns 0');
  assertEq(parseTimezoneOffset({ CALENDAR_TIMEZONE_OFFSET_MINUTES: '-9999' }), 0, 'too negative returns 0');
});

test('parseTimezoneOffset: non-numeric value returns 0', () => {
  assertEq(parseTimezoneOffset({ CALENDAR_TIMEZONE_OFFSET_MINUTES: 'UTC' }), 0, 'non-numeric returns 0');
  assertEq(parseTimezoneOffset({ CALENDAR_TIMEZONE_OFFSET_MINUTES: 'NaN' }), 0, 'NaN string returns 0');
});

// ────────────────────────────────────────────────────────────────────
// 10. TESTS — calendar status route contract
// ────────────────────────────────────────────────────────────────────

test('GET /calendar/status without ?run returns provider status and no invocation', async () => {
  __resetCalendarStatusForTests();
  const logger = makeLogger();
  const req = new Request('https://worker.example.com/calendar/status');
  const res = await handleCalendarStatus(req, { CALENDAR_PROVIDER: 'demo' }, logger);

  assertEq(res.status, 200, 'status route 200');
  const body = await res.json() as Record<string, unknown>;
  assertEq(body.ok, true, 'body.ok=true');
  assertTrue(body.provider !== undefined, 'provider block present');
  assertTrue(body.action !== undefined, 'action block present');
  assertEq(body.invocation, null, 'invocation=null when ?run not supplied');
});

test('GET /calendar/status?run=1 with demo provider returns invocation.ok=true', async () => {
  __resetCalendarStatusForTests();
  const logger = makeLogger();
  const req = new Request('https://worker.example.com/calendar/status?run=1');
  const res = await handleCalendarStatus(req, { CALENDAR_PROVIDER: 'demo' }, logger);

  assertEq(res.status, 200, 'status route 200');
  const body = await res.json() as Record<string, unknown>;
  const invocation = body.invocation as Record<string, unknown> | null;
  assertTrue(invocation !== null, 'invocation present when ?run=1');
  assertEq(invocation!.ok, true, 'invocation.ok=true with demo provider');
  assertTrue(
    typeof invocation!.reply_text === 'string' && (invocation!.reply_text as string).length > 0,
    'invocation.reply_text non-empty',
  );
});

test('GET /calendar/status?run=1 with unconfigured provider returns invocation.ok=false without throwing', async () => {
  __resetCalendarStatusForTests();
  const logger = makeLogger();
  const req = new Request('https://worker.example.com/calendar/status?run=1');

  let threw = false;
  let body: Record<string, unknown> | null = null;
  try {
    const res = await handleCalendarStatus(req, {}, logger);
    assertEq(res.status, 200, 'status route 200 even when unconfigured');
    body = await res.json() as Record<string, unknown>;
  } catch {
    threw = true;
  }

  assertEq(threw, false, 'calendar status route must not throw on unconfigured provider');
  assertTrue(body !== null, 'body present');
  const invocation = body!.invocation as Record<string, unknown> | null;
  assertTrue(invocation !== null, 'invocation present');
  assertEq(invocation!.ok, false, 'invocation.ok=false when unconfigured');
  assertTrue(
    typeof invocation!.reply_text === 'string' && (invocation!.reply_text as string).length > 0,
    'invocation.reply_text non-empty (human-readable failure)',
  );
});

test('POST /calendar/status returns 405 method_not_allowed', async () => {
  __resetCalendarStatusForTests();
  const logger = makeLogger();
  const req = new Request('https://worker.example.com/calendar/status', { method: 'POST' });
  const res = await handleCalendarStatus(req, { CALENDAR_PROVIDER: 'demo' }, logger);
  assertEq(res.status, 405, 'POST returns 405');
});

test('HEAD /calendar/status returns 200 with no body', async () => {
  __resetCalendarStatusForTests();
  const logger = makeLogger();
  const req = new Request('https://worker.example.com/calendar/status', { method: 'HEAD' });
  const res = await handleCalendarStatus(req, { CALENDAR_PROVIDER: 'demo' }, logger);
  assertEq(res.status, 200, 'HEAD returns 200');
  assertEq(res.body, null, 'HEAD response has no body');
});

// ────────────────────────────────────────────────────────────────────
// Runner
// ────────────────────────────────────────────────────────────────────

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
  process.argv.some((a) => a.endsWith('calendar-single-action.test.ts'))
) {
  void run();
}
