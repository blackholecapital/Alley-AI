import { handleTelegramWebhook } from './routes/telegram-webhook';
import { handleSessionLatest } from './routes/session-latest';
import type { TelegramEnv } from './integrations/telegram/types';
import type { TranscriptionEnv } from './providers/transcription/provider';

interface Env extends TelegramEnv, TranscriptionEnv {
  ENVIRONMENT?: string;
  WORKER_VERSION?: string;
  LOG_LEVEL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/telegram/webhook') {
      return handleTelegramWebhook(request, env);
    }

    if (url.pathname === '/session/latest') {
      return handleSessionLatest(request);
    }

    return new Response(null, { status: 404 });
  },
};
