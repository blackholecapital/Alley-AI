// UI state contract consumed by the operator shell.
// Inferred from:
//   - /worker-wb/src/integrations/telegram/types.ts (shipped, S2 Worker A)
//   - build sheet S3 scope ("recent inbound and outbound messages,
//     session state, and last-event timestamp")
// Replace / revise when /job_site/ui_state_contract.txt ships.
// Ref: build-sheet-EXEC-AI-STAGE2-003 S3.

export type UIEventDirection = 'inbound' | 'outbound';
export type UIEventSource = 'telegram';
export type UIEventKind = 'text' | 'voice' | 'other';

export interface UIEvent {
  id: string;
  direction: UIEventDirection;
  source: UIEventSource;
  kind: UIEventKind;
  text: string | null;
  chat_id: number | null;
  username: string | null;
  received_at: string;
}

export type UISessionState = 'live' | 'idle' | 'error';

export interface SessionLatestResponse {
  session_id: string | null;
  state: UISessionState;
  last_event_at: string | null;
  events: UIEvent[];
}

// Runtime shape of the UI itself. The view may hold any of these at
// any moment; only one is rendered at a time in each pane.
export type UIRenderState =
  | { kind: 'loading' }
  | { kind: 'empty'; session_id: string | null }
  | { kind: 'live'; data: SessionLatestResponse }
  | { kind: 'error'; message: string };

// Outbound send contract. The UI posts directly to the worker's
// /telegram/webhook route — the same route Telegram itself calls — and
// the worker always replies with {"ok": true} on accepted updates.
// The UI must NOT call /api/* paths; those do not exist on the worker.
export interface TelegramWebhookAck {
  ok: true;
}

export interface SendResultOk {
  ok: true;
}
export interface SendResultErr {
  ok: false;
  status: number;
}
export type SendResult = SendResultOk | SendResultErr;

// S3: browser voice capture state machine.
// Implemented in /apps/operator-shell/src/ui/voice-capture.js.
export type VoiceCaptureState =
  | 'idle'        // no capture in progress
  | 'requesting'  // getUserMedia call in flight; permission prompt may appear
  | 'recording'   // mic open, MediaRecorder accumulating chunks
  | 'processing'  // recording stopped, audio uploading to /voice/capture
  | 'sent'        // upload complete (ok or error); auto-resets to idle after 3 s
  | 'denied'      // browser permission denied (NotAllowedError / NotFoundError)
  | 'unsupported' // getUserMedia or MediaRecorder not available in this browser
  | 'error';      // unexpected runtime failure

export interface VoiceCaptureResultOk {
  ok: true;
  session_id: string | null;
}
export interface VoiceCaptureResultErr {
  ok: false;
  error: { code: string; message: string };
}
export type VoiceCaptureResult = VoiceCaptureResultOk | VoiceCaptureResultErr;

// S4: Calendar settings panel contract.
// Implemented in /apps/operator-shell/src/ui/calendar-panel.js.
// Also documented in /job_site/calendar_ui_contract.txt.
export type CalendarUIState =
  | 'unknown'        // not fetched yet
  | 'ready'          // provider.ready === true
  | 'not_ready'      // provider named but ready === false (not unconfigured / unsupported)
  | 'unconfigured'   // CALENDAR_PROVIDER unset / "none" / ""
  | 'unsupported'    // CALENDAR_PROVIDER set to an unknown value
  | 'error';         // /calendar/status unreachable or malformed

export interface CalendarProviderStatusView {
  provider: string;
  ready: boolean;
  reason?: string;
  detail?: string;
}

export interface CalendarActionRegistrationView {
  action_type: 'calendar.list_today';
  registered: boolean;
}

export interface CalendarInvocationView {
  ok: boolean;
  action_type: string;
  reply_text: string;
  handled_at: string;
  error?: { code: string; message: string; detail?: string };
  payload?: { event_count?: number; provider?: CalendarProviderStatusView };
}

export interface CalendarStatusResponseView {
  ok: true;
  provider: CalendarProviderStatusView;
  action: CalendarActionRegistrationView;
  config: { timezone_offset_minutes: number };
  invocation: CalendarInvocationView | null;
  last_result: CalendarInvocationView | null;
}

export interface CalendarPanelModel {
  ui_state: CalendarUIState;
  provider: CalendarProviderStatusView | null;
  guidance_text: string;
  last_invocation: CalendarInvocationView | null;
  can_run: boolean;
}
