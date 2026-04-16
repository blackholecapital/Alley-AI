// shell -> allowed mounts compatibility validator
// DOWNSTREAM STATUS: non-authoritative.
//
// Composes profile-shell + profile-mount membership against the landed
// WA P3.0 profile authority.
//
// The mount eligibility key is the underlying touchpoint id (per
// ProfileConstraint.mounts: ProfileExposure<TouchpointId>).
//
// Same shell-ownership-split caveat as shell-surface.validator.ts: the
// validator checks profile-level shell membership and profile-level mount
// membership, but cannot express "operator-shell may load INSTALL_MOUNT but
// web-public may not" because both shells share SHELL_OWNER_IDS.FACTORY.

import type {
  ProfileId,
  ShellOwnerId,
  TouchpointId,
} from "../../contracts-core/src/index.js";
import { fail, pass, skipped, type ValidationResult } from "./result.js";
import { FAILURE_CODES } from "./failure-codes.js";
import {
  validateProfileShell,
  validateProfileMount,
} from "./compatibility.validator.js";

const VALIDATOR_ID = "validation-chassis.compatibility.shell-mount";

export interface ShellMountInputs {
  readonly profile_id: ProfileId | string;
  readonly shell_owner_id: ShellOwnerId | string;
  readonly mount_touchpoint_id: TouchpointId | string;
  readonly shell_split_kind?: string;
}

export function validateShellMount(inputs: ShellMountInputs): ValidationResult {
  const target_type = "shell_mount_pair";
  const target_id = `${inputs.shell_owner_id}::${inputs.mount_touchpoint_id}`;

  const shellResult = validateProfileShell(inputs.profile_id, inputs.shell_owner_id);
  if (shellResult.result === "fail") {
    return fail({
      validator_id: VALIDATOR_ID,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.SHELL_MOUNT_UNAUTHORIZED,
      notes: `shell membership failed: ${shellResult.failure_code}; ${shellResult.notes ?? ""}`,
    });
  }
  if (shellResult.result === "skipped") {
    return skipped({
      validator_id: VALIDATOR_ID,
      target_type,
      target_id,
      notes: `shell membership unresolved in profile ${inputs.profile_id}; cannot enforce shell-mount pairing yet`,
    });
  }

  const mountResult = validateProfileMount(inputs.profile_id, inputs.mount_touchpoint_id);
  if (mountResult.result === "fail") {
    return fail({
      validator_id: VALIDATOR_ID,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.SHELL_MOUNT_UNAUTHORIZED,
      notes: `mount membership failed: ${mountResult.failure_code}; ${mountResult.notes ?? ""}`,
    });
  }
  if (mountResult.result === "skipped") {
    return skipped({
      validator_id: VALIDATOR_ID,
      target_type,
      target_id,
      notes: `mount membership unresolved in profile ${inputs.profile_id}; cannot enforce shell-mount pairing yet`,
    });
  }

  if (inputs.shell_split_kind !== undefined) {
    return skipped({
      validator_id: VALIDATOR_ID,
      target_type,
      target_id,
      notes: `shell_owner_id ${inputs.shell_owner_id} and mount(touchpoint) ${inputs.mount_touchpoint_id} are both allowed in profile ${inputs.profile_id}, BUT directed pairing for split ${JSON.stringify(inputs.shell_split_kind)} cannot be enforced — failure_code_if_resolved=${FAILURE_CODES.SHELL_OWNERSHIP_SPLIT_UNRESOLVED}`,
    });
  }

  return pass({
    validator_id: VALIDATOR_ID,
    target_type,
    target_id,
    notes: `shell ${inputs.shell_owner_id} and mount(touchpoint) ${inputs.mount_touchpoint_id} both allowed in profile ${inputs.profile_id}`,
  });
}
