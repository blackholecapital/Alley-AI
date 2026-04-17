// Calendar status route.
//
// Public runtime surface for the single calendar action boundary. Operators
// and the UI hit GET /calendar/status to see:
//   - which provider is wired (name + ready)
//   - the registered action type (exactly one in Stage 3 scope)
//   - the most recent invocation outcome from this isolate (if any)
//
// An optional `?run=1` query parameter dispatches the single action and
// returns its ActionResult in the same payload so the operator demo can
// exercise the whole boundary with one request. When `run` is absent the
// route returns provider readiness only (no side effects).
//
// This route NEVER throws: any error path is rendered through the shared
// errorResponse helper or folded into the JSON body as a readable failure.
//
// Ref: build-sheet-EXEC-AI-STAGE3-004 S4 (single calendar action + runtime
//      status route). required_public_test_routes includes /calendar/status.

import {
  ActionRouter,
  type ActionResult,
} from '../lib/action-router';
import { errorResponse, jsonResponse } from '../lib/errors';
import type { Logger } from '../lib/logging';
import {
  CALENDAR_LIST_TODAY,
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
  const shouldRun = truthy(url.searchParams.get('run'));

  let invocation: ActionResult | null = null;
  if (shouldRun && request.method === 'GET') {
    invocation = await router.dispatch(
      { action_type: CALENDAR_LIST_TODAY, correlation_id: logger.correlationId },
      logger,
    );
    lastResult = invocation;
  }

  logger.debug('calendar.status.served', {
    provider: providerStatus.provider,
    provider_ready: providerStatus.ready,
    ran: invocation !== null,
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
      invocation,
      last_result: lastResult,
    },
    {
      correlationId: logger.correlationId,
      headers: { 'cache-control': 'no-store' },
    },
  );
}
