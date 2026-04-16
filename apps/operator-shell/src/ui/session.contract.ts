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
