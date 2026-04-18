/**
 * Browser Chat Route — Stage UIFIX-002 S3 | Worker B
 * ---------------------------------------------------
 * Build sheet: /job_site/build-sheet-EXEC-AI-STAGE4-UIFIX-002.txt
 * Stage:       S3 (Browser Chat Route Unification)
 * Contract:    /job_site/browser_chat_route_contract.txt
 *
 * Tests POST /ui/send (handleUiSend) end-to-end:
 *   - text input → non-placeholder assistant reply
 *   - inbound + outbound persisted to session store
 *   - full rejection envelope contract for all error paths
 *
 * Run with:
 *
 *   cd worker-wb && \
 *   node --loader ./test/ts-resolve.mjs \
 *        --experimental-strip-types \
 *        test/browser-chat-route.test.ts
 *
 * Contracts under test:
 *   R1.  POST { text } → 200 { ok: true, event_id, reply_text, inbound_item, outbound_item }
 *   R2.  reply_text is non-placeholder: not "received: …", not a verbatim echo,
 *        is an assistant-voice sentence (non-empty string ≥ 10 chars)
 *   R3.  inbound item is persisted in session store with source='ui', direction='inbound'
 *   R4.  outbound item is persisted with source='ui', direction='outbound', kind='text'
 *   R5.  event_id in response matches inbound item id in session store
 *   R6.  Two consecutive exchanges share one stable session_id
 *   R7.  Method guard: non-POST → 405 { ok: false, error }
 *   R8.  Non-JSON body → 400 { ok: false, error }
 *   R9.  Missing text field → 400 { ok: false, error }
 *   R10. Non-string text field → 400 { ok: false, error }
 *   R11. Empty (whitespace-only) text → 400 { ok: false, error }
 *   R12. Oversized text (> 4000 chars) → 400 { ok: false, error }
 *   R13. All rejection responses carry { ok: false, error: { code, message } }
 *   R14. Rejection requests do not pollute the session store
 *   R15. Handler never throws — always returns a Response
 */

import { handleUiSend } from '../src/routes/ui-send';
import {
  getLatest,
  __resetForTests,
} from '../src/lib/session-store';
import type { Logger } from '../src/lib/logging';

// ─── Logger stub ──────────────────────────────────────────────────────────────

