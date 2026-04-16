// Proof sibling: touchpoints
// DOWNSTREAM STATUS: non-authoritative — wraps already-computed touchpoint
// validation and compatibility facts into structured ProofResults for the
// proof-chassis consumption path.
//
// FullBody | WB | P4.1 — step 2 (touchpoint layer attachment).
//
// Scope (per WB P4.prep.2 decision):
//   * additive sibling file only
//   * wraps existing touchpoint validation and compatibility facts only
//   * no touchpoint mutation
//   * no closed-set expansion
//   * FULL_BODY_PROFILE is the only profile consulted; Mobile / PC remain
//     unresolved and are not touched here
//
// Rollback: `git rm apps/core-runtime/src/touchpoints/proof.ts`.

import {
  adaptValidationResult,
  adaptCompatibilityResult,
  COMPATIBILITY_KINDS,
  CONSUMPTION_POINTS,
  type ProofResult,
} from "../../../../packages/proof-chassis/src/index.js";
import { isValidTouchpoint } from "../../../../packages/schema-chassis/src/index.js";
import { FULL_BODY_PROFILE } from "../../../../packages/contracts-core/src/index.js";
import type { Touchpoint } from "../../../../packages/contracts-core/src/chassis/touchpoint.contract.js";
import { INSTALL_TOUCHPOINT } from "./install.touchpoint.js";
import { UPDATE_TOUCHPOINT } from "./update.touchpoint.js";
import { DISABLE_TOUCHPOINT } from "./disable.touchpoint.js";
import { REMOVE_TOUCHPOINT } from "./remove.touchpoint.js";

const TOUCHPOINTS: readonly Touchpoint[] = [
  INSTALL_TOUCHPOINT,
  UPDATE_TOUCHPOINT,
  DISABLE_TOUCHPOINT,
  REMOVE_TOUCHPOINT,
];

function touchpointValidationProof(tp: Touchpoint): ProofResult {
  return adaptValidationResult({
    target_name: `Touchpoint::${tp.touchpoint_id}`,
    passed: isValidTouchpoint(tp),
    consumption_point: CONSUMPTION_POINTS.TOUCHPOINT_LAYER,
  });
}

function touchpointCompatibilityProof(tp: Touchpoint): ProofResult {
  return adaptCompatibilityResult({
    profile: FULL_BODY_PROFILE,
    kind: COMPATIBILITY_KINDS.TOUCHPOINT,
    id: tp.touchpoint_id,
    consumption_point: CONSUMPTION_POINTS.TOUCHPOINT_LAYER,
  });
}

/**
 * Emit one ProofResult pair (validation + compatibility) per declared
 * chassis touchpoint. The returned array is deterministic and ordered:
 * [INSTALL, UPDATE, DISABLE, REMOVE] × [validation, compatibility].
 */
export function touchpointProofs(): readonly ProofResult[] {
  const results: ProofResult[] = [];
  for (const tp of TOUCHPOINTS) {
    results.push(touchpointValidationProof(tp));
    results.push(touchpointCompatibilityProof(tp));
  }
  return results;
}
