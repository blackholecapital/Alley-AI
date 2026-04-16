// Env validation.
// Collects declarative requirements per runtime path so the Worker can fail
// readably at the first request that needs a missing binding instead of
// producing opaque upstream errors. Validation is non-throwing; callers
// decide whether to refuse the request or log a warning and continue.
// Ref: build-sheet-EXEC-AI-STAGE2-003 S5.

import type { TelegramEnv } from '../integrations/telegram/types';
import type { TranscriptionEnv } from '../providers/transcription/provider';

export type EnvSeverity = 'error' | 'warn';

export interface EnvIssue {
  key: string;
  severity: EnvSeverity;
  message: string;
}

export interface EnvValidation {
  ok: boolean;
  errors: EnvIssue[];
  warnings: EnvIssue[];
}

function partition(issues: EnvIssue[]): EnvValidation {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warn');
  return { ok: errors.length === 0, errors, warnings };
}

export function validateTelegramEnv(env: TelegramEnv): EnvValidation {
  const issues: EnvIssue[] = [];
  if (!env.TELEGRAM_BOT_TOKEN) {
    issues.push({
      key: 'TELEGRAM_BOT_TOKEN',
      severity: 'error',
      message: 'required to issue outbound Telegram sendMessage calls',
    });
  }
  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    issues.push({
      key: 'TELEGRAM_WEBHOOK_SECRET',
      severity: 'error',
      message: 'required to verify inbound Telegram webhook requests',
    });
  }
  return partition(issues);
}

export function validateTranscriptionEnv(env: TranscriptionEnv): EnvValidation {
  const issues: EnvIssue[] = [];
  const provider = (env.TRANSCRIPTION_PROVIDER ?? '').toLowerCase().trim();

  if (provider === 'deepgram' && !env.DEEPGRAM_API_KEY) {
    issues.push({
      key: 'DEEPGRAM_API_KEY',
      severity: 'error',
      message: 'required when TRANSCRIPTION_PROVIDER=deepgram',
    });
  }

  if (provider === '' && !env.DEEPGRAM_API_KEY) {
    issues.push({
      key: 'DEEPGRAM_API_KEY',
      severity: 'warn',
      message: 'not set — voice transcription will fall back to noop provider',
    });
  }

  if (provider !== '' && provider !== 'deepgram' && provider !== 'noop') {
    issues.push({
      key: 'TRANSCRIPTION_PROVIDER',
      severity: 'error',
      message: `unknown provider "${provider}"; expected "deepgram" or "noop"`,
    });
  }

  return partition(issues);
}

export function validateBoot(env: TelegramEnv & TranscriptionEnv): EnvValidation {
  const telegram = validateTelegramEnv(env);
  const transcription = validateTranscriptionEnv(env);
  const errors = [...telegram.errors, ...transcription.errors];
  const warnings = [...telegram.warnings, ...transcription.warnings];
  return { ok: errors.length === 0, errors, warnings };
}
