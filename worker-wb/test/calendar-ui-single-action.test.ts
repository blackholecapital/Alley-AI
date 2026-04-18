/**
 * Calendar UI Single-Action — Stage 4 S4 (Worker B) Tests
 * --------------------------------------------------------
 * Build sheet: /job_site/build-sheet-EXEC-AI-STAGE4-001.txt
 * Stage:       S4 (Calendar Controls + Config Surface)
 * Scope:       Stage 4 tightens the SINGLE calendar action path so the
 *              operator UI can trigger it and render result or failure
 *              cleanly. This file pins that tightening — the Stage 3
 *              coverage in calendar-single-action.test.ts still stands
 *              and is NOT replaced.
 *
 * Tightening surface (what Stage 4 S4 adds on top of Stage 3):
 *
 *   T1. A pre-formatted `ui` view block returned by every GET
 *       /calendar/status response. The operator shell renders provider
 *       badge, trigger-button enablement, and last-result summary
 *       directly from this block — no string derivation in the browser.
 *
 *   T2. A `triggered_by` discriminator on the response so the UI (and
 *       logs) can tell whether a given response carries a fresh
 *       invocation or was a passive readiness poll.
 *
 *   T3. Pinned HAPPY path: GET /calendar/status?run=1 with
 *       CALENDAR_PROVIDER=demo returns ok=true, 3 events, and a
 *       ui.last_result.state="ok" with a non-empty summary.
 *
 *   T4. Pinned SAFE FAILURE path: GET /calendar/status?run=1 with no
 *       CALENDAR_PROVIDER returns HTTP 200, invocation.ok=false,
 *       invocation.reply_text names CALENDAR_PROVIDER, and
 *       ui.provider.state="not_configured",
 *       ui.last_result.state="failed", ui.last_result.error_code=
 *       "provider_not_ready". The route does NOT throw.
 *
 *   T5. `ui.trigger.action_type` is always CALENDAR_LIST_TODAY —
 *       scope lock still holds at the UI surface (no second action
 *       ever surfaced).
 *
 *   T6. `last_result` persists across calls so the UI can render the
 *       most recent invocation during passive polling.
 *
 * `ui` view block shape (pinned by this test):
 *   provider.state        ∈ ready | not_configured | unsupported | not_ready
 *   provider.label        pre-formatted string for badge
 *   provider.detail       string (never undefined — empty string if absent)
 *   trigger.enabled       boolean — UI button enablement
 *   trigger.action_type   "calendar.list_today"
 *   trigger.label         human label for the button
 *   trigger.hint          operator hint when trigger is disabled
 *   last_result.state     ∈ ok | failed | none
 *   last_result.summary   one-line UI summary
 *   last_result.handled_at ISO string or null
 *   last_result.error_code ActionErrorCode string or null
 *
 * Runner: cd worker-wb && node --loader ./test/ts-resolve.mjs \
 *           --experimental-strip-types \
 *           test/calendar-ui-single-action.test.ts
 */

// ────────────────────────────────────────────────────────────────────
// Ambient declarations (test compiles in isolation).
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
  buildCalendarUiView,
  registerCalendarActions,
  type CalendarUiView,
} from '../src/integrations/calendar/index.ts';

import {
  UnconfiguredCalendarProvider,
  DemoCalendarProvider,
  getCalendarProvider,
} from '../src/integrations/calendar/provider.ts';

import { ActionRouter } from '../src/lib/action-router.ts';

import {
  handleCalendarStatus,
  __resetCalendarStatusForTests,
} from '../src/routes/calendar-status.ts';

// ────────────────────────────────────────────────────────────────────
// 2. STUB LOGGER
// ────────────────────────────────────────────────────────────────────

interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  tag: string;
  data?: unknown;
}

