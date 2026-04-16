// Structured request logging and correlation ID plumbing.
// All runtime log lines in this Worker go through logger.log(...) so the
// Cloudflare observability pipeline ("observability.enabled": true in
// wrangler.jsonc) captures a uniform JSON shape per line. The logger is
// level-filtered against LOG_LEVEL and carries a correlation ID so a single
// request can be traced across route, integration, and provider boundaries.
// Ref: build-sheet-EXEC-AI-STAGE2-003 S5.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const CORRELATION_HEADER_CANDIDATES = [
  'cf-ray',
  'x-correlation-id',
  'x-request-id',
];

export interface LoggerEnv {
  LOG_LEVEL?: string;
  ENVIRONMENT?: string;
  WORKER_VERSION?: string;
}

export interface LogFields {
  [key: string]: unknown;
}

export interface Logger {
  readonly correlationId: string;
  child(fields: LogFields): Logger;
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

function parseLevel(raw: string | undefined): LogLevel {
  const candidate = (raw ?? '').toLowerCase().trim();
  if (candidate === 'debug' || candidate === 'info' || candidate === 'warn' || candidate === 'error') {
    return candidate;
  }
  return 'info';
}

export function newCorrelationId(): string {
  return crypto.randomUUID();
}

export function extractCorrelationId(request: Request): string {
  for (const header of CORRELATION_HEADER_CANDIDATES) {
    const value = request.headers.get(header);
    if (value && value.length > 0 && value.length <= 128) {
      return value;
    }
  }
  return newCorrelationId();
}

class ConsoleLogger implements Logger {
  readonly correlationId: string;

  private readonly threshold: number;
  private readonly baseFields: LogFields;

  constructor(correlationId: string, threshold: number, baseFields: LogFields) {
    this.correlationId = correlationId;
    this.threshold = threshold;
    this.baseFields = baseFields;
  }

  child(fields: LogFields): Logger {
    return new ConsoleLogger(this.correlationId, this.threshold, {
      ...this.baseFields,
      ...fields,
    });
  }

  debug(event: string, fields?: LogFields): void {
    this.emit('debug', event, fields);
  }

  info(event: string, fields?: LogFields): void {
    this.emit('info', event, fields);
  }

  warn(event: string, fields?: LogFields): void {
    this.emit('warn', event, fields);
  }

  error(event: string, fields?: LogFields): void {
    this.emit('error', event, fields);
  }

  private emit(level: LogLevel, event: string, fields?: LogFields): void {
    if (LEVEL_ORDER[level] < this.threshold) return;

    const line = {
      ts: new Date().toISOString(),
      level,
      event,
      correlation_id: this.correlationId,
      ...this.baseFields,
      ...(fields ?? {}),
    };

    const serialized = JSON.stringify(line);
    if (level === 'error') {
      console.error(serialized);
    } else if (level === 'warn') {
      console.warn(serialized);
    } else {
      console.log(serialized);
    }
  }
}

export function createLogger(
  env: LoggerEnv,
  correlationId: string,
  baseFields: LogFields = {},
): Logger {
  const level = parseLevel(env.LOG_LEVEL);
  const threshold = LEVEL_ORDER[level];
  return new ConsoleLogger(correlationId, threshold, {
    env: env.ENVIRONMENT ?? 'unknown',
    version: env.WORKER_VERSION ?? 'unknown',
    ...baseFields,
  });
}
