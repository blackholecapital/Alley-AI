// Telegram integration — types for inbound updates, outbound sends, and the
// normalized internal event contract consumed by the rest of the Worker.
// Ref: build-sheet-EXEC-AI-STAGE2-003 S2 (Telegram text round trip).

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  voice?: TelegramVoice;
  reply_to_message?: TelegramMessage;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

// Normalized internal event. One shape for text, voice, and other intake so
// downstream session/UI/transcription paths consume a single contract.
export type InternalEventKind = 'text' | 'voice' | 'other';

export interface InternalEvent {
  id: string;
  source: 'telegram';
  kind: InternalEventKind;
  chat_id: number;
  message_id: number;
  user_id: number | null;
  username: string | null;
  text: string | null;
  received_at: string;
  raw: TelegramUpdate;
}

export interface TelegramEnv {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
}

export type TelegramSendResult =
  | { ok: true; message_id: number }
  | { ok: false; status: number; description: string };
