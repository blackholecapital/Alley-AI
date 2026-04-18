// Session latest route.
//
// Returns a JSON snapshot of recent inbound/outbound items, session identity,
// and last-event timestamp for the operator UI to render the live event trail.
// Emits a structured log line per request and carries correlation_id through
// the response body and x-correlation-id header.
//
// Stage 4 S5 (Worker B) adds a `pipeline` block that maps session items to
// named pipeline states with timestamps and compact labels. The UI renders
// these directly without re-parsing raw item fields.
//
// Pipeline state model (Stage 4):
//
//   received      — inbound event recorded in the session store (text or voice)
//   replied       — outbound text reply sent back to the user
//   failed        — failure event recorded (any failure_code)
//   idle          — no events recorded yet in this isolate session
//
// States surfaced by voice capture (client-side; these appear in the
// voice-capture.js UI badge, not in the session store):
//   recording     — browser is capturing audio
//   transcribing  — Worker is calling the transcription provider
//   processing    — Worker is generating the assistant reply
//   action-called — Worker dispatched a calendar or other action
//
// Those four states are documented in the checklist
// (/job_site/ui_stage4_demo_checklist.txt) with the pipeline recording
// changes needed to surface them in /session/latest as well.
//
// Ref: build-sheet-EXEC-AI-STAGE2-003 S3 + S5.
// Ref: build-sheet-EXEC-AI-STAGE4-001 S5 (pipeline state surface).

import { getLatest } from '../lib/session-store';
import type { SessionItem } from '../lib/session-store';
import { errorResponse, jsonResponse } from '../lib/errors';
import type { Logger } from '../lib/logging';

// ────────────────────────────────────────────────────────────────────
// Pipeline state derivation
// ────────────────────────────────────────────────────────────────────

export type PipelineState =
  | 'received'
  | 'replied'
  | 'failed'
  | 'idle';

export interface PipelineStateEntry {
  item_id: string;
  state: PipelineState;
  label: string;
  at: string;
  kind: string;
  source: string;
}

export interface PipelineView {
  current_state: PipelineState;
  current_label: string;
  updated_at: string | null;
  trail: PipelineStateEntry[];
}

const LABEL_PREVIEW = 80;

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function itemState(item: SessionItem): PipelineState {
  if (item.direction === 'inbound') return 'received';
  if (item.kind === 'failure') return 'failed';
  return 'replied';
}

function itemLabel(item: SessionItem): string {
  if (item.direction === 'inbound') {
    if (item.kind === 'voice') {
      return item.text
        ? `Voice: "${truncate(item.text, LABEL_PREVIEW)}"`
        : 'Voice note received';
    }
    if (item.kind === 'text') {
      return item.text
        ? `Text: "${truncate(item.text, LABEL_PREVIEW)}"`
        : 'Text message received';
    }
    return 'Message received';
  }
  if (item.kind === 'failure') {
    const codeMatch = item.text?.match(/^\[([^\]]+)\]/);
    const code = codeMatch?.[1] ?? 'error';
    const msg = item.text
      ? truncate(item.text.slice((codeMatch?.[0]?.length ?? 0) + 1).trim(), LABEL_PREVIEW)
      : 'unknown failure';
    return `Failed (${code}): ${msg}`;
  }
  // outbound text
  return item.text
    ? truncate(item.text, LABEL_PREVIEW)
    : 'Reply sent';
}

function buildPipelineView(items: SessionItem[]): PipelineView {
  if (items.length === 0) {
    return {
      current_state: 'idle',
      current_label: 'No events yet.',
      updated_at: null,
      trail: [],
    };
  }

  // items are newest-first from getLatest
  const trail: PipelineStateEntry[] = items.map((item) => ({
    item_id: item.id,
    state: itemState(item),
    label: itemLabel(item),
    at: item.at,
    kind: item.kind,
    source: item.source,
  }));

  const first = trail[0]!;
  return {
    current_state: first.state,
    current_label: first.label,
    updated_at: first.at,
    trail,
  };
}

// ────────────────────────────────────────────────────────────────────
// Route handler
// ────────────────────────────────────────────────────────────────────

export function handleSessionLatest(request: Request, logger: Logger): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    logger.warn('session.latest.method_not_allowed', { method: request.method });
    return errorResponse('method_not_allowed', {
      message: 'GET or HEAD required',
      correlationId: logger.correlationId,
    });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  let limit = 25;
  if (limitParam !== null) {
    const parsed = Number.parseInt(limitParam, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = parsed;
    }
  }

  const snapshot = getLatest(limit);
  const pipeline = buildPipelineView(snapshot.items);

  logger.debug('session.latest.served', {
    items: snapshot.items.length,
    total: snapshot.counts.total,
    last_event_at: snapshot.session.last_event_at,
    pipeline_state: pipeline.current_state,
  });

  if (request.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': logger.correlationId,
        'cache-control': 'no-store',
      },
    });
  }

  return jsonResponse(
    { ok: true, ...snapshot, pipeline },
    {
      correlationId: logger.correlationId,
      headers: { 'cache-control': 'no-store' },
    },
  );
}
