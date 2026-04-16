// Cross-check: route -> surface must be present in the surface registry.
// DOWNSTREAM STATUS: non-authoritative — does not register, only checks.

import type { Route } from "../../contracts-core/src/chassis/route.contract.js";
import { lookupSurface } from "../../registry-chassis/src/surface-registry.js";
import { fail, pass, type ValidationResult } from "./result.js";
import { FAILURE_CODES } from "./failure-codes.js";
import { validateIdDomain } from "./id-domain.validator.js";

const VALIDATOR_ID = "validation-chassis.cross-check.route-surface";

export function validateRouteSurface(route: Route): ValidationResult {
  // First make sure the surface id is in the canonical id domain.
  const idDomain = validateIdDomain("surface", route.surface_id);
  if (idDomain.result !== "pass") {
    return fail({
      validator_id: VALIDATOR_ID,
      target_type: "route",
      target_id: route.route_id,
      failure_code: FAILURE_CODES.ROUTE_SURFACE_UNREGISTERED,
      notes: `route ${route.route_id} references surface ${route.surface_id} which is not in the canonical surface id domain`,
    });
  }
  // Then make sure the surface is actually in the local registry today.
  const entry = lookupSurface(route.surface_id);
  if (entry === undefined) {
    return fail({
      validator_id: VALIDATOR_ID,
      target_type: "route",
      target_id: route.route_id,
      failure_code: FAILURE_CODES.ROUTE_SURFACE_UNREGISTERED,
      notes: `surface ${route.surface_id} is not present in the surface registry`,
    });
  }
  return pass({
    validator_id: VALIDATOR_ID,
    target_type: "route",
    target_id: route.route_id,
    notes: `route -> surface ${entry.surface_id} resolved`,
  });
}
