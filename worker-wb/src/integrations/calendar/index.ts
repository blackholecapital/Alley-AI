// Calendar integration boundary.
//
// Owns exactly one calendar action — CALENDAR_LIST_TODAY — and exposes the
// registration used by the shared ActionRouter. The rest of the Worker
// does not import provider.ts directly; it dispatches
// { action_type: CALENDAR_LIST_TODAY } through the router and receives a
// normalized ActionResult back.
//
// Scope lock: no create, no update, no delete, no second action.
//
// Stage 4 S4 (Worker B) tightens the UI-trigger surface: buildCalendarUiView
// produces a compact, pre-formatted view block the operator shell can render
// directly (provider badge, trigger-button enablement, last-result summary).
// The UI never has to re-derive state from the raw invocation.
//
// Ref: build-sheet-EXEC-AI-STAGE3-004 S4 (single calendar action).
// Ref: build-sheet-EXEC-AI-STAGE4-001 S4 (UI-triggerable calendar action).

import type { ActionHandler, ActionResult } from '../../lib/action-router';
import { ActionRouter } from '../../lib/action-router';
import type { Logger } from '../../lib/logging';
import {
  getCalendarProvider,
  parseTimezoneOffset,
  type CalendarEnv,
  type CalendarEvent,
  type CalendarProvider,
  type CalendarProviderStatus,
  type CalendarReadResult,
} from './provider';

export const CALENDAR_LIST_TODAY = 'calendar.list_today';

const FAILURE_REPLY_BY_REASON: Record<string, string> = {
  provider_not_configured:
    "I don't have a calendar connected yet. Ask the operator to set CALENDAR_PROVIDER and I'll pick it up.",
  provider_not_ready:
    "The calendar connection is set up but not ready right now. Try again in a moment.",
  provider_unsupported:
    "That calendar provider isn't supported yet. Ask the operator to pick a supported CALENDAR_PROVIDER.",
  upstream_error:
    "The calendar service returned an error. I've logged it for the operator.",
  invalid_window:
    "I couldn't read a valid time window for today. I've logged it for the operator.",
};

function formatTimeRange(
  event: CalendarEvent,
  offsetMinutes: number,
): string {
  const start = new Date(event.start_iso);
  const end = new Date(event.end_iso);
  const startLocal = new Date(start.getTime() + offsetMinutes * 60_000);
  const endLocal = new Date(end.getTime() + offsetMinutes * 60_000);
  const hh = (d: Date) =>
    `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return `${hh(startLocal)}–${hh(endLocal)}`;
}

export function formatScheduleReply(
  result: CalendarReadResult,
  offsetMinutes: number,
): string {
  if (!result.ok) {
    const canned = FAILURE_REPLY_BY_REASON[result.reason];
    if (canned) return canned;
    return `I couldn't read today's schedule (${result.reason}).`;
  }

  if (result.events.length === 0) {
    return "Today's schedule is clear. Nothing on the calendar from the connected provider.";
  }

  const lines = result.events.map((ev) => {
    const range = formatTimeRange(ev, offsetMinutes);
    const location = ev.location ? ` — ${ev.location}` : '';
    return `• ${range}  ${ev.title}${location}`;
  });

  const header =
    result.events.length === 1
      ? 'Here is today\'s single event:'
      : `Here are today's ${result.events.length} events:`;

  return `${header}\n${lines.join('\n')}`;
}

export function buildCalendarListTodayHandler(
  provider: CalendarProvider,
  offsetMinutes: number,
): ActionHandler {
  return async function handler(_req, logger: Logger): Promise<ActionResult> {
    const providerStatus = provider.status();
    if (!provider.ready) {
      logger.warn('calendar.action.provider_not_ready', {
        provider: providerStatus.provider,
        reason: providerStatus.reason,
      });
      return {
        ok: false,
        action_type: CALENDAR_LIST_TODAY,
        reply_text:
          FAILURE_REPLY_BY_REASON[providerStatus.reason ?? 'provider_not_ready'] ??
          "The calendar isn't ready right now.",
        error: {
          code: 'provider_not_ready',
          message: providerStatus.reason ?? 'provider_not_ready',
          detail: providerStatus.detail,
        },
        payload: { provider: providerStatus },
        handled_at: new Date().toISOString(),
      };
    }

    const read = await provider.readTodaysSchedule({
      now: new Date(),
      timezone_offset_minutes: offsetMinutes,
    });

    if (!read.ok) {
      logger.error('calendar.action.read_failed', {
        provider: read.provider,
        reason: read.reason,
        detail: read.detail,
      });
      return {
        ok: false,
        action_type: CALENDAR_LIST_TODAY,
        reply_text: formatScheduleReply(read, offsetMinutes),
        error: {
          code: 'provider_error',
          message: read.reason,
          detail: read.detail,
        },
        payload: { provider: { provider: read.provider, ready: false } },
        handled_at: new Date().toISOString(),
      };
    }

    logger.info('calendar.action.read_ok', {
      provider: read.provider,
      event_count: read.events.length,
    });

    return {
      ok: true,
      action_type: CALENDAR_LIST_TODAY,
      reply_text: formatScheduleReply(read, offsetMinutes),
      payload: {
        provider: { provider: read.provider, ready: true },
        window: read.window,
        events: read.events,
        event_count: read.events.length,
        fetched_at: read.fetched_at,
      },
      handled_at: new Date().toISOString(),
    };
  };
}

