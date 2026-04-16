// Lifecycle transition validator
// DOWNSTREAM STATUS: non-authoritative — encodes only the transition graph
// expressible from the *currently landed* lifecycle state vocabulary
// (LIFECYCLE_STATES.INSTALLED, LIFECYCLE_STATES.DISABLED). It does NOT
// invent new lifecycle states; in particular it does not introduce
// "absent" or "removed" — the canonical authority has not published those.
//
// AUTHORITY NOTE: per WA P1.1 the LIFECYCLE_STATES domain currently exposes
// only INSTALLED and DISABLED. Until additional states land, this validator
// can only check transitions whose source AND target are members of that set.
// Actions whose target state is not in the published set (e.g. install,
// remove) are validated as source-state-only and the unknown target is
// recorded in `notes` for foreman review.
//
// Flag: this validator must be revisited when LIFECYCLE_STATES grows.

import {
  LIFECYCLE_STATES,
  type LifecycleState,
} from "../../contracts-core/src/chassis/domain.js";
import { fail, pass, type ValidationResult } from "./result.js";
import { FAILURE_CODES } from "./failure-codes.js";

export type LifecycleAction = "install" | "update" | "disable" | "remove";

/**
 * Allowed source lifecycle states per action, expressed only over the
 * currently landed `LifecycleState` set. `install` has no allowed source
 * within the landed set (it transitions from a state not yet published);
 * the validator handles that case explicitly.
 */
const ALLOWED_SOURCES: Readonly<Record<LifecycleAction, readonly LifecycleState[]>> = {
  install: [], // pre-install state not in landed LIFECYCLE_STATES
  update: [LIFECYCLE_STATES.INSTALLED],
  disable: [LIFECYCLE_STATES.INSTALLED],
  remove: [LIFECYCLE_STATES.INSTALLED, LIFECYCLE_STATES.DISABLED],
};

const VALIDATOR_ID = "validation-chassis.lifecycle.transition";

export interface LifecycleTransitionInputs {
  readonly action: LifecycleAction;
  readonly module_id: string;
  /**
   * Current lifecycle state of the module. May be `null` when the module
   * does not yet exist (the install case).
   */
  readonly current_lifecycle_state: LifecycleState | null;
}

export function validateLifecycleTransition(
  inputs: LifecycleTransitionInputs,
): ValidationResult {
  const { action, module_id, current_lifecycle_state } = inputs;

  // Special case: install. Source state is "not yet present" — represented as
  // null because the canonical authority has not published a "pre-install"
  // state symbol. Any non-null source for install is illegal.
  if (action === "install") {
    if (current_lifecycle_state === null) {
      return pass({
        validator_id: `${VALIDATOR_ID}.${action}`,
        target_type: "module",
        target_id: module_id,
        notes: "install transition from pre-install state (null) accepted",
      });
    }
    return fail({
      validator_id: `${VALIDATOR_ID}.${action}`,
      target_type: "module",
      target_id: module_id,
      failure_code: FAILURE_CODES.LIFECYCLE_TRANSITION_ILLEGAL,
      notes: `install requires source state null (pre-install); got ${current_lifecycle_state}`,
    });
  }

  // All non-install actions require a non-null source state.
  if (current_lifecycle_state === null) {
    return fail({
      validator_id: `${VALIDATOR_ID}.${action}`,
      target_type: "module",
      target_id: module_id,
      failure_code: FAILURE_CODES.LIFECYCLE_TRANSITION_ILLEGAL,
      notes: `${action} requires a non-null source lifecycle state`,
    });
  }

  const allowed = ALLOWED_SOURCES[action];
  if (!allowed.includes(current_lifecycle_state)) {
    return fail({
      validator_id: `${VALIDATOR_ID}.${action}`,
      target_type: "module",
      target_id: module_id,
      failure_code: FAILURE_CODES.LIFECYCLE_TRANSITION_ILLEGAL,
      notes: `${action} not allowed from source state ${current_lifecycle_state}; allowed sources: [${allowed.join(", ")}]`,
    });
  }

  return pass({
    validator_id: `${VALIDATOR_ID}.${action}`,
    target_type: "module",
    target_id: module_id,
    notes: `${action} transition from ${current_lifecycle_state} accepted`,
  });
}
