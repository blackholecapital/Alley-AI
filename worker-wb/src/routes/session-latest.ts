// Session latest route.
// Returns a JSON snapshot of recent inbound/outbound items, session identity,
// and last-event timestamp for the operator UI to render the live text loop.
// Emits a structured log line per request and carries correlation_id through
// the response body and x-correlation-id header.
// Ref: build-sheet-EXEC-AI-STAGE2-003 S3 + S5.

import { getLatest } from '../lib/session-store';
import { errorResponse, jsonResponse } from '../lib/errors';
import type { Logger } from '../lib/logging';

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

  logger.debug('session.latest.served', {
    items: snapshot.items.length,
    total: snapshot.counts.total,
    last_event_at: snapshot.session.last_event_at,
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
    { ok: true, ...snapshot },
    {
      correlationId: logger.correlationId,
      headers: { 'cache-control': 'no-store' },
    },
  );
}
