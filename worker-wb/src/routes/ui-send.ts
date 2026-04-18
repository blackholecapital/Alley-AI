// UI send route.
// Accepts a text payload from the browser operator UI, records it as an
// inbound session item, runs the SAME shared assistant reply generator as
// the Telegram webhook (generateAssistantReply), records the reply as an
// outbound session item, and returns { ok, event_id, reply_text } so the
// UI can render the reply immediately while /session/latest polling closes
// the loop.
//
// The browser UI and Telegram share one assistant pipeline: both channels
// import generateAssistantReply from telegram-webhook so text in, reply out
// is produced identically regardless of origin. Echo / placeholder logic
// ("received: <text>") is intentionally absent — the worker must close the
// loop with an assistant-voice reply on every turn.
//
// Failure handling mirrors the Telegram path: if generateAssistantReply
// throws, the inbound is still persisted, a failure item is recorded via
// recordFailure (source='ui'), and the caller receives the shared error
// envelope. The outbound is only persisted after a successful reply.
//
// Deliberately distinct from /telegram/webhook:
//   - /telegram/webhook requires the Telegram secret header (for Telegram)
//   - /ui/send is the first-class browser channel and has no such header
// Inputs are validated explicitly; failures return the shared error envelope.
//
// Ref: build-sheet-EXEC-AI-STAGE4-001 S2 (shared assistant reply generator,
//      UI parity with Telegram text completion + failure states),
//      build-sheet-EXEC-AI-STAGE2-003 S5 (UI round trip baseline).

import { errorResponse, jsonResponse } from '../lib/errors';
import {
  recordFailure,
  recordUiInbound,
  recordUiOutbound,
} from '../lib/session-store';
import { generateAssistantReply } from './telegram-webhook';
import type { Logger } from '../lib/logging';

const MAX_TEXT_LEN = 4000;
const UI_CHAT_ID = 0;

export async function handleUiSend(request: Request, logger: Logger): Promise<Response> {
  if (request.method !== 'POST') {
    logger.warn('ui.send.method_not_allowed', { method: request.method });
    return errorResponse('method_not_allowed', {
      message: 'POST required',
      correlationId: logger.correlationId,
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    logger.warn('ui.send.bad_json');
    return errorResponse('bad_request', {
      message: 'body must be JSON',
      correlationId: logger.correlationId,
    });
  }

  const text =
    typeof body === 'object' && body !== null && 'text' in body
      ? (body as { text: unknown }).text
      : undefined;

  if (typeof text !== 'string') {
    return errorResponse('bad_request', {
      message: 'text must be a string',
      correlationId: logger.correlationId,
    });
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return errorResponse('bad_request', {
      message: 'text must be non-empty',
      correlationId: logger.correlationId,
    });
  }
  if (trimmed.length > MAX_TEXT_LEN) {
    return errorResponse('bad_request', {
      message: `text exceeds ${MAX_TEXT_LEN} chars`,
      correlationId: logger.correlationId,
    });
  }

  const inbound = recordUiInbound({ text: trimmed });
  logger.info('ui.inbound', {
    event_id: inbound.id,
    text_length: trimmed.length,
  });

  let replyText: string;
  try {
    replyText = generateAssistantReply(trimmed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('assistant.reply.error', { event_id: inbound.id, error: msg });
    recordFailure({
      event_id: inbound.id,
      chat_id: UI_CHAT_ID,
      failure_code: 'reply_generation_error',
      failure_message: msg,
      source: 'ui',
    });
    return errorResponse('internal_error', {
      message: 'reply generation failed',
      correlationId: logger.correlationId,
    });
  }

  logger.info('assistant.reply.generated', {
    event_id: inbound.id,
    reply_length: replyText.length,
  });

  const outbound = recordUiOutbound({ event_id: inbound.id, text: replyText });

  logger.info('ui.send.ok', {
    inbound_id: inbound.id,
    outbound_id: outbound.id,
    text_length: trimmed.length,
    reply_length: replyText.length,
  });

  return jsonResponse(
    {
      ok: true,
      event_id: inbound.id,
      reply_text: replyText,
      inbound_item: inbound,
      outbound_item: outbound,
    },
    {
      correlationId: logger.correlationId,
      headers: { 'cache-control': 'no-store' },
    },
  );
}
