// Cross-check: touchpoint -> surface must be present in the surface registry.
// DOWNSTREAM STATUS: non-authoritative — does not register, only checks.

import type { Touchpoint } from "../../contracts-core/src/chassis/touchpoint.contract.js";
import { lookupSurface } from "../../registry-chassis/src/surface-registry.js";
import { fail, pass, type ValidationResult } from "./result.js";
import { FAILURE_CODES } from "./failure-codes.js";
import { validateIdDomain } from "./id-domain.validator.js";

const VALIDATOR_ID = "validation-chassis.cross-check.touchpoint-surface";

export function validateTouchpointSurface(touchpoint: Touchpoint): ValidationResult {
  const idDomain = validateIdDomain("surface", touchpoint.surface_id);
  if (idDomain.result !== "pass") {
    return fail({
      validator_id: VALIDATOR_ID,
      target_type: "touchpoint",
      target_id: touchpoint.touchpoint_id,
      failure_code: FAILURE_CODES.TOUCHPOINT_SURFACE_UNREGISTERED,
      notes: `touchpoint ${touchpoint.touchpoint_id} references surface ${touchpoint.surface_id} which is not in the canonical surface id domain`,
    });
  }
  const entry = lookupSurface(touchpoint.surface_id);
  if (entry === undefined) {
    return fail({
      validator_id: VALIDATOR_ID,
      target_type: "touchpoint",
      target_id: touchpoint.touchpoint_id,
      failure_code: FAILURE_CODES.TOUCHPOINT_SURFACE_UNREGISTERED,
      notes: `surface ${touchpoint.surface_id} is not present in the surface registry`,
    });
  }
  return pass({
    validator_id: VALIDATOR_ID,
    target_type: "touchpoint",
    target_id: touchpoint.touchpoint_id,
    notes: `touchpoint -> surface ${entry.surface_id} resolved`,
  });
}
