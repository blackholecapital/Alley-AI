import type { TelegramEnv } from "../integrations/telegram/types";
import type { TranscriptionEnv } from "../providers/transcription/provider";
import type { CalendarEnv } from "../integrations/calendar/provider";

export interface AppEnv extends TelegramEnv, TranscriptionEnv, CalendarEnv {
  ENVIRONMENT?: string;
  WORKER_VERSION?: string;
  LOG_LEVEL?: string;

  DEMO_LEADS?: KVNamespace;

  NOTIFY_CJ?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;

  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_SMS_FROM?: string;
}
