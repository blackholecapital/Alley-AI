import { routeRequest } from "./router";
import {
  preflightResponse,
  withResponseHeaders,
} from "./middleware/cors";
import {
  createLogger,
  extractCorrelationId,
} from "./lib/logging";
import type { AppEnv } from "./types/env";

export default {
  async fetch(request: Request, env: AppEnv): Promise<Response> {
    if (request.method === "OPTIONS") {
      return preflightResponse();
    }

    const url = new URL(request.url);
    const correlationId = extractCorrelationId(request);
    const startedAt = Date.now();

    const logger = createLogger(env, correlationId, {
      method: request.method,
      path: url.pathname,
    });

    logger.info("request.start");

    let response: Response;

    try {
      response = await routeRequest(request, env, logger);
    } catch (error) {
      logger.error("request.unhandled_error", {
        error: error instanceof Error ? error.message : String(error),
      });

      response = new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "internal_error",
            message:
              error instanceof Error ? error.message : String(error),
          },
          correlation_id: correlationId,
        }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        }
      );
    }

    logger.info("request.end", {
      status: response.status,
      duration_ms: Date.now() - startedAt,
    });

    return withResponseHeaders(response, correlationId);
  },
};
