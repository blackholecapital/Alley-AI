// Upstream authority: xyz-factory-system (Full Body as authority-rich superset)
// DOWNSTREAM STATUS: non-authoritative — profile constraint layer only.
//
// WA P3.0 — canonical compatibility map.
//
// Three profiles are scaffolded:
//
//   FULL_BODY_PROFILE        — authority-rich superset; allows every
//                              chassis id currently registered.
//   MOBILE_OPTIMIZED_PROFILE — derived; constraint set unresolved.
//   PC_OPTIMIZED_PROFILE     — derived; constraint set unresolved.
//
// Mobile and PC are intentionally empty pending canonical authority.
// WA P3.0 does NOT invent values for them. Their bucket sets are empty
// and explicitly marked as unresolved. Future stages populate them by
// constraint over the existing Full Body superset — never by rewriting
// or extending the chassis domain layer.

import {
  SURFACE_IDS,
  ROUTE_IDS,
  TOUCHPOINT_IDS,
  SHELL_OWNER_IDS,
} from "../chassis/domain.js";
import {
  PROFILE_IDS,
  CHASSIS_PROFILE_STATUSES,
  DERIVATION_MODES,
  type ProfileConstraint,
  type ProfileId,
} from "./profile-domain.js";

// =============================================================================
// FULL BODY — authority-rich superset
// =============================================================================
// Every chassis id known to the registries lives in `allowed`. The
// `blocked` and `optional` buckets are empty by definition: Full Body is
// the source from which derived profiles subtract.
//
// Maintenance rule: when a new id lands in
// packages/contracts-core/src/chassis/domain.ts, it must also be added
// to the corresponding `allowed` bucket here in the SAME commit.
export const FULL_BODY_PROFILE: ProfileConstraint = {
  profile_id: PROFILE_IDS.FULL_BODY,
  chassis_profile_status: CHASSIS_PROFILE_STATUSES.AUTHORITY_RICH,
  derivation_mode: DERIVATION_MODES.NONE,
  shells: {
    allowed: [SHELL_OWNER_IDS.FACTORY],
    blocked: [],
    optional: [],
  },
  surfaces: {
    allowed: [SURFACE_IDS.CLI_FACTORY, SURFACE_IDS.API_FACTORY],
    blocked: [],
    optional: [],
  },
  routes: {
    allowed: [
      ROUTE_IDS.CHASSIS_INSTALL,
      ROUTE_IDS.CHASSIS_UPDATE,
      ROUTE_IDS.CHASSIS_DISABLE,
      ROUTE_IDS.CHASSIS_REMOVE,
    ],
    blocked: [],
    optional: [],
  },
  touchpoints: {
    allowed: [
      TOUCHPOINT_IDS.CLI_INSTALL,
      TOUCHPOINT_IDS.CLI_UPDATE,
      TOUCHPOINT_IDS.API_DISABLE,
      TOUCHPOINT_IDS.API_REMOVE,
    ],
    blocked: [],
    optional: [],
  },
  mounts: {
    allowed: [
      TOUCHPOINT_IDS.CLI_INSTALL,
      TOUCHPOINT_IDS.CLI_UPDATE,
      TOUCHPOINT_IDS.API_DISABLE,
      TOUCHPOINT_IDS.API_REMOVE,
    ],
    blocked: [],
    optional: [],
  },
};

// =============================================================================
// MOBILE OPTIMIZED — derived (UNRESOLVED)
// =============================================================================
// Canonical mobile derivation has not been published. WA P3.0 does NOT
// invent values. Every bucket is empty.
//
// Derivation rule (when populated by a future stage): every id in any
// bucket of this profile MUST already exist in FULL_BODY_PROFILE's
// `allowed` set. No new ids may appear here. No lifecycle, install-law,
// or runtime authority may be redefined to satisfy the constraint.
//
// Until populated, this profile must be treated as "no exposure decided"
// rather than "everything blocked".
export const MOBILE_OPTIMIZED_PROFILE: ProfileConstraint = {
  profile_id: PROFILE_IDS.MOBILE_OPTIMIZED,
  chassis_profile_status: CHASSIS_PROFILE_STATUSES.DERIVED,
  derivation_mode: DERIVATION_MODES.SUBSET_OF_FULL_BODY,
  shells: { allowed: [], blocked: [], optional: [] },
  surfaces: { allowed: [], blocked: [], optional: [] },
  routes: { allowed: [], blocked: [], optional: [] },
  touchpoints: { allowed: [], blocked: [], optional: [] },
  mounts: { allowed: [], blocked: [], optional: [] },
};

