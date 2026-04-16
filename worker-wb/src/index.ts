import { handleTelegramWebhook } from './routes/telegram-webhook';
import { handleSessionLatest } from './routes/session-latest';
import { handleHealth } from './routes/health';
import { handleUiSend } from './routes/ui-send';
import type { TelegramEnv } from './integrations/telegram/types';
import type { TranscriptionEnv } from './providers/transcription/provider';
import { createLogger, extractCorrelationId } from './lib/logging';

interface Env extends TelegramEnv, TranscriptionEnv {
  ENVIRONMENT?: string;
  WORKER_VERSION?: string;
  LOG_LEVEL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const correlationId = extractCorrelationId(request);
    const startedAt = Date.now();

    const logger = createLogger(env, correlationId, {
      method: request.method,
      path: url.pathname,
    });

    logger.info('request.start');

    let response: Response;
    try {
      if (url.pathname === '/telegram/webhook') {
        response = await handleTelegramWebhook(request, env, logger);
      } else if (url.pathname === '/session/latest') {
        response = handleSessionLatest(request, logger);
      } else if (url.pathname === '/health') {
        response = handleHealth(request, logger);
      } else if (url.pathname === '/ui/send') {
        response = await handleUiSend(request, logger);
      } else {
        response = new Response(null, { status: 404 });
      }
    } catch (err) {
      logger.error('request.unhandled_error', {
        error: err instanceof Error ? err.message : String(err),
      });
      response = new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'internal_error', message: 'unhandled error' },
          correlation_id: correlationId,
        }),
        {
          status: 500,
          headers: {
            'content-type': 'application/json',
            'x-correlation-id': correlationId,
          },
        },
      );
    }

    logger.info('request.end', {
      status: response.status,
      duration_ms: Date.now() - startedAt,
    });

    if (!response.headers.has('x-correlation-id')) {
      const patched = new Response(response.body, response);
      patched.headers.set('x-correlation-id', correlationId);
      return patched;
    }

    return response;
  },
};
