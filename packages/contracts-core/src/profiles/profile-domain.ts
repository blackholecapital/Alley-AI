// Upstream authority: xyz-factory-system (Full Body as authority-rich superset)
// DOWNSTREAM STATUS: non-authoritative — profile constraint layer only.
//
// WA P3.0 — Full Body compatibility / composability profile layer.
//
// This file defines the *shape* of a profile constraint. It does not
// introduce any new chassis authority, lifecycle path, install law, or
// runtime authority. Profiles ride on top of the existing chassis domain
// layer (packages/contracts-core/src/chassis/domain.ts) and express
// exposure rules as pure data:
//
//   allowed  → explicitly permitted in this profile
//   blocked  → explicitly disallowed in this profile
//   optional → permitted later, pending canonical authority
//
// A profile is a *constraint set over existing chassis ids*. Derivation
// happens by subset, not by rewrite. Full Body stays the authority-rich
// superset; Mobile-optimized and PC-optimized derive from it.

import type {
  SurfaceId,
  RouteId,
  TouchpointId,
  ShellOwnerId,
} from "../chassis/domain.js";

// === Profile ids ===
// Canonical identifiers for every Full Body compatibility profile known
// to this package set. New profiles must be added here first.
export const PROFILE_IDS = {
  FULL_BODY: "profile.full_body",
  MOBILE_OPTIMIZED: "profile.mobile_optimized",
  PC_OPTIMIZED: "profile.pc_optimized",
} as const;
export type ProfileId = (typeof PROFILE_IDS)[keyof typeof PROFILE_IDS];

// === Chassis profile status ===
// Describes the profile's relationship to canonical chassis authority.
//   authority_rich → the profile exposes the full chassis (Full Body)
//   derived        → the profile is a constraint-only subset of Full Body
//
// No "fork" or "rewrite" status exists — WA P3.0 explicitly refuses to
// introduce a lifecycle fork, install-law fork, or runtime authority shift.
export const CHASSIS_PROFILE_STATUSES = {
  AUTHORITY_RICH: "authority_rich",
  DERIVED: "derived",
} as const;
export type ChassisProfileStatus =
  (typeof CHASSIS_PROFILE_STATUSES)[keyof typeof CHASSIS_PROFILE_STATUSES];

// === Derivation mode ===
// How a derived profile relates to the Full Body superset.
//   subset_of_full_body → every id in `allowed` MUST exist in Full Body's
//                         allowed set. No invention, no rename, no new ids.
//   none                → this profile itself IS the authority-rich source
//                         (Full Body).
export const DERIVATION_MODES = {
  NONE: "none",
  SUBSET_OF_FULL_BODY: "subset_of_full_body",
} as const;
export type DerivationMode =
  (typeof DERIVATION_MODES)[keyof typeof DERIVATION_MODES];

// === Profile exposure ===
// Three-way constraint set over any chassis id domain. Every id in the
// Full Body superset must be classified into exactly one bucket per
// derived profile: allowed, blocked, or optional.
export interface ProfileExposure<T extends string> {
  readonly allowed: readonly T[];
  readonly blocked: readonly T[];
  readonly optional: readonly T[];
}

// === Profile constraint ===
// The composition of every exposure rule that makes up a profile.
// Ordering follows the WA P3.0 task list:
//   chassis profile → shell profile → surface availability
//   → route exposure → touchpoint exposure → mount eligibility
//
// Mount eligibility is keyed by touchpoint id because mounts in this
// package set are not first-class ids — they are (touchpoint × surface)
// bindings whose eligibility is decided by touchpoint exposure plus the
// profile's explicit mount rule.
export interface ProfileConstraint {
  readonly profile_id: ProfileId;
  readonly chassis_profile_status: ChassisProfileStatus;
  readonly derivation_mode: DerivationMode;
  readonly shells: ProfileExposure<ShellOwnerId>;
  readonly surfaces: ProfileExposure<SurfaceId>;
  readonly routes: ProfileExposure<RouteId>;
  readonly touchpoints: ProfileExposure<TouchpointId>;
  readonly mounts: ProfileExposure<TouchpointId>;
}
