// Compatibility / profile-membership validators
// DOWNSTREAM STATUS: non-authoritative.
//
// Binds to the landed WA P3.0 profile layer:
//   packages/contracts-core/src/profiles/profile-domain.ts
//   packages/contracts-core/src/profiles/compatibility-map.ts
//
// Reads PROFILE_COMPATIBILITY_MAP, PROFILE_IDS, ProfileExposure, ProfileConstraint.
// Does NOT redefine, extend, narrow, populate, or reinterpret the profile layer.
//
// Resolution rules (from WA P3.0 profile-domain.ts comment):
//   * Full Body is the authority-rich superset.
//   * Mobile / PC are derived; their bucket sets are intentionally empty
//     until canonical authority publishes them.
//   * "Until populated, this profile must be treated as 'no exposure decided'
//     rather than 'everything blocked'." → empty buckets resolve to a
//     non-blocking SKIPPED result with an `_unresolved` failure_code carried
//     in `notes`. (We still emit a result so callers can audit the gap.)

import {
  PROFILE_IDS,
  PROFILE_COMPATIBILITY_MAP,
  type ProfileId,
  type ProfileConstraint,
  type ProfileExposure,
  type ShellOwnerId,
  type SurfaceId,
  type RouteId,
  type TouchpointId,
} from "../../contracts-core/src/index.js";
import {
  fail,
  pass,
  skipped,
  type ValidationResult,
} from "./result.js";
import { FAILURE_CODES } from "./failure-codes.js";

const VALIDATOR_ID_PREFIX = "validation-chassis.compatibility";

// =============================================================================
// Exposure classification
// =============================================================================

export type ExposureClass = "allowed" | "blocked" | "optional" | "unresolved";

/**
 * Classify a single id against a profile exposure bucket.
 *
 * `unresolved` means: every bucket of this exposure is empty AND the id is
 * therefore not classifiable from the landed profile authority. This is the
 * canonical "no exposure decided" outcome for derived profiles whose
 * canonical bindings have not yet been published.
 */
export function classifyExposure<T extends string>(
  exposure: ProfileExposure<T>,
  id: T,
): ExposureClass {
  if (exposure.allowed.includes(id)) return "allowed";
  if (exposure.blocked.includes(id)) return "blocked";
  if (exposure.optional.includes(id)) return "optional";
  if (
    exposure.allowed.length === 0 &&
    exposure.blocked.length === 0 &&
    exposure.optional.length === 0
  ) {
    return "unresolved";
  }
  // The exposure has at least one populated bucket but `id` is in none of
  // them. Treat as blocked: a populated profile that omits an id is
  // implicitly excluding it.
  return "blocked";
}

// =============================================================================
// Profile lookup
// =============================================================================

function knownProfile(profile_id: string): ProfileConstraint | null {
  // Defensive lookup: PROFILE_COMPATIBILITY_MAP is keyed by ProfileId. Cast
  // through `unknown` so a stray runtime string is reported as PROFILE_UNKNOWN
  // rather than throwing.
  const known = (PROFILE_IDS as Readonly<Record<string, ProfileId>>);
  for (const k of Object.keys(known)) {
    if (known[k] === profile_id) {
      return PROFILE_COMPATIBILITY_MAP[known[k] as ProfileId];
    }
  }
  return null;
}

function profileNotFound(
  validator_id: string,
  target_type: string,
  target_id: string | null,
  profile_id: string,
): ValidationResult {
  return fail({
    validator_id,
    target_type,
    target_id,
    failure_code: FAILURE_CODES.PROFILE_UNKNOWN,
    notes: `profile_id ${profile_id} is not in PROFILE_COMPATIBILITY_MAP`,
  });
}

// =============================================================================
// Generic profile-membership check
// =============================================================================

interface MembershipInputs<T extends string> {
  readonly validator_id: string;
  readonly target_type: string;
  readonly target_id: string;
  readonly profile: ProfileConstraint;
  readonly bucket: ProfileExposure<T>;
  readonly id: T;
  readonly blocked_code: string;
  readonly unresolved_code: string;
  readonly kind_label: string;
}

function checkMembership<T extends string>(
  inputs: MembershipInputs<T>,
): ValidationResult {
  const klass = classifyExposure(inputs.bucket, inputs.id);
  switch (klass) {
    case "allowed":
      return pass({
        validator_id: inputs.validator_id,
        target_type: inputs.target_type,
        target_id: inputs.target_id,
        notes: `${inputs.kind_label} ${inputs.id} is allowed in profile ${inputs.profile.profile_id}`,
      });
    case "optional":
      return pass({
        validator_id: inputs.validator_id,
        target_type: inputs.target_type,
        target_id: inputs.target_id,
        notes: `${inputs.kind_label} ${inputs.id} is optional in profile ${inputs.profile.profile_id} (allowed pending canonical authority)`,
      });
    case "blocked":
      return fail({
        validator_id: inputs.validator_id,
        target_type: inputs.target_type,
        target_id: inputs.target_id,
        failure_code: inputs.blocked_code,
        notes: `${inputs.kind_label} ${inputs.id} is blocked in profile ${inputs.profile.profile_id}`,
      });
    case "unresolved":
      // Profile bucket is fully empty: no canonical decision yet. Per WA P3.0
      // documentation, do NOT treat this as "everything blocked".
      return skipped({
        validator_id: inputs.validator_id,
        target_type: inputs.target_type,
        target_id: inputs.target_id,
        notes: `profile ${inputs.profile.profile_id} ${inputs.kind_label} bucket is unresolved (empty); skipped — canonical authority pending. failure_code_if_resolved=${inputs.unresolved_code}`,
      });
  }
}

