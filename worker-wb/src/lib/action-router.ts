// Simple internal action contract.
// One registry, one dispatch boundary. The shared assistant pipeline calls
// ActionRouter.dispatch({ action_type, params }) and never imports a
// specific integration directly. Integrations register themselves through
// this file so scope changes (add/remove one action) are local edits.
//
// Stage 3 scope: exactly one calendar action boundary. This router does not
// classify natural-language intent — that belongs to the assistant pipeline
// — it only routes a resolved action_type to a registered handler and
// normalizes the failure shape.
//
// Ref: build-sheet-EXEC-AI-STAGE3-004 S4 (single calendar action).

import type { Logger } from './logging';

export type ActionErrorCode =
  | 'unknown_action'
  | 'provider_not_ready'
  | 'provider_error'
  | 'handler_error';

export interface ActionError {
  code: ActionErrorCode;
  message: string;
  detail?: string;
}

export interface ActionRequest {
  action_type: string;
  params?: Record<string, unknown>;
  actor_id?: string | null;
  correlation_id?: string;
}

export interface ActionResult {
  ok: boolean;
  action_type: string;
  reply_text: string;
  payload?: Record<string, unknown>;
  error?: ActionError;
  duration_ms?: number;
  handled_at: string;
}

export type ActionHandler = (
  req: ActionRequest,
  logger: Logger,
) => Promise<ActionResult>;

export interface ActionRegistration {
  action_type: string;
  description: string;
  handler: ActionHandler;
}

export class ActionRouter {
  private readonly handlers = new Map<string, ActionRegistration>();

  register(reg: ActionRegistration): void {
    this.handlers.set(reg.action_type, reg);
  }

  has(actionType: string): boolean {
    return this.handlers.has(actionType);
  }

  list(): ActionRegistration[] {
    return [...this.handlers.values()];
  }

  async dispatch(req: ActionRequest, logger: Logger): Promise<ActionResult> {
    const started = Date.now();
    const reg = this.handlers.get(req.action_type);

    if (!reg) {
      logger.warn('action.unknown', { action_type: req.action_type });
      return {
        ok: false,
        action_type: req.action_type,
        reply_text: `No handler registered for action "${req.action_type}".`,
        error: {
          code: 'unknown_action',
          message: `no handler registered for "${req.action_type}"`,
        },
        duration_ms: Date.now() - started,
        handled_at: new Date().toISOString(),
      };
    }

    logger.info('action.dispatch.start', { action_type: req.action_type });

    try {
      const result = await reg.handler(req, logger);
      const duration = Date.now() - started;
      logger.info('action.dispatch.end', {
        action_type: req.action_type,
        ok: result.ok,
        duration_ms: duration,
      });
      return {
        ...result,
        duration_ms: duration,
        handled_at: result.handled_at ?? new Date().toISOString(),
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.error('action.dispatch.handler_error', {
        action_type: req.action_type,
        detail,
      });
      return {
        ok: false,
        action_type: req.action_type,
        reply_text:
          "Something went wrong running that action. I've logged the error for the operator.",
        error: {
          code: 'handler_error',
          message: 'action handler threw',
          detail,
        },
        duration_ms: Date.now() - started,
        handled_at: new Date().toISOString(),
      };
    }
  }
}
