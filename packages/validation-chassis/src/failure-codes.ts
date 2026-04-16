// Failure-code vocabulary for structured validation results
// DOWNSTREAM STATUS: non-authoritative — vocabulary staged at WB P2.1.
//
// The final failure-code domain is owned by the canonical authority and is
// not published yet. This package defines a *local, stable* vocabulary so
// WB-scope structured results can carry meaningful codes without inventing
// authority. When the canonical failure-code domain lands, remap these to
// the canonical constants and flag for foreman review.

export const FAILURE_CODES = {
  // ---- Shape / structural ----
  SHAPE_INVALID: "shape_invalid",
  FIELD_MISSING: "field_missing",
  FIELD_TYPE_INVALID: "field_type_invalid",

  // ---- Enum-domain membership ----
  REGISTRY_STATE_UNKNOWN: "registry_state_unknown",
  LIFECYCLE_STATE_UNKNOWN: "lifecycle_state_unknown",
  RESOLVER_STATE_UNKNOWN: "resolver_state_unknown",
  CONSISTENCY_RESULT_UNKNOWN: "consistency_result_unknown",
  STAMP_STATE_UNKNOWN: "stamp_state_unknown",
  SHELL_OWNER_UNKNOWN: "shell_owner_unknown",

  // ---- Id-domain membership ----
  ID_DOMAIN_VIOLATION: "id_domain_violation",

  // ---- Cross-reference ----
  ROUTE_SURFACE_UNREGISTERED: "route_surface_unregistered",
  TOUCHPOINT_SURFACE_UNREGISTERED: "touchpoint_surface_unregistered",
  TOUCHPOINT_EVENT_UNREGISTERED: "touchpoint_event_unregistered",
  TRIGGER_EVENT_UNREGISTERED: "trigger_event_unregistered",
  REGISTRY_LOOKUP_MISSED: "registry_lookup_missed",

  // ---- Lifecycle transition ----
  LIFECYCLE_TRANSITION_ILLEGAL: "lifecycle_transition_illegal",

  // ---- Install-chain ordering ----
  STAMP_STATE_NOT_ISSUED: "stamp_state_not_issued",
  RESOLVER_STATE_NOT_RESOLVED: "resolver_state_not_resolved",
  CONSISTENCY_RESULT_NOT_PASS: "consistency_result_not_pass",
  RESOLVER_RUN_ID_MISMATCH: "resolver_run_id_mismatch",
  STAMPED_OUTPUT_MISSING: "stamped_output_missing",
  STAMPED_INSTALL_INTAKE_MISSING: "stamped_install_intake_missing",
  APPLIED_INSTALL_RECORD_MISSING: "applied_install_record_missing",
  PRODUCTION_INSTALL_NOT_VERIFIED: "production_install_not_verified",
  BRIDGE_NOT_ACTIVATABLE: "bridge_not_activatable",
  ACTIVATION_NOT_ELIGIBLE: "activation_not_eligible",
  TOUCHPOINT_NOT_ENABLED: "touchpoint_not_enabled",
  BRIDGE_NOT_READY: "bridge_not_ready",

  // ---- Mount authorization ----
  MOUNT_SURFACE_UNAUTHORIZED: "mount_surface_unauthorized",

  // ---- Compatibility / profile (WB P3.1) ----
  PROFILE_UNKNOWN: "profile_unknown",
  PROFILE_SHELL_BLOCKED: "profile_shell_blocked",
  PROFILE_SHELL_UNRESOLVED: "profile_shell_unresolved",
  PROFILE_SURFACE_BLOCKED: "profile_surface_blocked",
  PROFILE_SURFACE_UNRESOLVED: "profile_surface_unresolved",
  PROFILE_ROUTE_BLOCKED: "profile_route_blocked",
  PROFILE_ROUTE_UNRESOLVED: "profile_route_unresolved",
  PROFILE_TOUCHPOINT_BLOCKED: "profile_touchpoint_blocked",
  PROFILE_TOUCHPOINT_UNRESOLVED: "profile_touchpoint_unresolved",
  PROFILE_MOUNT_BLOCKED: "profile_mount_blocked",
  PROFILE_MOUNT_UNRESOLVED: "profile_mount_unresolved",
  SHELL_SURFACE_UNAUTHORIZED: "shell_surface_unauthorized",
  SHELL_MOUNT_UNAUTHORIZED: "shell_mount_unauthorized",
  SHELL_OWNERSHIP_SPLIT_UNRESOLVED: "shell_ownership_split_unresolved",
} as const;

export type FailureCode = (typeof FAILURE_CODES)[keyof typeof FAILURE_CODES];
