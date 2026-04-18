// In-isolate session store.
// Holds recent inbound and outbound message items plus a rolling session
// identity so the operator UI can render the live text loop without any
// external state. Bounded ring buffer; isolate-local only.
//
// Cloudflare Workers disallow non-deterministic operations (crypto.randomUUID,
// new Date(), Date.now(), timers, network I/O) at module top-level. All such
// calls in this module happen lazily on the first request that needs them,
// inside explicitly invoked functions — never at global scope.
//
// Ref: build-sheet-EXEC-AI-STAGE2-003 S3 + S5 (global-scope I/O fix).

import type { InternalEvent } from '../integrations/telegram/types';

export type SessionItemSource = 'telegram' | 'ui';

export interface SessionItem {
  id: string;
  direction: 'inbound' | 'outbound';
  source: SessionItemSource;
  kind: 'text' | 'voice' | 'other' | 'failure';
  chat_id: number;
  message_id: number | null;
  user_id: number | null;
  username: string | null;
  text: string | null;
  at: string;
}

export interface SessionSnapshot {
  session: {
    session_id: string;
    started_at: string;
    last_event_at: string | null;
  };
  items: SessionItem[];
  counts: {
    inbound: number;
    outbound: number;
    total: number;
  };
}

const MAX_ITEMS = 50;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

// Deterministic module state only. Any value that requires crypto.randomUUID
// or the wall clock is populated on first access, never at load time.
let sessionId: string | null = null;
let startedAt: string | null = null;
const items: SessionItem[] = [];
const counts = { inbound: 0, outbound: 0, total: 0 };

interface SessionIdentity {
  sessionId: string;
  startedAt: string;
}

function ensureSessionIdentity(): SessionIdentity {
  if (sessionId === null || startedAt === null) {
    sessionId = crypto.randomUUID();
    startedAt = new Date().toISOString();
  }
  return { sessionId, startedAt };
}

function push(item: SessionItem): void {
  // Touch identity on first write so session.started_at reflects the first
  // observed event rather than module load.
  ensureSessionIdentity();
  items.push(item);
  if (items.length > MAX_ITEMS) {
    items.splice(0, items.length - MAX_ITEMS);
  }
  counts[item.direction] += 1;
  counts.total += 1;
}

export function recordInbound(event: InternalEvent): SessionItem {
  const item: SessionItem = {
    id: `in:${event.id}`,
    direction: 'inbound',
    source: event.source,
    kind: event.kind,
    chat_id: event.chat_id,
    message_id: event.message_id,
    user_id: event.user_id,
    username: event.username,
    text: event.text,
    at: event.received_at,
  };
  push(item);
  return item;
}

export interface OutboundRecord {
  event_id: string;
  chat_id: number;
  reply_to_message_id: number | null;
  sent_message_id: number | null;
  text: string;
  at?: string;
}

export function recordOutbound(record: OutboundRecord): SessionItem {
  const item: SessionItem = {
    id: `out:${record.event_id}`,
    direction: 'outbound',
    source: 'telegram',
    kind: 'text',
    chat_id: record.chat_id,
    message_id: record.sent_message_id,
    user_id: null,
    username: null,
    text: record.text,
    at: record.at ?? new Date().toISOString(),
  };
  push(item);
  return item;
}

// Failure state recording. Persists readable failure events so /session/latest
// surfaces them in the event trail alongside normal inbound/outbound items.
// A failure item is direction='outbound' kind='failure' so the UI can render
// it as a terminal step in the exchange without special casing.

export interface FailureRecord {
  event_id: string;
  chat_id: number;
  failure_code: string;
  failure_message: string;
  source?: SessionItemSource;
  at?: string;
}

export function recordFailure(record: FailureRecord): SessionItem {
  const item: SessionItem = {
    id: `fail:${record.event_id}`,
    direction: 'outbound',
    source: record.source ?? 'telegram',
    kind: 'failure',
    chat_id: record.chat_id,
    message_id: null,
    user_id: null,
    username: null,
    text: `[${record.failure_code}] ${record.failure_message}`,
    at: record.at ?? new Date().toISOString(),
  };
  push(item);
  return item;
}

// UI channel helpers. The browser operator UI does not carry a Telegram
// chat_id/message_id and cannot present the webhook secret, so its events
// are recorded here with source='ui' and a synthetic chat_id. These helpers
// stay isolate-local (no network I/O, no module-top-level side effects).

const UI_CHAT_ID = 0;

export interface UiInboundInput {
  text: string;
  at?: string;
}

export function recordUiInbound(input: UiInboundInput): SessionItem {
  ensureSessionIdentity();
  const eventId = crypto.randomUUID();
  const item: SessionItem = {
    id: `in:ui:${eventId}`,
    direction: 'inbound',
    source: 'ui',
    kind: 'text',
    chat_id: UI_CHAT_ID,
    message_id: null,
    user_id: null,
    username: null,
    text: input.text,
    at: input.at ?? new Date().toISOString(),
  };
  push(item);
  return item;
}

export interface UiOutboundInput {
  event_id: string;
  text: string;
  at?: string;
}

export function recordUiOutbound(input: UiOutboundInput): SessionItem {
  ensureSessionIdentity();
  const item: SessionItem = {
    id: `out:ui:${input.event_id}`,
    direction: 'outbound',
    source: 'ui',
    kind: 'text',
    chat_id: UI_CHAT_ID,
    message_id: null,
    user_id: null,
    username: null,
    text: input.text,
    at: input.at ?? new Date().toISOString(),
  };
  push(item);
  return item;
}

export function getLatest(limit: number = DEFAULT_LIMIT): SessionSnapshot {
  const identity = ensureSessionIdentity();
  const effective = Math.min(Math.max(1, Math.trunc(limit)), MAX_LIMIT);
  const tail = items.slice(-effective).reverse();
  const lastEventAt = items.length > 0 ? items[items.length - 1]!.at : null;
  return {
    session: {
      session_id: identity.sessionId,
      started_at: identity.startedAt,
      last_event_at: lastEventAt,
    },
    items: tail,
    counts: { ...counts },
  };
}

// Test-only reset; not exported from the module surface used by routes.
export function __resetForTests(): void {
  items.splice(0, items.length);
  counts.inbound = 0;
  counts.outbound = 0;
  counts.total = 0;
  sessionId = null;
  startedAt = null;
}