export interface CalendarRegistrationOptions {
  env: CalendarEnv;
  providerOverride?: CalendarProvider;
}

export function registerCalendarActions(
  router: ActionRouter,
  opts: CalendarRegistrationOptions,
): { provider: CalendarProvider; offset_minutes: number } {
  const provider = opts.providerOverride ?? getCalendarProvider(opts.env);
  const offsetMinutes = parseTimezoneOffset(opts.env);

  router.register({
    action_type: CALENDAR_LIST_TODAY,
    description: "Read today's schedule from the configured calendar provider.",
    handler: buildCalendarListTodayHandler(provider, offsetMinutes),
  });

  return { provider, offset_minutes: offsetMinutes };
}

// ────────────────────────────────────────────────────────────────────
// Stage 4 S4: UI view block
//
// The operator UI polls /calendar/status and renders a provider badge,
// a trigger button, and a last-result badge. Shaping that data lives
// here so every call site (GET status, POST trigger, tests) produces
// an identical, UI-ready view. No string derivation in the browser.
// ────────────────────────────────────────────────────────────────────

export type CalendarUiProviderState =
  | 'ready'
  | 'not_configured'
  | 'unsupported'
  | 'not_ready';

export type CalendarUiLastState = 'ok' | 'failed' | 'none';

export interface CalendarUiView {
  provider: {
    state: CalendarUiProviderState;
    label: string;
    detail: string;
  };
  trigger: {
    enabled: boolean;
    action_type: string;
    label: string;
    hint: string;
  };
  last_result: {
    state: CalendarUiLastState;
    summary: string;
    handled_at: string | null;
    error_code: string | null;
  };
}

function providerUiState(status: CalendarProviderStatus): CalendarUiProviderState {
  if (status.ready) return 'ready';
  if (status.reason === 'provider_not_configured') return 'not_configured';
  if (status.reason === 'provider_unsupported') return 'unsupported';
  return 'not_ready';
}

function providerLabel(status: CalendarProviderStatus): string {
  if (status.ready) return `${status.provider} (ready)`;
  if (status.reason === 'provider_not_configured') return 'not configured';
  if (status.reason === 'provider_unsupported') return `${status.provider} (unsupported)`;
  return `${status.provider} (not ready)`;
}

function triggerHint(status: CalendarProviderStatus): string {
  if (status.ready) return '';
  if (status.reason === 'provider_not_configured') {
    return 'Set CALENDAR_PROVIDER to enable the calendar action.';
  }
  if (status.reason === 'provider_unsupported') {
    return 'CALENDAR_PROVIDER is set to an unsupported value.';
  }
  return 'Calendar provider is not ready.';
}

function lastResultSummary(result: ActionResult | null): {
  state: CalendarUiLastState;
  summary: string;
  handled_at: string | null;
  error_code: string | null;
} {
  if (!result) {
    return { state: 'none', summary: 'No calendar action yet.', handled_at: null, error_code: null };
  }
  if (result.ok) {
    const count = (result.payload?.event_count as number | undefined) ?? 0;
    const noun = count === 1 ? 'event' : 'events';
    return {
      state: 'ok',
      summary: count === 0
        ? "Today's schedule is clear."
        : `Listed ${count} ${noun} for today.`,
      handled_at: result.handled_at ?? null,
      error_code: null,
    };
  }
  return {
    state: 'failed',
    summary: result.reply_text,
    handled_at: result.handled_at ?? null,
    error_code: result.error?.code ?? null,
  };
}

export function buildCalendarUiView(
  providerStatus: CalendarProviderStatus,
  lastResult: ActionResult | null,
): CalendarUiView {
  return {
    provider: {
      state: providerUiState(providerStatus),
      label: providerLabel(providerStatus),
      detail: providerStatus.detail ?? '',
    },
    trigger: {
      enabled: providerStatus.ready,
      action_type: CALENDAR_LIST_TODAY,
      label: "List today's schedule",
      hint: triggerHint(providerStatus),
    },
    last_result: lastResultSummary(lastResult),
  };
}

export type { CalendarEnv, CalendarProvider, CalendarReadResult } from './provider';
