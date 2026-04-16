// Cross-check: touchpoint -> each event ref must be present in the event registry.
// DOWNSTREAM STATUS: non-authoritative.
//
// The touchpoint event-refs shape used here is defined locally as a structural
// type so that `validation-chassis` (a package) does not depend on anything
// under `apps/`. The structural type is intentionally compatible with
// `apps/core-runtime/src/touchpoints/install.touchpoint.ts::TouchpointEventRefs`.

import type { Touchpoint } from "../../contracts-core/src/chassis/touchpoint.contract.js";
import type { EventId } from "../../contracts-core/src/chassis/domain.js";
import { lookupEvent } from "../../registry-chassis/src/event-registry.js";
import { fail, pass, type ValidationResult } from "./result.js";
import { FAILURE_CODES } from "./failure-codes.js";
import { validateIdDomain } from "./id-domain.validator.js";

/** Structural shape of touchpoint event references. */
export interface TouchpointEventRefsShape {
  readonly request_event_id: EventId;
  readonly completion_event_id: EventId;
  readonly failure_event_id: EventId;
}

const VALIDATOR_ID = "validation-chassis.cross-check.touchpoint-event";

type Leg = "request" | "completion" | "failure";

function validateLeg(
  touchpoint: Touchpoint,
  leg: Leg,
  event_id: string,
): ValidationResult {
  const target_id = `${touchpoint.touchpoint_id}:${leg}`;
  const idDomain = validateIdDomain("event", event_id);
  if (idDomain.result !== "pass") {
    return fail({
      validator_id: VALIDATOR_ID,
      target_type: "touchpoint_event_ref",
      target_id,
      failure_code: FAILURE_CODES.TOUCHPOINT_EVENT_UNREGISTERED,
      notes: `${leg} event_id ${event_id} is not in the canonical event id domain`,
    });
  }
  const entry = lookupEvent(event_id);
  if (entry === undefined) {
    return fail({
      validator_id: VALIDATOR_ID,
      target_type: "touchpoint_event_ref",
      target_id,
      failure_code: FAILURE_CODES.TOUCHPOINT_EVENT_UNREGISTERED,
      notes: `${leg} event_id ${event_id} is not present in the event registry`,
    });
  }
  return pass({
    validator_id: VALIDATOR_ID,
    target_type: "touchpoint_event_ref",
    target_id,
    notes: `${leg} -> event ${entry.event_id} resolved`,
  });
}

/**
 * Validate all three event legs of a touchpoint's event refs. Returns one
 * ValidationResult per leg so callers can see all failures, not just the first.
 */
export function validateTouchpointEvents(
  touchpoint: Touchpoint,
  refs: TouchpointEventRefsShape,
): readonly ValidationResult[] {
  return [
    validateLeg(touchpoint, "request", refs.request_event_id),
    validateLeg(touchpoint, "completion", refs.completion_event_id),
    validateLeg(touchpoint, "failure", refs.failure_event_id),
  ] as const;
}
