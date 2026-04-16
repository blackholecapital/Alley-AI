// Explicit failure response shapes.
// One JSON envelope for every non-2xx response so operators and the UI can
// always pick up { code, message, detail, correlation_id } without guessing
// what a given route decided to emit.
// Ref: build-sheet-EXEC-AI-STAGE2-003 S5.

export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'method_not_allowed'
  | 'config_error'
  | 'upstream_error'
  | 'internal_error';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  config_error: 500,
  upstream_error: 502,
  internal_error: 500,
};

export interface ErrorResponseOptions {
  message: string;
  detail?: unknown;
  correlationId: string;
  status?: number;
  extra?: Record<string, unknown>;
}

export function errorResponse(code: ErrorCode, opts: ErrorResponseOptions): Response {
  const status = opts.status ?? STATUS_BY_CODE[code];
  const body: Record<string, unknown> = {
    ok: false,
    error: {
      code,
      message: opts.message,
      ...(opts.detail !== undefined ? { detail: opts.detail } : {}),
    },
    correlation_id: opts.correlationId,
    ...(opts.extra ?? {}),
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-correlation-id': opts.correlationId,
      'cache-control': 'no-store',
    },
  });
}

export interface JsonResponseOptions {
  correlationId: string;
  status?: number;
  headers?: Record<string, string>;
}

export function jsonResponse(payload: unknown, opts: JsonResponseOptions): Response {
  const body =
    typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? { ...(payload as Record<string, unknown>), correlation_id: opts.correlationId }
      : { payload, correlation_id: opts.correlationId };

  return new Response(JSON.stringify(body), {
    status: opts.status ?? 200,
    headers: {
      'content-type': 'application/json',
      'x-correlation-id': opts.correlationId,
      ...(opts.headers ?? {}),
    },
  });
}