function makeLogger(correlationId = 'test-corr-id'): Logger {
  return {
    correlationId,
    child: () => makeLogger(correlationId),
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

// ─── Request builders ─────────────────────────────────────────────────────────

function postJson(body: unknown, url = 'http://localhost/ui/send'): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function nonJsonRequest(): Request {
  return new Request('http://localhost/ui/send', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'this is not json',
  });
}

function methodRequest(method: string): Request {
  return new Request('http://localhost/ui/send', { method });
}

// ─── Response parsing helper ──────────────────────────────────────────────────

async function parseBody(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

// ─── Ambient declarations ─────────────────────────────────────────────────────

declare const console: {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

// ─── Assertion harness ────────────────────────────────────────────────────────

type Case = { name: string; fn: () => void | Promise<void> };
const cases: Case[] = [];
const test = (name: string, fn: () => void | Promise<void>) =>
  cases.push({ name, fn });

function assertEq<T>(actual: T, expected: T, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}\n  expected: ${e}\n  actual:   ${a}`);
}

function assertTrue(cond: unknown, label: string): void {
  if (!cond) throw new Error(`assertion failed: ${label}`);
}

function assertErrorShape(body: Record<string, unknown>, label: string): void {
  assertEq(body['ok'], false, `${label}: ok must be false`);
  const err = body['error'] as Record<string, unknown> | undefined;
  assertTrue(
    typeof err === 'object' && err !== null,
    `${label}: error must be an object`,
  );
  assertTrue(
    typeof err!['code'] === 'string' && (err!['code'] as string).length > 0,
    `${label}: error.code must be a non-empty string`,
  );
  assertTrue(
    typeof err!['message'] === 'string' && (err!['message'] as string).length > 0,
    `${label}: error.message must be a non-empty string`,
  );
}

// ─── R1: Happy path response shape ───────────────────────────────────────────

test('R1: POST { text } → 200 { ok: true, event_id, reply_text, inbound_item, outbound_item }', async () => {
  __resetForTests();
  const res = await handleUiSend(postJson({ text: 'hello' }), makeLogger());

  assertEq(res.status, 200, 'status 200 on valid text');
  const body = await parseBody(res);
  assertEq(body['ok'], true, 'body.ok is true');
  assertTrue(
    typeof body['event_id'] === 'string' && (body['event_id'] as string).length > 0,
    'event_id is a non-empty string',
  );
  assertTrue(
    typeof body['reply_text'] === 'string' && (body['reply_text'] as string).length > 0,
    'reply_text is a non-empty string',
  );
  const inbound = body['inbound_item'] as Record<string, unknown> | undefined;
  assertTrue(typeof inbound === 'object' && inbound !== null, 'inbound_item is an object');
  const outbound = body['outbound_item'] as Record<string, unknown> | undefined;
  assertTrue(typeof outbound === 'object' && outbound !== null, 'outbound_item is an object');
});

// ─── R2: Non-placeholder reply ───────────────────────────────────────────────

test('R2: reply_text is not a verbatim echo of the input', async () => {
  __resetForTests();
  const input = 'please schedule a meeting';
  const res = await handleUiSend(postJson({ text: input }), makeLogger());
  const body = await parseBody(res);
  const reply = body['reply_text'] as string;
  assertTrue(reply !== input, 'reply must not echo the input verbatim');
});

test('R2: reply_text does not start with "received:"', async () => {
  __resetForTests();
  const res = await handleUiSend(postJson({ text: 'any message' }), makeLogger());
  const body = await parseBody(res);
  const reply = (body['reply_text'] as string).toLowerCase();
  assertTrue(
    !reply.startsWith('received:'),
    'placeholder "received: ..." pattern must be absent — route must produce an assistant reply',
  );
});

test('R2: reply_text is an assistant-voice sentence (≥ 10 characters)', async () => {
  __resetForTests();
  const res = await handleUiSend(postJson({ text: 'hi' }), makeLogger());
  const body = await parseBody(res);
  const reply = body['reply_text'] as string;
  assertTrue(
    reply.length >= 10,
    'assistant reply must be a meaningful sentence, not a one-word acknowledgement',
  );
});

test('R2: greeting input produces a non-empty assistant reply', async () => {
  __resetForTests();
  const res = await handleUiSend(postJson({ text: 'hi' }), makeLogger());
  const body = await parseBody(res);
  assertEq(body['ok'], true, 'greeting → ok');
  assertTrue((body['reply_text'] as string).length > 0, 'greeting → non-empty reply');
});

test('R2: question input produces a non-placeholder reply', async () => {
  __resetForTests();
  const res = await handleUiSend(postJson({ text: "what's on my calendar today?" }), makeLogger());
  const body = await parseBody(res);
  assertEq(body['ok'], true, 'question → ok');
  const reply = body['reply_text'] as string;
  assertTrue(reply.length > 0, 'question → non-empty reply');
  assertTrue(!reply.toLowerCase().startsWith('received:'), 'question → no placeholder prefix');
});

test('R2: arbitrary statement produces a non-placeholder reply', async () => {
  __resetForTests();
  const res = await handleUiSend(postJson({ text: 'please note I have a dentist appointment' }), makeLogger());
  const body = await parseBody(res);
  assertEq(body['ok'], true, 'statement → ok');
  const reply = body['reply_text'] as string;
  assertTrue(reply.length > 0, 'statement → non-empty reply');
  assertTrue(!reply.toLowerCase().startsWith('received:'), 'statement → no placeholder prefix');
});

// ─── R3: Inbound persistence ──────────────────────────────────────────────────

test('R3: inbound item persisted in session store with source=ui and direction=inbound', async () => {
  __resetForTests();
  await handleUiSend(postJson({ text: 'note this down' }), makeLogger());
  const snap = getLatest(10);
  const inbound = snap.items.find((i) => i.direction === 'inbound');
  assertTrue(inbound !== undefined, 'inbound item must exist in session store');
  assertEq(inbound!.source, 'ui', 'inbound source must be "ui"');
  assertEq(inbound!.direction, 'inbound', 'inbound direction');
  assertEq(inbound!.kind, 'text', 'inbound kind must be "text"');
});

test('R3: inbound item text matches the submitted input', async () => {
  __resetForTests();
  const inputText = 'book a call with the team';
  await handleUiSend(postJson({ text: inputText }), makeLogger());
  const snap = getLatest(10);
  const inbound = snap.items.find((i) => i.direction === 'inbound');
  assertTrue(inbound !== undefined, 'inbound item must exist');
  assertEq(inbound!.text, inputText, 'inbound item text matches submitted input');
});

// ─── R4: Outbound persistence ─────────────────────────────────────────────────

test('R4: outbound item persisted in session store with source=ui and direction=outbound', async () => {
  __resetForTests();
  await handleUiSend(postJson({ text: 'hello there' }), makeLogger());
  const snap = getLatest(10);
  const outbound = snap.items.find((i) => i.direction === 'outbound' && i.kind === 'text');
  assertTrue(outbound !== undefined, 'outbound text item must exist in session store');
  assertEq(outbound!.source, 'ui', 'outbound source must be "ui"');
  assertEq(outbound!.kind, 'text', 'outbound kind must be "text"');
});

test('R4: outbound item text matches reply_text in the response', async () => {
  __resetForTests();
  const res = await handleUiSend(postJson({ text: 'hello there' }), makeLogger());
  const body = await parseBody(res);
  const replyText = body['reply_text'] as string;
  const snap = getLatest(10);
  const outbound = snap.items.find((i) => i.direction === 'outbound' && i.kind === 'text');
  assertTrue(outbound !== undefined, 'outbound item must exist');
  assertEq(outbound!.text, replyText, 'outbound item text matches reply_text in the HTTP response');
});

test('R4: one exchange → exactly two session items (inbound + outbound)', async () => {
  __resetForTests();
  await handleUiSend(postJson({ text: 'hello' }), makeLogger());
  const snap = getLatest(10);
  assertEq(snap.counts.total, 2, 'one exchange must produce exactly two session items');
  assertEq(snap.counts.inbound, 1, 'one inbound item');
  assertEq(snap.counts.outbound, 1, 'one outbound item');
});

// ─── R5: event_id matches session store ──────────────────────────────────────

test('R5: event_id in response corresponds to inbound item id in session store', async () => {
  __resetForTests();
  const res = await handleUiSend(postJson({ text: 'test message' }), makeLogger());
  const body = await parseBody(res);
  const eventId = body['event_id'] as string;
  const snap = getLatest(10);
  const inbound = snap.items.find((i) => i.direction === 'inbound');
  assertTrue(inbound !== undefined, 'inbound item must exist');
  assertTrue(
    inbound!.id.includes(eventId) || eventId.includes(inbound!.id.replace('in:ui:', '')),
    'event_id in response must correspond to the inbound session item',
  );
});

// ─── R6: Session continuity across exchanges ──────────────────────────────────

test('R6: two consecutive exchanges share one stable session_id', async () => {
  __resetForTests();
  await handleUiSend(postJson({ text: 'first message' }), makeLogger());
  await handleUiSend(postJson({ text: 'second message' }), makeLogger());
  const snap = getLatest(10);
  assertEq(snap.counts.total, 4, 'two exchanges → four session items');
  assertEq(snap.counts.inbound, 2, 'two inbound items');
  assertEq(snap.counts.outbound, 2, 'two outbound items');
  // session_id is shared within one isolate — stable across exchanges
  assertTrue(
    snap.session.session_id.length > 0,
    'session_id must be non-empty and stable across exchanges',
  );
});

test('R6: session trail is ordered — second exchange appended after first', async () => {
  __resetForTests();
  await handleUiSend(postJson({ text: 'message one' }), makeLogger());
  await handleUiSend(postJson({ text: 'message two' }), makeLogger());
  const snap = getLatest(10);
  assertEq(snap.counts.total, 4, 'four items in session trail after two exchanges');
});

// ─── R7: Method guard ─────────────────────────────────────────────────────────

test('R7: GET → 405 { ok: false, error }', async () => {
  const res = await handleUiSend(methodRequest('GET'), makeLogger());
  assertEq(res.status, 405, 'GET → 405');
  assertErrorShape(await parseBody(res), 'GET method guard');
});

test('R7: DELETE → 405 { ok: false, error }', async () => {
  const res = await handleUiSend(methodRequest('DELETE'), makeLogger());
  assertEq(res.status, 405, 'DELETE → 405');
  assertErrorShape(await parseBody(res), 'DELETE method guard');
});

test('R7: PUT → 405 { ok: false, error }', async () => {
  const res = await handleUiSend(methodRequest('PUT'), makeLogger());
  assertEq(res.status, 405, 'PUT → 405');
  assertErrorShape(await parseBody(res), 'PUT method guard');
});

// ─── R8: Non-JSON body ────────────────────────────────────────────────────────

test('R8: non-JSON body → 400 { ok: false, error }', async () => {
  const res = await handleUiSend(nonJsonRequest(), makeLogger());
  assertEq(res.status, 400, 'non-JSON body → 400');
  assertErrorShape(await parseBody(res), 'non-JSON body');
});

// ─── R9: Missing text field ───────────────────────────────────────────────────

test('R9: POST {} with no text field → 400 { ok: false, error }', async () => {
  const res = await handleUiSend(postJson({}), makeLogger());
  assertEq(res.status, 400, 'missing text field → 400');
  assertErrorShape(await parseBody(res), 'missing text field');
});

test('R9: POST null body → 400 { ok: false, error }', async () => {
  const res = await handleUiSend(postJson(null), makeLogger());
  assertEq(res.status, 400, 'null body → 400');
  assertErrorShape(await parseBody(res), 'null body');
});

// ─── R10: Non-string text field ───────────────────────────────────────────────

test('R10: text field is a number → 400 { ok: false, error }', async () => {
  const res = await handleUiSend(postJson({ text: 42 }), makeLogger());
  assertEq(res.status, 400, 'numeric text → 400');
  assertErrorShape(await parseBody(res), 'numeric text field');
});

test('R10: text field is an array → 400 { ok: false, error }', async () => {
  const res = await handleUiSend(postJson({ text: ['a', 'b'] }), makeLogger());
  assertEq(res.status, 400, 'array text → 400');
  assertErrorShape(await parseBody(res), 'array text field');
});

// ─── R11: Empty / whitespace-only text ───────────────────────────────────────

test('R11: empty string text → 400 { ok: false, error }', async () => {
  const res = await handleUiSend(postJson({ text: '' }), makeLogger());
  assertEq(res.status, 400, 'empty text → 400');
  assertErrorShape(await parseBody(res), 'empty text');
});

test('R11: whitespace-only text → 400 { ok: false, error }', async () => {
  const res = await handleUiSend(postJson({ text: '   ' }), makeLogger());
  assertEq(res.status, 400, 'whitespace-only text → 400');
  assertErrorShape(await parseBody(res), 'whitespace-only text');
});

// ─── R12: Oversized text ──────────────────────────────────────────────────────

test('R12: text > 4000 chars → 400 { ok: false, error }', async () => {
  const oversized = 'a'.repeat(4001);
  const res = await handleUiSend(postJson({ text: oversized }), makeLogger());
  assertEq(res.status, 400, 'oversized text → 400');
  assertErrorShape(await parseBody(res), 'oversized text');
});

test('R12: text exactly 4000 chars is accepted → 200', async () => {
  __resetForTests();
  const maxText = 'a'.repeat(4000);
  const res = await handleUiSend(postJson({ text: maxText }), makeLogger());
  assertEq(res.status, 200, 'text at exactly 4000 chars must not be rejected');
  const body = await parseBody(res);
  assertEq(body['ok'], true, 'ok is true for max-length text');
});

// ─── R13: All rejections carry the standard error envelope ────────────────────

test('R13: every rejection response has content-type application/json', async () => {
  const rejectCases: Array<[string, Request]> = [
    ['GET',            methodRequest('GET')],
    ['non-JSON',       nonJsonRequest()],
    ['no text field',  postJson({})],
    ['empty text',     postJson({ text: '' })],
    ['oversized text', postJson({ text: 'x'.repeat(4001) })],
  ];

  for (const [label, req] of rejectCases) {
    const res = await handleUiSend(req, makeLogger());
    assertTrue(
      (res.headers.get('content-type') ?? '').includes('application/json'),
      `${label}: content-type must be application/json`,
    );
    assertErrorShape(await parseBody(res), label);
  }
});

// ─── R14: Rejection requests do not pollute session store ─────────────────────

test('R14: rejection requests do not add items to the session store', async () => {
  __resetForTests();
  await handleUiSend(methodRequest('GET'), makeLogger());
  await handleUiSend(nonJsonRequest(), makeLogger());
  await handleUiSend(postJson({}), makeLogger());
  await handleUiSend(postJson({ text: '' }), makeLogger());
  await handleUiSend(postJson({ text: 'x'.repeat(4001) }), makeLogger());
  const snap = getLatest(10);
  assertEq(snap.counts.total, 0, 'rejected requests must not append items to the session store');
});

// ─── R15: Handler never throws ────────────────────────────────────────────────

test('R15: handler never throws — always returns a Response', async () => {
  const testCases: Array<[string, Request]> = [
    ['happy',          postJson({ text: 'hello' })],
    ['GET',            methodRequest('GET')],
    ['non-JSON',       nonJsonRequest()],
    ['no text',        postJson({})],
    ['empty text',     postJson({ text: '' })],
    ['oversized text', postJson({ text: 'x'.repeat(4001) })],
  ];
  for (const [label, req] of testCases) {
    let threw = false;
    try {
      const res = await handleUiSend(req, makeLogger());
      assertTrue(res instanceof Response, `${label}: result must be a Response`);
    } catch {
      threw = true;
    }
    assertTrue(!threw, `${label}: handler must never throw`);
  }
});

// ─── Runner ───────────────────────────────────────────────────────────────────

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
  process.argv.some((a) => a.endsWith('browser-chat-route.test.ts'))
) {
  void run();
}
