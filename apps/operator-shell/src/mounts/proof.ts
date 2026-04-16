// Proof sibling: operator-shell mounts
// DOWNSTREAM STATUS: non-authoritative — wrapper-only around the existing
// per-mount `isMountAuthorized()` zero-arg boolean helpers plus
// Full Body profile mount compatibility lookups.
//
// FullBody | WB | P4.1 — step 3 (operator-shell mount wrapper).
//
// Scope (per WB P4.prep.2 decision):
//   * wrapper-only — does NOT modify any mount file
//   * does NOT change mount behavior
//   * emits one validation ProofResult per mount (wrapping the mount's
//     existing `isMountAuthorized()` return value) and one compatibility
//     ProofResult per mount (against FULL_BODY_PROFILE.mounts, which WA
//     P3.0 keys by TouchpointId)
//   * FULL_BODY_PROFILE is the only profile consulted
//   * no closed-set expansion
//
// Rollback: `git rm apps/operator-shell/src/mounts/proof.ts`.

import {
  adaptValidationResult,
  adaptCompatibilityResult,
  COMPATIBILITY_KINDS,
  CONSUMPTION_POINTS,
  type ProofResult,
} from "../../../../packages/proof-chassis/src/index.js";
import { FULL_BODY_PROFILE } from "../../../../packages/contracts-core/src/index.js";
import {
  INSTALL_MOUNT,
  isMountAuthorized as isInstallMountAuthorized,
} from "./install.mount.js";
import {
  UPDATE_MOUNT,
  isMountAuthorized as isUpdateMountAuthorized,
} from "./update.mount.js";

interface OperatorShellMount {
  readonly label: string;
  readonly touchpoint_id: string;
  readonly authorized: () => boolean;
}

const OPERATOR_SHELL_MOUNTS: readonly OperatorShellMount[] = [
  {
    label: "INSTALL_MOUNT",
    touchpoint_id: INSTALL_MOUNT.touchpoint_id,
    authorized: isInstallMountAuthorized,
  },
  {
    label: "UPDATE_MOUNT",
    touchpoint_id: UPDATE_MOUNT.touchpoint_id,
    authorized: isUpdateMountAuthorized,
  },
];

function mountValidationProof(m: OperatorShellMount): ProofResult {
  return adaptValidationResult({
    target_name: `${m.label}::authorization`,
    passed: m.authorized(),
    consumption_point: CONSUMPTION_POINTS.TOUCHPOINT_LAYER,
  });
}

function mountCompatibilityProof(m: OperatorShellMount): ProofResult {
  return adaptCompatibilityResult({
    profile: FULL_BODY_PROFILE,
    kind: COMPATIBILITY_KINDS.MOUNT,
    id: m.touchpoint_id,
    consumption_point: CONSUMPTION_POINTS.TOUCHPOINT_LAYER,
  });
}

/**
 * Emit one ProofResult pair (validation + compatibility) per operator-shell
 * mount. Deterministic order: [INSTALL_MOUNT, UPDATE_MOUNT] ×
 * [validation, compatibility].
 */
export function operatorMountProofs(): readonly ProofResult[] {
  const results: ProofResult[] = [];
  for (const m of OPERATOR_SHELL_MOUNTS) {
    results.push(mountValidationProof(m));
    results.push(mountCompatibilityProof(m));
  }
  return results;
}
