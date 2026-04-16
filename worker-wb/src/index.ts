import { handleTelegramWebhook } from './routes/telegram-webhook';
import type { TelegramEnv } from './integrations/telegram/types';

interface Env extends TelegramEnv {
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

    return new Response(null, { status: 404 });
  },
};
