// Cross-check: trigger -> the matching "requested" event must be present
// in the event registry.
//
// DOWNSTREAM STATUS: non-authoritative.
//
// AUTHORITY NOTE: the trigger -> event pairing implemented here is the
// suffix-based naming convention observed in the current registries
// (e.g. trg.chassis.install <-> evt.chassis.install.requested). This is the
// only canonical pairing currently expressible from landed WA P1 domains.
// If the canonical authority later publishes an explicit trigger -> event
// binding map, this validator MUST be revisited; flag for foreman review.

import type { Trigger } from "../../contracts-core/src/chassis/trigger.contract.js";
import {
  TRIGGER_IDS,
  EVENT_IDS,
  type EventId,
} from "../../contracts-core/src/chassis/domain.js";
import { lookupEvent } from "../../registry-chassis/src/event-registry.js";
import { fail, pass, type ValidationResult } from "./result.js";
import { FAILURE_CODES } from "./failure-codes.js";
import { validateIdDomain } from "./id-domain.validator.js";

const VALIDATOR_ID = "validation-chassis.cross-check.trigger-event";

/** Suffix-naming convention map: each trigger maps to its "requested" event. */
const TRIGGER_TO_REQUEST_EVENT: Readonly<Record<string, EventId>> = {
  [TRIGGER_IDS.CHASSIS_INSTALL]: EVENT_IDS.CHASSIS_INSTALL_REQUESTED,
  [TRIGGER_IDS.CHASSIS_UPDATE]: EVENT_IDS.CHASSIS_UPDATE_REQUESTED,
  [TRIGGER_IDS.CHASSIS_DISABLE]: EVENT_IDS.CHASSIS_DISABLE_REQUESTED,
  [TRIGGER_IDS.CHASSIS_REMOVE]: EVENT_IDS.CHASSIS_REMOVE_REQUESTED,
};

export function validateTriggerEvent(trigger: Trigger): ValidationResult {
  const idDomain = validateIdDomain("trigger", trigger.trigger_id);
  if (idDomain.result !== "pass") {
    return fail({
      validator_id: VALIDATOR_ID,
      target_type: "trigger",
      target_id: trigger.trigger_id,
      failure_code: FAILURE_CODES.TRIGGER_EVENT_UNREGISTERED,
      notes: `trigger ${trigger.trigger_id} is not in the canonical trigger id domain`,
    });
  }
  const expectedEventId = TRIGGER_TO_REQUEST_EVENT[trigger.trigger_id];
  if (expectedEventId === undefined) {
    return fail({
      validator_id: VALIDATOR_ID,
      target_type: "trigger",
      target_id: trigger.trigger_id,
      failure_code: FAILURE_CODES.TRIGGER_EVENT_UNREGISTERED,
      notes: `trigger ${trigger.trigger_id} has no request-event mapping in the local convention table`,
    });
  }
  const entry = lookupEvent(expectedEventId);
  if (entry === undefined) {
    return fail({
      validator_id: VALIDATOR_ID,
      target_type: "trigger",
      target_id: trigger.trigger_id,
      failure_code: FAILURE_CODES.TRIGGER_EVENT_UNREGISTERED,
      notes: `expected request event ${expectedEventId} for trigger ${trigger.trigger_id} is not present in the event registry`,
    });
  }
  return pass({
    validator_id: VALIDATOR_ID,
    target_type: "trigger",
    target_id: trigger.trigger_id,
    notes: `trigger -> request event ${entry.event_id} resolved`,
  });
}