// =============================================================================
// PC OPTIMIZED — derived (UNRESOLVED)
// =============================================================================
// Canonical PC derivation has not been published. WA P3.0 does NOT
// invent values. Every bucket is empty.
//
// Same derivation rule as Mobile: subset of Full Body, no invention,
// no rewrite of chassis structure.
export const PC_OPTIMIZED_PROFILE: ProfileConstraint = {
  profile_id: PROFILE_IDS.PC_OPTIMIZED,
  chassis_profile_status: CHASSIS_PROFILE_STATUSES.DERIVED,
  derivation_mode: DERIVATION_MODES.SUBSET_OF_FULL_BODY,
  shells: { allowed: [], blocked: [], optional: [] },
  surfaces: { allowed: [], blocked: [], optional: [] },
  routes: { allowed: [], blocked: [], optional: [] },
  touchpoints: { allowed: [], blocked: [], optional: [] },
  mounts: { allowed: [], blocked: [], optional: [] },
};

// =============================================================================
// PROFILE COMPATIBILITY MAP — central registry
// =============================================================================
// Single lookup point for every known profile constraint. Keyed by
// ProfileId so that runtime / future tooling can resolve a profile
// without importing each constant individually.
export const PROFILE_COMPATIBILITY_MAP: {
  readonly [K in ProfileId]: ProfileConstraint;
} = {
  [PROFILE_IDS.FULL_BODY]: FULL_BODY_PROFILE,
  [PROFILE_IDS.MOBILE_OPTIMIZED]: MOBILE_OPTIMIZED_PROFILE,
  [PROFILE_IDS.PC_OPTIMIZED]: PC_OPTIMIZED_PROFILE,
};

export function lookupProfile(profile_id: ProfileId): ProfileConstraint {
  return PROFILE_COMPATIBILITY_MAP[profile_id];
}

export function listProfiles(): readonly ProfileConstraint[] {
  return [
    FULL_BODY_PROFILE,
    MOBILE_OPTIMIZED_PROFILE,
    PC_OPTIMIZED_PROFILE,
  ];
}

// =============================================================================
// DERIVATION CONSTRAINTS (operator-facing reference)
// =============================================================================
// These are the rules a future stage must respect when populating Mobile
// or PC profiles. They are documentation, not runtime checks.
//
// ALLOWED operations on a derived profile:
//   * move an id from FULL_BODY allowed → derived allowed
//   * move an id from FULL_BODY allowed → derived blocked
//   * move an id from FULL_BODY allowed → derived optional
//
// BLOCKED operations on a derived profile (refuse and escalate):
//   * introduce an id that does not exist in FULL_BODY allowed
//   * fork a lifecycle path for the derived profile
//   * fork install-law / install-stamp behavior for the derived profile
//   * shift runtime authority into the derived profile
//   * narrow chassis contract types based on derived profile membership
//   * invent a new chassis_profile_status beyond authority_rich / derived
//   * invent a new derivation_mode beyond none / subset_of_full_body
//
// OPTIONAL items (allowed later, not now):
//   * additional shell owners (none planned in WA P3.0)
//   * additional surfaces beyond sf.cli.factory / sf.api.factory
//   * profile-specific touchpoint variants (only via constraint, never
//     via id rename)
//   * profile-level capability flags (must layer above this file, never
//     inside it, and never inside chassis/domain.ts)
