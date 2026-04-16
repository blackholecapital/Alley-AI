// Mount authorization validator
// DOWNSTREAM STATUS: non-authoritative — does not authorize mounts; only
// reports whether a mount declaration's surface_id matches an expected
// surface and is registered.

import type { Touchpoint } from "../../contracts-core/src/chassis/touchpoint.contract.js";
import type { SurfaceId } from "../../contracts-core/src/chassis/domain.js";
import { lookupSurface } from "../../registry-chassis/src/surface-registry.js";
import { fail, pass, type ValidationResult } from "./result.js";
import { FAILURE_CODES } from "./failure-codes.js";
import { validateIdDomain } from "./id-domain.validator.js";

const VALIDATOR_ID = "validation-chassis.mount.authorization";

export interface MountAuthorizationInputs {
  readonly mount: Touchpoint;
  readonly expected_surface_id: SurfaceId;
}

export function validateMountAuthorization(
  inputs: MountAuthorizationInputs,
): ValidationResult {
  const { mount, expected_surface_id } = inputs;
  const target = {
    validator_id: VALIDATOR_ID,
    target_type: "mount",
    target_id: mount.touchpoint_id,
  } as const;

  if (mount.surface_id !== expected_surface_id) {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.MOUNT_SURFACE_UNAUTHORIZED,
      notes: `mount declares surface ${mount.surface_id} but is expected to bind ${expected_surface_id}`,
    });
  }
  const idDomain = validateIdDomain("surface", mount.surface_id);
  if (idDomain.result !== "pass") {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.MOUNT_SURFACE_UNAUTHORIZED,
      notes: `surface ${mount.surface_id} is not in the canonical surface id domain`,
    });
  }
  if (lookupSurface(mount.surface_id) === undefined) {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.MOUNT_SURFACE_UNAUTHORIZED,
      notes: `surface ${mount.surface_id} is not present in the surface registry`,
    });
  }
  return pass({ ...target, notes: `mount -> surface ${mount.surface_id} authorized` });
}
