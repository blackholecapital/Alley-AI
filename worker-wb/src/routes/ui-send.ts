// UI send route.
// Accepts a text payload from the browser operator UI, records it as an
// inbound session item, synthesizes a reply in-worker (same shape as
// buildTextReply in the Telegram webhook), records the reply as outbound,
// and returns { ok, event_id, reply_text } so the UI can optionally render
// the reply immediately while /session/latest polling closes the loop.
//
// Deliberately distinct from /telegram/webhook:
//   - /telegram/webhook requires the Telegram secret header (for Telegram)
//   - /ui/send is the first-class browser channel and has no such header
// Inputs are validated explicitly; failures return the shared error envelope.
// Ref: build-sheet-EXEC-AI-STAGE2-003 S5 (UI round trip).

import { errorResponse, jsonResponse } from '../lib/errors';
import { recordUiInbound, recordUiOutbound } from '../lib/session-store';
import type { Logger } from '../lib/logging';

const MAX_TEXT_LEN = 4000;
const PREVIEW_LEN = 200;

function buildReply(text: string): string {
  return `received: ${text.slice(0, PREVIEW_LEN)}`;
}

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
  const replyText = buildReply(trimmed);
  const outbound = recordUiOutbound({ event_id: inbound.id, text: replyText });

  logger.info('ui.send.ok', {
    inbound_id: inbound.id,
    outbound_id: outbound.id,
    text_length: trimmed.length,
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
