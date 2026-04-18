// Calendar status route.
//
// Public runtime surface for the single calendar action boundary. Operators
// and the UI hit:
//   GET  /calendar/status         → provider readiness, no side effects
//   GET  /calendar/status?run=1   → UI trigger for the single action
//   HEAD /calendar/status         → readiness probe, no body
//
// All read/trigger variants return HTTP 200 regardless of provider state.
// Failure is a value returned inside the body (invocation.ok=false), never
// a thrown exception and never a non-200 status. The body always carries a
// pre-formatted `ui` block (provider badge, trigger enablement, last-result
// summary) so the operator shell can render the calendar surface without
// re-deriving state from raw invocations.
//
// Stage 4 S4 (Worker B) tightening: the `ui` view block, the `triggered_by`
// discriminator, and pinned UI-facing test coverage. The HTTP method
// surface is unchanged from Stage 3 (POST remains 405) to preserve the
// Stage 3 contract. The UI trigger is GET /calendar/status?run=1.
//
// Ref: build-sheet-EXEC-AI-STAGE3-004 S4 (single calendar action).
// Ref: build-sheet-EXEC-AI-STAGE4-001 S4 (UI-triggerable calendar action).

import {
  ActionRouter,
  type ActionResult,
} from '../lib/action-router';
import { errorResponse, jsonResponse } from '../lib/errors';
import type { Logger } from '../lib/logging';
import {
  CALENDAR_LIST_TODAY,
  buildCalendarUiView,
  registerCalendarActions,
  type CalendarEnv,
} from '../integrations/calendar';

export type CalendarStatusEnv = CalendarEnv;

let lastResult: ActionResult | null = null;

export function __resetCalendarStatusForTests(): void {
  lastResult = null;
}

function truthy(value: string | null): boolean {
  if (value === null) return false;
  const normalized = value.toLowerCase().trim();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export async function handleCalendarStatus(
  request: Request,
  env: CalendarStatusEnv,
  logger: Logger,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    logger.warn('calendar.status.method_not_allowed', { method: request.method });
    return errorResponse('method_not_allowed', {
      message: 'GET or HEAD required',
      correlationId: logger.correlationId,
    });
  }

  const router = new ActionRouter();
  const { provider, offset_minutes } = registerCalendarActions(router, { env });
  const providerStatus = provider.status();

  const url = new URL(request.url);
  const runParam = truthy(url.searchParams.get('run'));
  const shouldRun = runParam && request.method === 'GET';

  let invocation: ActionResult | null = null;
  if (shouldRun) {
    invocation = await router.dispatch(
      {
        action_type: CALENDAR_LIST_TODAY,
        correlation_id: logger.correlationId,
      },
      logger,
    );
    lastResult = invocation;
  }

  const triggeredBy: 'none' | 'get_run' = shouldRun ? 'get_run' : 'none';

  const ui = buildCalendarUiView(providerStatus, lastResult);

  logger.debug('calendar.status.served', {
    method: request.method,
    provider: providerStatus.provider,
    provider_ready: providerStatus.ready,
    triggered_by: triggeredBy,
    invocation_ok: invocation?.ok ?? null,
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
    {
      ok: true,
      provider: providerStatus,
      action: {
        action_type: CALENDAR_LIST_TODAY,
        registered: router.has(CALENDAR_LIST_TODAY),
      },
      config: {
        timezone_offset_minutes: offset_minutes,
      },
      triggered_by: triggeredBy,
      invocation,
      last_result: lastResult,
      ui,
    },
    {
      correlationId: logger.correlationId,
      headers: { 'cache-control': 'no-store' },
    },
  );
}
