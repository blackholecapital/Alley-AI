// Calendar provider contract.
//
// All calendar adapters implement CalendarProvider. The Worker pipeline
// does not depend on a specific vendor — it only depends on this
// interface. Missing/invalid configuration is a first-class outcome
// returned as CalendarReadResult.ok=false, not an exception.
//
// Scope lock: exactly one read-only action (list today's schedule). Only
// readTodaysSchedule is declared. No create, no update, no delete.
//
// Stage 4 S4 (Worker B) keeps this contract intact but documents that
// CalendarProviderStatus is the canonical source of truth for the UI
// badge — handler and UI view both read it through the same shape.
//
// Ref: build-sheet-EXEC-AI-STAGE3-004 S4 (single calendar action).
// Ref: build-sheet-EXEC-AI-STAGE4-001 S4 (UI-triggerable calendar action).

export interface CalendarEvent {
  event_id: string;
  title: string;
  start_iso: string;
  end_iso: string;
  location?: string;
  attendees?: string[];
  status: 'confirmed' | 'tentative' | 'cancelled';
}

export type CalendarFailureReason =
  | 'provider_not_configured'
  | 'provider_not_ready'
  | 'provider_unsupported'
  | 'upstream_error'
  | 'invalid_window';

export type CalendarReadResult =
  | {
      ok: true;
      provider: string;
      window: { from_iso: string; to_iso: string };
      events: CalendarEvent[];
      fetched_at: string;
    }
  | {
      ok: false;
      provider: string;
      reason: CalendarFailureReason;
      detail: string;
      retryable: boolean;
    };

export interface CalendarProviderStatus {
  provider: string;
  ready: boolean;
  reason?: CalendarFailureReason;
  detail?: string;
}

export interface CalendarReadRequest {
  now: Date;
  timezone_offset_minutes?: number;
}

export interface CalendarProvider {
  readonly name: string;
  readonly ready: boolean;
  status(): CalendarProviderStatus;
  readTodaysSchedule(req: CalendarReadRequest): Promise<CalendarReadResult>;
}

export interface CalendarEnv {
  CALENDAR_PROVIDER?: string;
  CALENDAR_TIMEZONE_OFFSET_MINUTES?: string;
}

// ────────────────────────────────────────────────────────────────────
// Unconfigured provider — safe default when no vendor is wired.
// Reports not-ready and returns a clean, readable failure from the
// read boundary. Never throws.
// ────────────────────────────────────────────────────────────────────

export class UnconfiguredCalendarProvider implements CalendarProvider {
  readonly name = 'unconfigured';
  readonly ready = false;

  status(): CalendarProviderStatus {
    return {
      provider: this.name,
      ready: false,
      reason: 'provider_not_configured',
      detail: 'CALENDAR_PROVIDER is not set; no calendar backend is wired.',
    };
  }

  async readTodaysSchedule(_req: CalendarReadRequest): Promise<CalendarReadResult> {
    return {
      ok: false,
      provider: this.name,
      reason: 'provider_not_configured',
      detail: 'CALENDAR_PROVIDER is not set; no calendar backend is wired.',
      retryable: false,
    };
  }
}

// ────────────────────────────────────────────────────────────────────
// Demo provider — deterministic, in-isolate seed for the golden path.
// Serves read-only events anchored to the request's `now` so operator
// demos always look current without any external service.
//
// Schedule pattern inspired by executive_assistant_runtime seed data
// (job_site/executive_assistant_runtime/actions/calendar_provider.py),
// re-expressed in TypeScript for the Worker runtime.
// ────────────────────────────────────────────────────────────────────

interface SeedEvent {
  event_id: string;
  title: string;
  hour: number;
  minute: number;
  duration_minutes: number;
  location?: string;
  attendees?: string[];
}

