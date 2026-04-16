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

export interface SessionItem {
  id: string;
  direction: 'inbound' | 'outbound';
  source: 'telegram';
  kind: 'text' | 'voice' | 'other';
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
