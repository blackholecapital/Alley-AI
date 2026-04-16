// shell -> allowed surfaces compatibility validator
// DOWNSTREAM STATUS: non-authoritative.
//
// Composes profile-shell + profile-surface membership against the landed
// WA P3.0 profile authority.
//
// IMPORTANT — shell ownership split (UNRESOLVED):
//   In the merged base, both `apps/operator-shell` and `apps/web-public`
//   declare `shell_owner_id = SHELL_OWNER_IDS.FACTORY`. The directed
//   pairing (operator-shell hosts sf.cli.factory; web-public hosts
//   sf.api.factory) cannot be expressed against the landed authority
//   because there is only one shell-owner id today. Per WB P3.prep §6
//   and WB P3.1 instruction §5, the validator stops at the profile-level
//   shell membership check and returns a SKIPPED structured result with
//   `failure_code_if_resolved=shell_ownership_split_unresolved` carried in
//   notes when a caller asks for the directed split.

import type {
  ProfileId,
  ShellOwnerId,
  SurfaceId,
} from "../../contracts-core/src/index.js";
import { fail, pass, skipped, type ValidationResult } from "./result.js";
import { FAILURE_CODES } from "./failure-codes.js";
import {
  validateProfileShell,
  validateProfileSurface,
} from "./compatibility.validator.js";

const VALIDATOR_ID = "validation-chassis.compatibility.shell-surface";

export interface ShellSurfaceInputs {
  readonly profile_id: ProfileId | string;
  readonly shell_owner_id: ShellOwnerId | string;
  readonly surface_id: SurfaceId | string;
  /**
   * Optional caller-supplied app-level shell label, e.g. "operator_shell"
   * or "web_public". Used only to record the directed-pairing concern in
   * notes — never used for control flow, because the canonical shell-owner
   * split has not been published.
   */
  readonly shell_split_kind?: string;
}

export function validateShellSurface(inputs: ShellSurfaceInputs): ValidationResult {
  const target_type = "shell_surface_pair";
  const target_id = `${inputs.shell_owner_id}::${inputs.surface_id}`;

  const shellResult = validateProfileShell(inputs.profile_id, inputs.shell_owner_id);
  if (shellResult.result === "fail") {
    return fail({
      validator_id: VALIDATOR_ID,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.SHELL_SURFACE_UNAUTHORIZED,
      notes: `shell membership failed: ${shellResult.failure_code}; ${shellResult.notes ?? ""}`,
    });
  }
  if (shellResult.result === "skipped") {
    return skipped({
      validator_id: VALIDATOR_ID,
      target_type,
      target_id,
      notes: `shell membership unresolved in profile ${inputs.profile_id}; cannot enforce shell-surface pairing yet`,
    });
  }

  const surfaceResult = validateProfileSurface(inputs.profile_id, inputs.surface_id);
  if (surfaceResult.result === "fail") {
    return fail({
      validator_id: VALIDATOR_ID,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.SHELL_SURFACE_UNAUTHORIZED,
      notes: `surface membership failed: ${surfaceResult.failure_code}; ${surfaceResult.notes ?? ""}`,
    });
  }
  if (surfaceResult.result === "skipped") {
    return skipped({
      validator_id: VALIDATOR_ID,
      target_type,
      target_id,
      notes: `surface membership unresolved in profile ${inputs.profile_id}; cannot enforce shell-surface pairing yet`,
    });
  }

  // Both ids are profile-allowed. Per the unresolved shell-ownership split,
  // the directed pairing (which shell may host which surface) is not
  // expressible against landed authority. If the caller supplied a
  // `shell_split_kind`, surface that limitation explicitly.
  if (inputs.shell_split_kind !== undefined) {
    return skipped({
      validator_id: VALIDATOR_ID,
      target_type,
      target_id,
      notes: `both shell_owner_id ${inputs.shell_owner_id} and surface_id ${inputs.surface_id} are allowed in profile ${inputs.profile_id}, BUT directed pairing for split ${JSON.stringify(inputs.shell_split_kind)} cannot be enforced — failure_code_if_resolved=${FAILURE_CODES.SHELL_OWNERSHIP_SPLIT_UNRESOLVED}`,
    });
  }

  return pass({
    validator_id: VALIDATOR_ID,
    target_type,
    target_id,
    notes: `shell ${inputs.shell_owner_id} and surface ${inputs.surface_id} both allowed in profile ${inputs.profile_id}`,
  });
}
