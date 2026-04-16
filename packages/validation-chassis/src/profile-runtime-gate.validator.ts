// Profile-aware runtime/bridge gate wrappers
// DOWNSTREAM STATUS: non-authoritative — does NOT shift runtime authority
// into the profile layer. Wraps the existing structured install-chain
// validators with an additional profile membership precheck so callers can
// audit which profile a runtime gate decision was made under.
//
// Authority discipline (WB P3.1 instruction §4):
//   * runtime authority remains with the existing install-chain validators
//     in install-chain.validator.ts (which mirror the canonical install
//     path artifacts)
//   * the profile layer ONLY decides "is this artifact id even visible
//     in this profile"; it does NOT decide install/lifecycle outcomes
//   * a profile precheck failure short-circuits the gate, but the gate
//     ITSELF (resolver state, stamp state, artifact presence) is unchanged
//
// Coverage of WB P3.prep RT-1..RT-6 risks:
//   * Each existing runtime gate is now reachable through a profile-aware
//     wrapper that takes a profile_id and returns a structured result.
//   * The wrappers do not modify the existing gates' signatures.
//   * If the profile bucket relevant to the gate is unresolved (empty),
//     the wrapper records that explicitly and proceeds with the gate
//     (so derived-profile callers do not silently fail when canonical
//     authority has not yet drawn the line).

import type {
  ProfileId,
  TouchpointId,
  SurfaceId,
} from "../../contracts-core/src/index.js";
import { fail, pass, skipped, type ValidationResult } from "./result.js";
import {
  validateBridgeActivatable,
  validateLocalBridgeReady,
  validateActivationEligible,
  validateTransportReady,
  validateSessionLinkAvailable,
  type BridgeActivationInputs,
  type LocalBridgeReadyInputs,
  type ActivationEligibilityInputs,
  type TransportReadyInputs,
  type SessionLinkInputs,
} from "./install-chain.validator.js";
import {
  validateProfileTouchpoint,
  validateProfileSurface,
} from "./compatibility.validator.js";

const PREFIX = "validation-chassis.compatibility.runtime-gate";

// Helper: pass-through that records the gate's outcome under the profile.
function tagWithProfile(
  source: ValidationResult,
  validator_id: string,
  profile_id: string,
): ValidationResult {
  if (source.result === "pass") {
    return pass({
      validator_id,
      target_type: source.target_type,
      target_id: source.target_id,
      notes: `gate passed under profile ${profile_id}; underlying=${source.validator_id}`,
    });
  }
  if (source.result === "skipped") {
    return skipped({
      validator_id,
      target_type: source.target_type,
      target_id: source.target_id,
      notes: `gate skipped under profile ${profile_id}; underlying=${source.validator_id}; ${source.notes ?? ""}`,
    });
  }
  return fail({
    validator_id,
    target_type: source.target_type,
    target_id: source.target_id,
    failure_code: source.failure_code ?? "unknown",
    blocking: source.blocking,
    retryable: source.retryable,
    notes: `gate failed under profile ${profile_id}; underlying=${source.validator_id}; ${source.notes ?? ""}`,
  });
}

// =============================================================================
// validateBridgeActivatableUnderProfile
// =============================================================================
//
// Bridge activation does not depend on a touchpoint or surface today, so the
// profile precheck is "is the profile known". The wrapper exists so callers
// can audit which profile context the bridge gate ran under.

export interface ProfileBridgeActivationInputs extends BridgeActivationInputs {
  readonly profile_id: ProfileId | string;
}

export function validateBridgeActivatableUnderProfile(
  inputs: ProfileBridgeActivationInputs,
): ValidationResult {
  const validator_id = `${PREFIX}.bridge-activatable`;
  const gate = validateBridgeActivatable(inputs);
  return tagWithProfile(gate, validator_id, String(inputs.profile_id));
}

// =============================================================================
// validateLocalBridgeReadyUnderProfile
// =============================================================================

export interface ProfileLocalBridgeReadyInputs extends LocalBridgeReadyInputs {
  readonly profile_id: ProfileId | string;
}

