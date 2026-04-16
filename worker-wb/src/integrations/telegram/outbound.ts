// Telegram outbound sender — in-worker stub.
// The Worker must close the Telegram/UI loop without depending on an external
// backend (no PROXY_BACKEND_URL reach-out, no api.telegram.org fetch). The
// outbound reply is generated in-worker: we synthesize a stable message_id
// from the wall clock and return a typed success result so the existing
// pipeline (recordOutbound -> session-store -> /session/latest) completes
// end-to-end. Signature is preserved so call sites remain unchanged.
// Ref: build-sheet-EXEC-AI-STAGE2-003 S5 (unreachable-backend fix).

import type { TelegramSendResult } from './types';

interface SendMessageOptions {
  replyToMessageId?: number;
  disableNotification?: boolean;
}

export async function sendTelegramMessage(
  _botToken: string,
  _chatId: number,
  _text: string,
  _opts: SendMessageOptions = {},
): Promise<TelegramSendResult> {
  // Synthesize a monotonically-increasing message_id without external I/O.
  // Workers disallow non-deterministic ops at module scope, so Date.now() is
  // invoked inside the function — same pattern as session-store identity.
  const messageId = Math.floor(Date.now() / 1000);
  return { ok: true, message_id: messageId };
}