const DEMO_SEED: SeedEvent[] = [
  {
    event_id: 'demo-001',
    title: 'Team standup',
    hour: 9,
    minute: 0,
    duration_minutes: 15,
    location: 'Zoom',
    attendees: ['alice@example.com', 'bob@example.com'],
  },
  {
    event_id: 'demo-002',
    title: 'Product review',
    hour: 14,
    minute: 0,
    duration_minutes: 60,
    location: 'Conf Room A',
    attendees: ['alice@example.com', 'carol@example.com'],
  },
  {
    event_id: 'demo-003',
    title: '1:1 with Alex',
    hour: 16,
    minute: 30,
    duration_minutes: 30,
    attendees: ['alice@example.com', 'alex@example.com'],
  },
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function startOfLocalDay(now: Date, offsetMinutes: number): Date {
  const localMs = now.getTime() + offsetMinutes * 60_000;
  const localDay = new Date(localMs);
  localDay.setUTCHours(0, 0, 0, 0);
  return new Date(localDay.getTime() - offsetMinutes * 60_000);
}

function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000);
}

export class DemoCalendarProvider implements CalendarProvider {
  readonly name = 'demo';
  readonly ready = true;

  status(): CalendarProviderStatus {
    return { provider: this.name, ready: true };
  }

  async readTodaysSchedule(req: CalendarReadRequest): Promise<CalendarReadResult> {
    if (!(req.now instanceof Date) || Number.isNaN(req.now.getTime())) {
      return {
        ok: false,
        provider: this.name,
        reason: 'invalid_window',
        detail: 'request.now is not a valid Date',
        retryable: false,
      };
    }

    const offsetMinutes = req.timezone_offset_minutes ?? 0;
    const dayStartUtc = startOfLocalDay(req.now, offsetMinutes);
    const dayEndUtc = addMinutes(dayStartUtc, 24 * 60);

    const events: CalendarEvent[] = DEMO_SEED.map((seed) => {
      const start = addMinutes(dayStartUtc, seed.hour * 60 + seed.minute);
      const end = addMinutes(start, seed.duration_minutes);
      return {
        event_id: seed.event_id,
        title: seed.title,
        start_iso: start.toISOString(),
        end_iso: end.toISOString(),
        location: seed.location,
        attendees: seed.attendees,
        status: 'confirmed',
      };
    });

    events.sort((a, b) => a.start_iso.localeCompare(b.start_iso));

    return {
      ok: true,
      provider: this.name,
      window: {
        from_iso: dayStartUtc.toISOString(),
        to_iso: dayEndUtc.toISOString(),
      },
      events,
      fetched_at: new Date().toISOString(),
    };
  }
}

// ────────────────────────────────────────────────────────────────────
// Provider factory
// ────────────────────────────────────────────────────────────────────

export function getCalendarProvider(env: CalendarEnv): CalendarProvider {
  const chosen = (env.CALENDAR_PROVIDER ?? '').toLowerCase().trim();

  if (chosen === 'demo') {
    return new DemoCalendarProvider();
  }

  if (chosen === '' || chosen === 'unconfigured' || chosen === 'none') {
    return new UnconfiguredCalendarProvider();
  }

  // Unknown provider name — explicit not-ready so the UI can surface it.
  return {
    name: chosen,
    ready: false,
    status(): CalendarProviderStatus {
      return {
        provider: chosen,
        ready: false,
        reason: 'provider_unsupported',
        detail: `CALENDAR_PROVIDER="${chosen}" is not a known provider; expected "demo" or empty.`,
      };
    },
    async readTodaysSchedule(): Promise<CalendarReadResult> {
      return {
        ok: false,
        provider: chosen,
        reason: 'provider_unsupported',
        detail: `CALENDAR_PROVIDER="${chosen}" is not a known provider; expected "demo" or empty.`,
        retryable: false,
      };
    },
  };
}

export function parseTimezoneOffset(env: CalendarEnv): number {
  const raw = env.CALENDAR_TIMEZONE_OFFSET_MINUTES;
  if (raw === undefined || raw === '') return 0;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 0;
  // Clamp to sensible UTC offset range (minutes): -14h .. +14h.
  if (parsed < -14 * 60 || parsed > 14 * 60) return 0;
  return parsed;
}