// =============================================================================
// Profile-shell
// =============================================================================

export function validateProfileShell(
  profile_id: ProfileId | string,
  shell_owner_id: ShellOwnerId | string,
): ValidationResult {
  const validator_id = `${VALIDATOR_ID_PREFIX}.profile-shell`;
  const target_type = "shell_owner";
  const target_id = String(shell_owner_id);
  const profile = knownProfile(String(profile_id));
  if (profile === null) {
    return profileNotFound(validator_id, target_type, target_id, String(profile_id));
  }
  return checkMembership<ShellOwnerId>({
    validator_id,
    target_type,
    target_id,
    profile,
    bucket: profile.shells,
    id: shell_owner_id as ShellOwnerId,
    blocked_code: FAILURE_CODES.PROFILE_SHELL_BLOCKED,
    unresolved_code: FAILURE_CODES.PROFILE_SHELL_UNRESOLVED,
    kind_label: "shell_owner",
  });
}

// =============================================================================
// Profile-surface
// =============================================================================

export function validateProfileSurface(
  profile_id: ProfileId | string,
  surface_id: SurfaceId | string,
): ValidationResult {
  const validator_id = `${VALIDATOR_ID_PREFIX}.profile-surface`;
  const target_type = "surface";
  const target_id = String(surface_id);
  const profile = knownProfile(String(profile_id));
  if (profile === null) {
    return profileNotFound(validator_id, target_type, target_id, String(profile_id));
  }
  return checkMembership<SurfaceId>({
    validator_id,
    target_type,
    target_id,
    profile,
    bucket: profile.surfaces,
    id: surface_id as SurfaceId,
    blocked_code: FAILURE_CODES.PROFILE_SURFACE_BLOCKED,
    unresolved_code: FAILURE_CODES.PROFILE_SURFACE_UNRESOLVED,
    kind_label: "surface",
  });
}

// =============================================================================
// Profile-route
// =============================================================================

export function validateProfileRoute(
  profile_id: ProfileId | string,
  route_id: RouteId | string,
): ValidationResult {
  const validator_id = `${VALIDATOR_ID_PREFIX}.profile-route`;
  const target_type = "route";
  const target_id = String(route_id);
  const profile = knownProfile(String(profile_id));
  if (profile === null) {
    return profileNotFound(validator_id, target_type, target_id, String(profile_id));
  }
  return checkMembership<RouteId>({
    validator_id,
    target_type,
    target_id,
    profile,
    bucket: profile.routes,
    id: route_id as RouteId,
    blocked_code: FAILURE_CODES.PROFILE_ROUTE_BLOCKED,
    unresolved_code: FAILURE_CODES.PROFILE_ROUTE_UNRESOLVED,
    kind_label: "route",
  });
}

// =============================================================================
// Profile-touchpoint
// =============================================================================

export function validateProfileTouchpoint(
  profile_id: ProfileId | string,
  touchpoint_id: TouchpointId | string,
): ValidationResult {
  const validator_id = `${VALIDATOR_ID_PREFIX}.profile-touchpoint`;
  const target_type = "touchpoint";
  const target_id = String(touchpoint_id);
  const profile = knownProfile(String(profile_id));
  if (profile === null) {
    return profileNotFound(validator_id, target_type, target_id, String(profile_id));
  }
  return checkMembership<TouchpointId>({
    validator_id,
    target_type,
    target_id,
    profile,
    bucket: profile.touchpoints,
    id: touchpoint_id as TouchpointId,
    blocked_code: FAILURE_CODES.PROFILE_TOUCHPOINT_BLOCKED,
    unresolved_code: FAILURE_CODES.PROFILE_TOUCHPOINT_UNRESOLVED,
    kind_label: "touchpoint",
  });
}

// =============================================================================
// Profile-mount
// =============================================================================
//
// Mounts in the WA P3.0 profile layer are keyed by TouchpointId because mounts
// in this package set are not first-class ids — they are (touchpoint × surface)
// bindings. The validator therefore takes the mount's underlying touchpoint id
// as its eligibility key.

export function validateProfileMount(
  profile_id: ProfileId | string,
  mount_touchpoint_id: TouchpointId | string,
): ValidationResult {
  const validator_id = `${VALIDATOR_ID_PREFIX}.profile-mount`;
  const target_type = "mount";
  const target_id = String(mount_touchpoint_id);
  const profile = knownProfile(String(profile_id));
  if (profile === null) {
    return profileNotFound(validator_id, target_type, target_id, String(profile_id));
  }
  return checkMembership<TouchpointId>({
    validator_id,
    target_type,
    target_id,
    profile,
    bucket: profile.mounts,
    id: mount_touchpoint_id as TouchpointId,
    blocked_code: FAILURE_CODES.PROFILE_MOUNT_BLOCKED,
    unresolved_code: FAILURE_CODES.PROFILE_MOUNT_UNRESOLVED,
    kind_label: "mount(touchpoint)",
  });
}