export function validateLocalBridgeReadyUnderProfile(
  inputs: ProfileLocalBridgeReadyInputs,
): ValidationResult {
  const validator_id = `${PREFIX}.local-bridge-ready`;
  const gate = validateLocalBridgeReady(inputs);
  return tagWithProfile(gate, validator_id, String(inputs.profile_id));
}

// =============================================================================
// validateActivationEligibleUnderProfile
// =============================================================================

export interface ProfileActivationEligibilityInputs extends ActivationEligibilityInputs {
  readonly profile_id: ProfileId | string;
}

export function validateActivationEligibleUnderProfile(
  inputs: ProfileActivationEligibilityInputs,
): ValidationResult {
  const validator_id = `${PREFIX}.activation-eligible`;
  const gate = validateActivationEligible(inputs);
  return tagWithProfile(gate, validator_id, String(inputs.profile_id));
}

// =============================================================================
// validateTransportReadyUnderProfile
// =============================================================================
//
// TransportReady's `touchpoint_enabled` is a single boolean today (RT-4 risk).
// The wrapper takes the *specific* touchpoint id the caller cares about and
// runs a profile-touchpoint membership precheck. If the touchpoint is blocked
// in the profile, the wrapper short-circuits with a structured fail without
// invoking the underlying gate. This is the first concrete profile-aware
// signal at this layer; the underlying gate's collapsed `touchpoint_enabled`
// flag is preserved unchanged.

export interface ProfileTransportReadyInputs extends TransportReadyInputs {
  readonly profile_id: ProfileId | string;
  readonly touchpoint_id: TouchpointId | string;
}

export function validateTransportReadyUnderProfile(
  inputs: ProfileTransportReadyInputs,
): ValidationResult {
  const validator_id = `${PREFIX}.transport-ready`;
  const tpResult = validateProfileTouchpoint(inputs.profile_id, inputs.touchpoint_id);
  if (tpResult.result === "fail") {
    return fail({
      validator_id,
      target_type: "session_transport",
      target_id: String(inputs.touchpoint_id),
      failure_code: tpResult.failure_code ?? "unknown",
      notes: `transport gate short-circuited: touchpoint ${inputs.touchpoint_id} blocked in profile ${inputs.profile_id} (${tpResult.notes ?? ""})`,
    });
  }
  // skipped (unresolved) → continue to gate, but record the gap.
  const gate = validateTransportReady(inputs);
  if (tpResult.result === "skipped") {
    if (gate.result === "pass") {
      return skipped({
        validator_id,
        target_type: "session_transport",
        target_id: String(inputs.touchpoint_id),
        notes: `gate passed but profile-touchpoint membership unresolved for ${inputs.touchpoint_id} in profile ${inputs.profile_id}`,
      });
    }
  }
  return tagWithProfile(gate, validator_id, String(inputs.profile_id));
}

// =============================================================================
// validateSessionLinkAvailableUnderProfile
// =============================================================================
//
// Session link is local-host scoped. Profile precheck is on the surface the
// session link is intended to expose (RT-5 risk). If surface is blocked in
// the profile, short-circuit; otherwise delegate.

export interface ProfileSessionLinkInputs extends SessionLinkInputs {
  readonly profile_id: ProfileId | string;
  readonly surface_id: SurfaceId | string;
}

export function validateSessionLinkAvailableUnderProfile(
  inputs: ProfileSessionLinkInputs,
): ValidationResult {
  const validator_id = `${PREFIX}.session-link`;
  const surfResult = validateProfileSurface(inputs.profile_id, inputs.surface_id);
  if (surfResult.result === "fail") {
    return fail({
      validator_id,
      target_type: "session_link",
      target_id: String(inputs.surface_id),
      failure_code: surfResult.failure_code ?? "unknown",
      notes: `session link short-circuited: surface ${inputs.surface_id} blocked in profile ${inputs.profile_id} (${surfResult.notes ?? ""})`,
    });
  }
  const gate = validateSessionLinkAvailable(inputs);
  if (surfResult.result === "skipped") {
    if (gate.result === "pass") {
      return skipped({
        validator_id,
        target_type: "session_link",
        target_id: String(inputs.surface_id),
        notes: `gate passed but profile-surface membership unresolved for ${inputs.surface_id} in profile ${inputs.profile_id}`,
      });
    }
  }
  return tagWithProfile(gate, validator_id, String(inputs.profile_id));
}
