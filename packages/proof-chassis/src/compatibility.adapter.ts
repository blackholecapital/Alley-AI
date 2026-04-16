// Upstream authority: xyz-factory-system
// DOWNSTREAM STATUS: non-authoritative — compatibility result adapter only.
//
// WA P4.0 — classifies an id against a ProfileConstraint and wraps the
// classification into a structured ProofResult. This adapter does NOT
// modify any profile, does NOT populate Mobile / PC buckets, and does
// NOT re-derive Full Body. It only reads.

import type {
  ProfileConstraint,
  ProfileExposure,
} from "../../contracts-core/src/profiles/profile-domain.js";
import {
  PROOF_KINDS,
  FAILURE_CODES,
  RETRYABILITY,
  type ConsumptionPoint,
  type ProofResult,
} from "./result-domain.js";

const STAGE_TAG = "FullBody | WA | P4.0";

export const COMPATIBILITY_BUCKETS = {
  ALLOWED: "allowed",
  BLOCKED: "blocked",
  OPTIONAL: "optional",
  UNRESOLVED: "unresolved",
} as const;
export type CompatibilityBucket =
  (typeof COMPATIBILITY_BUCKETS)[keyof typeof COMPATIBILITY_BUCKETS];

export const COMPATIBILITY_KINDS = {
  SHELL: "shell",
  SURFACE: "surface",
  ROUTE: "route",
  TOUCHPOINT: "touchpoint",
  MOUNT: "mount",
} as const;
export type CompatibilityKind =
  (typeof COMPATIBILITY_KINDS)[keyof typeof COMPATIBILITY_KINDS];

function selectExposure(
  profile: ProfileConstraint,
  kind: CompatibilityKind,
): ProfileExposure<string> {
  switch (kind) {
    case COMPATIBILITY_KINDS.SHELL:
      return profile.shells;
    case COMPATIBILITY_KINDS.SURFACE:
      return profile.surfaces;
    case COMPATIBILITY_KINDS.ROUTE:
      return profile.routes;
    case COMPATIBILITY_KINDS.TOUCHPOINT:
      return profile.touchpoints;
    case COMPATIBILITY_KINDS.MOUNT:
      return profile.mounts;
  }
}

function isExposureEmpty(exposure: ProfileExposure<string>): boolean {
  return (
    exposure.allowed.length === 0 &&
    exposure.blocked.length === 0 &&
    exposure.optional.length === 0
  );
}

export function classifyCompatibility(
  profile: ProfileConstraint,
  kind: CompatibilityKind,
  id: string,
): CompatibilityBucket {
  const exposure = selectExposure(profile, kind);

  // Derived profile with no buckets populated → unresolved, not blocked.
  // This preserves the WA P3.0 rule: empty derived = "no exposure
  // decided", not "everything blocked".
  if (isExposureEmpty(exposure)) return COMPATIBILITY_BUCKETS.UNRESOLVED;

  if (exposure.allowed.includes(id)) return COMPATIBILITY_BUCKETS.ALLOWED;
  if (exposure.blocked.includes(id)) return COMPATIBILITY_BUCKETS.BLOCKED;
  if (exposure.optional.includes(id)) return COMPATIBILITY_BUCKETS.OPTIONAL;

  // Populated profile, id is not classified → unresolved drift; the
  // operator path must surface this for foreman review.
  return COMPATIBILITY_BUCKETS.UNRESOLVED;
}

export interface CompatibilityAdapterInputs {
  readonly profile: ProfileConstraint;
  readonly kind: CompatibilityKind;
  readonly id: string;
  readonly consumption_point: ConsumptionPoint;
}

export function adaptCompatibilityResult(
  inputs: CompatibilityAdapterInputs,
): ProofResult {
  const { profile, kind, id, consumption_point } = inputs;
  const bucket = classifyCompatibility(profile, kind, id);

  const passed = bucket === COMPATIBILITY_BUCKETS.ALLOWED;

  const failure_code =
    bucket === COMPATIBILITY_BUCKETS.ALLOWED
      ? FAILURE_CODES.NONE
      : bucket === COMPATIBILITY_BUCKETS.BLOCKED
        ? FAILURE_CODES.COMPATIBILITY_BLOCKED
        : bucket === COMPATIBILITY_BUCKETS.OPTIONAL
          ? FAILURE_CODES.COMPATIBILITY_OPTIONAL_NOT_YET_ELIGIBLE
          : FAILURE_CODES.COMPATIBILITY_UNRESOLVED;

  const retryability =
    bucket === COMPATIBILITY_BUCKETS.ALLOWED
      ? RETRYABILITY.RETRYABLE
      : bucket === COMPATIBILITY_BUCKETS.BLOCKED
        ? RETRYABILITY.NON_RETRYABLE
        : RETRYABILITY.BLOCKING;

  const operator_summary =
    `compatibility[${profile.profile_id} / ${kind} / ${id}] → ${bucket}`;

  return {
    proof_kind: PROOF_KINDS.COMPATIBILITY,
    consumption_point,
    passed,
    retryability,
    failure_code,
    operator_summary,
    diagnostic: {
      expected_tag: STAGE_TAG,
      actual_tag: STAGE_TAG,
      stage: "P4.0",
      consumption_point,
    },
  };
}
