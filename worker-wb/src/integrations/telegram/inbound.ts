// Telegram inbound parser.
// Transforms a Telegram Bot API Update into the normalized InternalEvent
// contract. Pure function — no I/O, no env, no side effects.
// Ref: build-sheet-EXEC-AI-STAGE4-001 S2.

import type {
  InternalEvent,
  InternalEventKind,
  TelegramMessage,
  TelegramUpdate,
} from './types';

function classify(message: TelegramMessage): InternalEventKind {
  // Trim before checking length so whitespace-only payloads don't enter the
  // text pipeline and generate a confusing empty-text reply.
  const trimmedText = typeof message.text === 'string' ? message.text.trim() : '';
  if (trimmedText.length > 0) return 'text';
  if (message.voice) return 'voice';
  return 'other';
}

export function parseTelegramUpdate(
  update: TelegramUpdate,
  receivedAt: Date,
): InternalEvent | null {
  const message = update.message ?? update.edited_message;
  if (!message) return null;

  const kind = classify(message);
  // Trim text on the way in so generateAssistantReply always receives clean input.
  const text = kind === 'text' ? (message.text ?? '').trim() : null;

  return {
    id: `telegram:${update.update_id}`,
    source: 'telegram',
    kind,
    chat_id: message.chat.id,
    message_id: message.message_id,
    user_id: message.from?.id ?? null,
    username: message.from?.username ?? null,
    text,
    received_at: receivedAt.toISOString(),
    raw: update,
  };
}
