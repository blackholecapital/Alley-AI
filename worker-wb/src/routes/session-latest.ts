// Session latest route.
// Returns a JSON snapshot of recent inbound/outbound items, session identity,
// and last-event timestamp for the operator UI to render the live text loop.
// Ref: build-sheet-EXEC-AI-STAGE2-003 S3.

import { getLatest } from '../lib/session-store';

export function handleSessionLatest(request: Request): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('method not allowed', { status: 405 });
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
  const body = JSON.stringify({ ok: true, ...snapshot });

  return new Response(request.method === 'HEAD' ? null : body, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}
