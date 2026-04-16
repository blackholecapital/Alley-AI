// Health route.
// Returns HTTP 200 with a minimal success payload so Cloudflare and operators
// can confirm the Worker is reachable on the live route without exercising
// Telegram, session, or provider paths.
// Ref: build-sheet-EXEC-AI-STAGE2-003 S5 + required_public_test_routes (/health).

import { errorResponse, jsonResponse } from '../lib/errors';
import type { Logger } from '../lib/logging';

export function handleHealth(request: Request, logger: Logger): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    logger.warn('health.method_not_allowed', { method: request.method });
    return errorResponse('method_not_allowed', {
      message: 'GET or HEAD required',
      correlationId: logger.correlationId,
    });
  }

  logger.debug('health.served');

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
    { ok: true, status: 'ok' },
    {
      correlationId: logger.correlationId,
      headers: { 'cache-control': 'no-store' },
    },
  );
}