function makeLogger(correlationId = 'test-ui-corr') {
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
// 4. TESTS — buildCalendarUiView pure contract (no HTTP involved)
// ────────────────────────────────────────────────────────────────────

test('buildCalendarUiView: ready demo provider + no result → state none, trigger enabled', () => {
  const view: CalendarUiView = buildCalendarUiView(
    new DemoCalendarProvider().status(),
    null,
  );
  assertEq(view.provider.state, 'ready', 'provider.state=ready');
  assertEq(view.provider.label, 'demo (ready)', 'provider.label');
  assertEq(view.trigger.enabled, true, 'trigger.enabled=true');
  assertEq(view.trigger.action_type, CALENDAR_LIST_TODAY, 'trigger.action_type');
  assertTrue(view.trigger.label.length > 0, 'trigger.label non-empty');
  assertEq(view.trigger.hint, '', 'trigger.hint empty when ready');
  assertEq(view.last_result.state, 'none', 'last_result.state=none');
  assertEq(view.last_result.handled_at, null, 'last_result.handled_at=null');
  assertEq(view.last_result.error_code, null, 'last_result.error_code=null');
});

test('buildCalendarUiView: unconfigured provider disables trigger + names env var', () => {
  const view = buildCalendarUiView(
    new UnconfiguredCalendarProvider().status(),
    null,
  );
  assertEq(view.provider.state, 'not_configured', 'provider.state=not_configured');
  assertEq(view.provider.label, 'not configured', 'provider.label');
  assertEq(view.trigger.enabled, false, 'trigger.enabled=false');
  assertIncludes(view.trigger.hint, 'CALENDAR_PROVIDER', 'trigger.hint names env var');
});

test('buildCalendarUiView: unsupported provider shows unsupported label', () => {
  const view = buildCalendarUiView(
    getCalendarProvider({ CALENDAR_PROVIDER: 'google' }).status(),
    null,
  );
  assertEq(view.provider.state, 'unsupported', 'provider.state=unsupported');
  assertIncludes(view.provider.label, 'unsupported', 'provider.label mentions unsupported');
  assertEq(view.trigger.enabled, false, 'trigger.enabled=false on unsupported');
});

test('buildCalendarUiView: ok result summarizes with event count', async () => {
  const router = new ActionRouter();
  registerCalendarActions(router, { env: { CALENDAR_PROVIDER: 'demo' } });
  const logger = makeLogger();
  const result = await router.dispatch({ action_type: CALENDAR_LIST_TODAY }, logger);

  const view = buildCalendarUiView(new DemoCalendarProvider().status(), result);
  assertEq(view.last_result.state, 'ok', 'ok result → ui state=ok');
  assertTrue(
    view.last_result.summary.includes('3') || view.last_result.summary.includes('Listed'),
    'summary mentions event count or Listed',
  );
  assertEq(view.last_result.error_code, null, 'ok result → error_code=null');
  assertTrue(
    typeof view.last_result.handled_at === 'string' &&
      (view.last_result.handled_at as string).includes('T'),
    'handled_at is ISO string',
  );
});

test('buildCalendarUiView: failed result carries reply_text + error_code', async () => {
  const router = new ActionRouter();
  registerCalendarActions(router, { env: {} });
  const logger = makeLogger();
  const result = await router.dispatch({ action_type: CALENDAR_LIST_TODAY }, logger);

  const view = buildCalendarUiView(
    new UnconfiguredCalendarProvider().status(),
    result,
  );
  assertEq(view.last_result.state, 'failed', 'failed result → ui state=failed');
  assertEq(view.last_result.error_code, 'provider_not_ready', 'error_code surfaced');
  assertTrue(
    view.last_result.summary.length > 0,
    'summary non-empty on failure',
  );
});

// ────────────────────────────────────────────────────────────────────
// 5. TESTS — UI trigger HAPPY path (GET /calendar/status?run=1, demo)
// ────────────────────────────────────────────────────────────────────

test('happy path: GET ?run=1 demo returns HTTP 200 + triggered_by=get_run', async () => {
  __resetCalendarStatusForTests();
  const logger = makeLogger();
  const req = new Request('https://worker.example.com/calendar/status?run=1');
  const res = await handleCalendarStatus(req, { CALENDAR_PROVIDER: 'demo' }, logger);

  assertEq(res.status, 200, 'HTTP 200');
  const body = await res.json() as Record<string, unknown>;
  assertEq(body.ok, true, 'body.ok=true');
  assertEq(body.triggered_by, 'get_run', 'triggered_by=get_run');

  const invocation = body.invocation as Record<string, unknown>;
  assertTrue(invocation !== null, 'invocation present on ?run=1');
  assertEq(invocation.ok, true, 'invocation.ok=true on demo');
  assertEq(invocation.action_type, CALENDAR_LIST_TODAY, 'action_type');
});

test('happy path: response includes UI view block with ready/enabled/ok', async () => {
  __resetCalendarStatusForTests();
  const logger = makeLogger();
  const req = new Request('https://worker.example.com/calendar/status?run=1');
  const res = await handleCalendarStatus(req, { CALENDAR_PROVIDER: 'demo' }, logger);

  const body = await res.json() as { ui: CalendarUiView };
  assertTrue(body.ui !== undefined, 'ui block present');
  assertEq(body.ui.provider.state, 'ready', 'ui.provider.state=ready');
  assertEq(body.ui.trigger.enabled, true, 'ui.trigger.enabled=true');
  assertEq(body.ui.trigger.action_type, CALENDAR_LIST_TODAY, 'ui.trigger.action_type');
  assertEq(body.ui.last_result.state, 'ok', 'ui.last_result.state=ok after trigger');
  assertTrue(body.ui.last_result.summary.length > 0, 'ui.last_result.summary non-empty');
  assertTrue(body.ui.last_result.handled_at !== null, 'ui.last_result.handled_at non-null');
});

test('happy path: correlation id echoed in header', async () => {
  __resetCalendarStatusForTests();
  const logger = makeLogger('corr-happy-1');
  const req = new Request('https://worker.example.com/calendar/status?run=1');
  const res = await handleCalendarStatus(req, { CALENDAR_PROVIDER: 'demo' }, logger);
  assertEq(res.headers.get('x-correlation-id'), 'corr-happy-1', 'x-correlation-id echoed');
});

test('happy path: invocation.payload carries event_count that matches UI summary', async () => {
  __resetCalendarStatusForTests();
  const logger = makeLogger();
  const req = new Request('https://worker.example.com/calendar/status?run=1');
  const res = await handleCalendarStatus(req, { CALENDAR_PROVIDER: 'demo' }, logger);
  const body = await res.json() as {
    invocation: { payload: { event_count: number } };
    ui: CalendarUiView;
  };
  assertEq(body.invocation.payload.event_count, 3, 'demo provider returns 3 events');
  assertIncludes(body.ui.last_result.summary, '3', 'ui summary references count');
});

// ────────────────────────────────────────────────────────────────────
// 6. TESTS — UI trigger SAFE FAILURE path
// ────────────────────────────────────────────────────────────────────

test('safe failure: GET ?run=1 with no CALENDAR_PROVIDER → 200, invocation.ok=false, no throw', async () => {
  __resetCalendarStatusForTests();
  const logger = makeLogger();
  const req = new Request('https://worker.example.com/calendar/status?run=1');

  let threw = false;
  let res: Response | null = null;
  try {
    res = await handleCalendarStatus(req, {}, logger);
  } catch {
    threw = true;
  }
  assertEq(threw, false, 'route must not throw when unconfigured');
  assertTrue(res !== null, 'response present');
  assertEq(res!.status, 200, 'HTTP 200 on safe failure');

  const body = await res!.json() as Record<string, unknown>;
  const invocation = body.invocation as Record<string, unknown>;
  assertEq(invocation.ok, false, 'invocation.ok=false when unconfigured');
  assertTrue(
    typeof invocation.reply_text === 'string' &&
      (invocation.reply_text as string).length > 0,
    'reply_text non-empty on failure',
  );
  assertIncludes(invocation.reply_text as string, 'CALENDAR_PROVIDER', 'reply_text names env var');
});

test('safe failure: UI view reports not_configured + disabled trigger', async () => {
  __resetCalendarStatusForTests();
  const logger = makeLogger();
  const req = new Request('https://worker.example.com/calendar/status?run=1');
  const res = await handleCalendarStatus(req, {}, logger);
  const body = await res.json() as { ui: CalendarUiView };

  assertEq(body.ui.provider.state, 'not_configured', 'ui.provider.state=not_configured');
  assertEq(body.ui.trigger.enabled, false, 'ui.trigger.enabled=false');
  assertIncludes(body.ui.trigger.hint, 'CALENDAR_PROVIDER', 'ui.trigger.hint names env var');
  assertEq(body.ui.last_result.state, 'failed', 'ui.last_result.state=failed');
  assertEq(body.ui.last_result.error_code, 'provider_not_ready', 'error_code=provider_not_ready');
});

test('safe failure: unsupported provider → state=unsupported, invocation.ok=false', async () => {
  __resetCalendarStatusForTests();
  const logger = makeLogger();
  const req = new Request('https://worker.example.com/calendar/status?run=1');
  const res = await handleCalendarStatus(req, { CALENDAR_PROVIDER: 'google' }, logger);
  assertEq(res.status, 200, 'HTTP 200 on unsupported');
  const body = await res.json() as {
    invocation: Record<string, unknown>;
    ui: CalendarUiView;
  };
  assertEq(body.invocation.ok, false, 'invocation.ok=false on unsupported');
  assertEq(body.ui.provider.state, 'unsupported', 'ui.provider.state=unsupported');
  assertEq(body.ui.trigger.enabled, false, 'ui.trigger.enabled=false');
});

// ────────────────────────────────────────────────────────────────────
// 7. TESTS — passive polling (no trigger)
// ────────────────────────────────────────────────────────────────────

test('passive poll: GET without ?run → triggered_by=none, invocation=null, ui present', async () => {
  __resetCalendarStatusForTests();
  const logger = makeLogger();
  const req = new Request('https://worker.example.com/calendar/status');
  const res = await handleCalendarStatus(req, { CALENDAR_PROVIDER: 'demo' }, logger);
  assertEq(res.status, 200, 'GET returns 200');
  const body = await res.json() as Record<string, unknown>;
  assertEq(body.triggered_by, 'none', 'triggered_by=none');
  assertEq(body.invocation, null, 'invocation=null');
  assertTrue(body.ui !== undefined, 'ui block still present');
  const ui = body.ui as CalendarUiView;
  assertEq(ui.last_result.state, 'none', 'last_result.state=none before any trigger');
});

test('passive poll: ui.trigger.enabled reflects provider readiness even without a run', async () => {
  __resetCalendarStatusForTests();
  const logger = makeLogger();
  const demoReq = new Request('https://worker.example.com/calendar/status');
  const demoRes = await handleCalendarStatus(demoReq, { CALENDAR_PROVIDER: 'demo' }, logger);
  const demoBody = await demoRes.json() as { ui: CalendarUiView };
  assertEq(demoBody.ui.trigger.enabled, true, 'demo: trigger.enabled=true even without ?run');

  __resetCalendarStatusForTests();
  const unreq = new Request('https://worker.example.com/calendar/status');
  const unres = await handleCalendarStatus(unreq, {}, logger);
  const unbody = await unres.json() as { ui: CalendarUiView };
  assertEq(unbody.ui.trigger.enabled, false, 'unconfigured: trigger.enabled=false');
});

// ────────────────────────────────────────────────────────────────────
// 8. TESTS — last_result persists across calls (UI polling after trigger)
// ────────────────────────────────────────────────────────────────────

test('last_result persists: trigger then passive GET returns the same last_result', async () => {
  __resetCalendarStatusForTests();
  const logger = makeLogger();

  const triggerReq = new Request('https://worker.example.com/calendar/status?run=1');
  await handleCalendarStatus(triggerReq, { CALENDAR_PROVIDER: 'demo' }, logger);

  const pollReq = new Request('https://worker.example.com/calendar/status');
  const pollRes = await handleCalendarStatus(pollReq, { CALENDAR_PROVIDER: 'demo' }, logger);
  const body = await pollRes.json() as Record<string, unknown>;

  assertEq(body.triggered_by, 'none', 'poll after trigger: triggered_by=none');
  assertEq(body.invocation, null, 'poll: invocation=null (no new run)');
  const lastResult = body.last_result as Record<string, unknown>;
  assertTrue(lastResult !== null, 'last_result preserved from prior trigger');
  assertEq(lastResult.ok, true, 'last_result.ok=true from prior trigger');
  const ui = body.ui as CalendarUiView;
  assertEq(ui.last_result.state, 'ok', 'ui.last_result.state=ok from prior trigger');
});

test('last_result updates on each trigger (fail then ok)', async () => {
  __resetCalendarStatusForTests();
  const logger = makeLogger();

  const failReq = new Request('https://worker.example.com/calendar/status?run=1');
  await handleCalendarStatus(failReq, {}, logger);

  const okReq = new Request('https://worker.example.com/calendar/status?run=1');
  const okRes = await handleCalendarStatus(okReq, { CALENDAR_PROVIDER: 'demo' }, logger);
  const body = await okRes.json() as Record<string, unknown>;
  const invocation = body.invocation as Record<string, unknown>;
  const ui = body.ui as CalendarUiView;
  assertEq(invocation.ok, true, 'latest trigger is ok=true');
  assertEq(ui.last_result.state, 'ok', 'ui.last_result.state reflects latest trigger');
});

// ────────────────────────────────────────────────────────────────────
// 9. TESTS — scope lock holds at UI surface
// ────────────────────────────────────────────────────────────────────

test('UI view only ever references CALENDAR_LIST_TODAY as trigger action', () => {
  const readyView = buildCalendarUiView(new DemoCalendarProvider().status(), null);
  const unconfiguredView = buildCalendarUiView(
    new UnconfiguredCalendarProvider().status(),
    null,
  );
  const unsupportedView = buildCalendarUiView(
    getCalendarProvider({ CALENDAR_PROVIDER: 'outlook' }).status(),
    null,
  );
  assertEq(readyView.trigger.action_type, CALENDAR_LIST_TODAY, 'ready view action_type');
  assertEq(unconfiguredView.trigger.action_type, CALENDAR_LIST_TODAY, 'unconfigured view action_type');
  assertEq(unsupportedView.trigger.action_type, CALENDAR_LIST_TODAY, 'unsupported view action_type');
});

test('method safety: POST still returns 405 (scope lock: no write methods)', async () => {
  __resetCalendarStatusForTests();
  const logger = makeLogger();
  const req = new Request('https://worker.example.com/calendar/status', { method: 'POST' });
  const res = await handleCalendarStatus(req, { CALENDAR_PROVIDER: 'demo' }, logger);
  assertEq(res.status, 405, 'POST returns 405');
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
  process.argv.some((a) => a.endsWith('calendar-ui-single-action.test.ts'))
) {
  void run();
}
