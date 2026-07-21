import { handleTelegramWebhook } from "./routes/telegram-webhook";
import { handleSessionLatest } from "./routes/session-latest";
import { handleHealth } from "./routes/health";
import { handleUiSend } from "./routes/ui-send";
import { handleCalendarStatus } from "./routes/calendar-status";
import { handleVoiceCapture } from "./integrations/telegram/voice";
import { demoSmsRoute } from "./routes/demo-sms";
import { demoLeadsRoute } from "./routes/demo-leads";
import { demoBusinessCardRoute } from "./routes/demo-business-card";
import type { Logger } from "./lib/logging";
import type { AppEnv } from "./types/env";

export async function routeRequest(
  request: Request,
  env: AppEnv,
  logger: Logger
): Promise<Response> {
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname}`;

  switch (route) {
    case "POST /telegram/webhook":
      return handleTelegramWebhook(request, env, logger);

    case "GET /session/latest":
    case "HEAD /session/latest":
      return handleSessionLatest(request, logger);

    case "GET /health":
    case "HEAD /health":
      return handleHealth(request, logger);

    case "GET /calendar/status":
    case "HEAD /calendar/status":
      return handleCalendarStatus(request, env, logger);

    case "POST /ui/send":
      return handleUiSend(request, logger);

    case "POST /voice/capture":
      return handleVoiceCapture(request, env, logger);

    case "POST /internal/demo/sms":
      return demoSmsRoute(request, env);

    case "GET /internal/demo/leads":
      return demoLeadsRoute(env);

    case "POST /internal/demo/business-card":
      return demoBusinessCardRoute(request, env);


    default:
      return new Response(
        JSON.stringify({ ok: false, error: "not_found" }),
        {
          status: 404,
          headers: { "content-type": "application/json" },
        }
      );
  }
}
