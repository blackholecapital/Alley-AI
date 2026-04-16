// mount -> allowed surface compatibility validator
// DOWNSTREAM STATUS: non-authoritative.
//
// Composes the existing mount->surface authorization (from mount.validator.ts)
// with profile-touchpoint and profile-surface membership checks against the
// landed WA P3.0 profile authority.
//
// Additive only: this validator does NOT modify validateMountAuthorization
// or any of the in-place mount files under apps/.

import type { Touchpoint } from "../../contracts-core/src/chassis/touchpoint.contract.js";
import type {
  ProfileId,
  SurfaceId,
} from "../../contracts-core/src/index.js";
import { fail, pass, skipped, type ValidationResult } from "./result.js";
import { FAILURE_CODES } from "./failure-codes.js";
import { validateMountAuthorization } from "./mount.validator.js";
import {
  validateProfileTouchpoint,
  validateProfileSurface,
} from "./compatibility.validator.js";

const VALIDATOR_ID = "validation-chassis.compatibility.mount-surface";

export interface MountSurfaceCompatibilityInputs {
  readonly mount: Touchpoint;
  readonly expected_surface_id: SurfaceId;
  readonly profile_id: ProfileId | string;
}

export function validateMountSurfaceUnderProfile(
  inputs: MountSurfaceCompatibilityInputs,
): ValidationResult {
  const target_type = "mount_surface_pair";
  const target_id = `${inputs.mount.touchpoint_id}::${inputs.expected_surface_id}`;

  // 1. Existing mount-surface authorization (literal binding + registry).
  const auth = validateMountAuthorization({
    mount: inputs.mount,
    expected_surface_id: inputs.expected_surface_id,
  });
  if (auth.result !== "pass") {
    return fail({
      validator_id: VALIDATOR_ID,
      target_type,
      target_id,
      failure_code: auth.failure_code ?? FAILURE_CODES.MOUNT_SURFACE_UNAUTHORIZED,
      notes: `mount-surface authorization failed: ${auth.notes ?? ""}`,
    });
  }

  // 2. Profile-touchpoint membership.
  const tpResult = validateProfileTouchpoint(inputs.profile_id, inputs.mount.touchpoint_id);
  if (tpResult.result === "fail") {
    return fail({
      validator_id: VALIDATOR_ID,
      target_type,
      target_id,
      failure_code: tpResult.failure_code ?? FAILURE_CODES.PROFILE_TOUCHPOINT_BLOCKED,
      notes: `profile-touchpoint check failed: ${tpResult.notes ?? ""}`,
    });
  }

  // 3. Profile-surface membership.
  const surfResult = validateProfileSurface(inputs.profile_id, inputs.expected_surface_id);
  if (surfResult.result === "fail") {
    return fail({
      validator_id: VALIDATOR_ID,
      target_type,
      target_id,
      failure_code: surfResult.failure_code ?? FAILURE_CODES.PROFILE_SURFACE_BLOCKED,
      notes: `profile-surface check failed: ${surfResult.notes ?? ""}`,
    });
  }

  // If either profile check is skipped (bucket unresolved), the composite
  // result is skipped — the canonical authority has not yet drawn the line.
  if (tpResult.result === "skipped" || surfResult.result === "skipped") {
    return skipped({
      validator_id: VALIDATOR_ID,
      target_type,
      target_id,
      notes: `mount-surface authorized but profile membership unresolved (touchpoint=${tpResult.result}, surface=${surfResult.result}) in profile ${inputs.profile_id}`,
    });
  }

  return pass({
    validator_id: VALIDATOR_ID,
    target_type,
    target_id,
    notes: `mount(${inputs.mount.touchpoint_id}) -> surface(${inputs.expected_surface_id}) authorized and profile-allowed in ${inputs.profile_id}`,
  });
}
