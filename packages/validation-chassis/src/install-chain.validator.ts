// Install-chain step validators
// DOWNSTREAM STATUS: non-authoritative — wraps the existing boolean gates in
// runtime-bridge / activation-gate / local-host bridge / session-transport /
// session-link with structured ValidationResult outputs that report the FIRST
// missing prior artifact rather than collapsing everything into a single bool.
//
// Authority over the install path is upstream-only. This validator does not
// invent steps, ordering, or artifacts. It checks only what those existing
// helpers already check, but reports the failure with a structured code so
// callers can distinguish "stamp not issued" from "stamped output missing".

import type {
  InstallStamp,
  ResolverOutput,
} from "../../contracts-core/src/chassis/install-stamp.contract.js";
import {
  RESOLVER_STATES,
  CONSISTENCY_RESULTS,
  STAMP_STATES,
} from "../../contracts-core/src/chassis/domain.js";
import { fail, pass, type ValidationResult } from "./result.js";
import { FAILURE_CODES } from "./failure-codes.js";

const VALIDATOR_ID_BRIDGE_ACTIVATABLE =
  "validation-chassis.install-chain.bridge-activatable";
const VALIDATOR_ID_BRIDGE_READY =
  "validation-chassis.install-chain.bridge-ready";
const VALIDATOR_ID_ACTIVATION_ELIGIBLE =
  "validation-chassis.install-chain.activation-eligible";
const VALIDATOR_ID_TRANSPORT_READY =
  "validation-chassis.install-chain.transport-ready";
const VALIDATOR_ID_SESSION_LINK =
  "validation-chassis.install-chain.session-link";

// =============================================================================
// Bridge activation (mirrors packages/runtime-bridge/src/bridge-contract.ts)
// =============================================================================

export interface BridgeActivationInputs {
  readonly install_stamp: InstallStamp;
  readonly stamped_output_present: boolean;
  readonly stamped_install_intake_present: boolean;
  readonly applied_install_record_present: boolean;
}

export function validateBridgeActivatable(
  inputs: BridgeActivationInputs,
): ValidationResult {
  const target = {
    validator_id: VALIDATOR_ID_BRIDGE_ACTIVATABLE,
    target_type: "runtime_bridge",
    target_id: null,
  } as const;

  if (inputs.install_stamp.stamp_state !== STAMP_STATES.ISSUED) {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.STAMP_STATE_NOT_ISSUED,
      notes: `install stamp state is ${inputs.install_stamp.stamp_state}, expected ${STAMP_STATES.ISSUED}`,
    });
  }
  if (!inputs.stamped_output_present) {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.STAMPED_OUTPUT_MISSING,
      notes: "stamped resolver output artifact is not present",
    });
  }
  if (!inputs.stamped_install_intake_present) {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.STAMPED_INSTALL_INTAKE_MISSING,
      notes: "stamped install intake artifact is not present",
    });
  }
  if (!inputs.applied_install_record_present) {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.APPLIED_INSTALL_RECORD_MISSING,
      notes: "applied install record artifact is not present",
    });
  }
  return pass({ ...target, notes: "all bridge activation prerequisites present" });
}

// =============================================================================
// Local-host bridge readiness (mirrors apps/local-host/src/bridge/runtime-bridge.ts)
// =============================================================================

export interface LocalBridgeReadyInputs {
  readonly install_stamp: InstallStamp;
  readonly production_install_verified: boolean;
}

export function validateLocalBridgeReady(
  inputs: LocalBridgeReadyInputs,
): ValidationResult {
  const target = {
    validator_id: VALIDATOR_ID_BRIDGE_READY,
    target_type: "local_host_bridge",
    target_id: null,
  } as const;

  if (inputs.install_stamp.stamp_state !== STAMP_STATES.ISSUED) {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.STAMP_STATE_NOT_ISSUED,
      notes: `install stamp state is ${inputs.install_stamp.stamp_state}, expected ${STAMP_STATES.ISSUED}`,
    });
  }
  if (!inputs.production_install_verified) {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.PRODUCTION_INSTALL_NOT_VERIFIED,
      notes: "production install has not been verified",
    });
  }
  return pass({ ...target, notes: "local-host bridge ready" });
}

// =============================================================================
// Activation eligibility (mirrors apps/core-runtime/src/session/activation-gate.ts)
// =============================================================================

export interface ActivationEligibilityInputs {
  readonly resolverOutput: ResolverOutput;
  readonly installStamp: InstallStamp;
  readonly stampedOutputPresent: boolean;
  readonly stampedInstallIntakePresent: boolean;
  readonly appliedInstallRecordPresent: boolean;
}

export function validateActivationEligible(
  inputs: ActivationEligibilityInputs,
): ValidationResult {
  const target = {
    validator_id: VALIDATOR_ID_ACTIVATION_ELIGIBLE,
    target_type: "session_activation",
    target_id: null,
  } as const;

  if (!inputs.stampedOutputPresent) {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.STAMPED_OUTPUT_MISSING,
      notes: "stamped resolver output artifact is not present",
    });
  }
  if (!inputs.stampedInstallIntakePresent) {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.STAMPED_INSTALL_INTAKE_MISSING,
      notes: "stamped install intake artifact is not present",
    });
  }
  if (!inputs.appliedInstallRecordPresent) {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.APPLIED_INSTALL_RECORD_MISSING,
      notes: "applied install record artifact is not present",
    });
  }
  if (inputs.resolverOutput.resolver_state !== RESOLVER_STATES.RESOLVED) {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.RESOLVER_STATE_NOT_RESOLVED,
      notes: `resolver state is ${inputs.resolverOutput.resolver_state}, expected ${RESOLVER_STATES.RESOLVED}`,
    });
  }
  if (inputs.resolverOutput.consistency_result !== CONSISTENCY_RESULTS.PASS) {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.CONSISTENCY_RESULT_NOT_PASS,
      notes: `consistency result is ${inputs.resolverOutput.consistency_result}, expected ${CONSISTENCY_RESULTS.PASS}`,
    });
  }
  if (inputs.installStamp.stamp_state !== STAMP_STATES.ISSUED) {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.STAMP_STATE_NOT_ISSUED,
      notes: `install stamp state is ${inputs.installStamp.stamp_state}, expected ${STAMP_STATES.ISSUED}`,
    });
  }
  if (inputs.installStamp.resolver_run_id !== inputs.resolverOutput.resolver_run_id) {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.RESOLVER_RUN_ID_MISMATCH,
      notes: `install stamp resolver_run_id ${inputs.installStamp.resolver_run_id} does not match resolver output resolver_run_id ${inputs.resolverOutput.resolver_run_id}`,
    });
  }
  return pass({ ...target, notes: "activation eligibility prerequisites all met" });
}

// =============================================================================
// Transport readiness (mirrors packages/session-transport/src/transport-contract.ts)
// =============================================================================

export interface TransportReadyInputs {
  readonly bridge_activatable: boolean;
  readonly activation_eligible: boolean;
  readonly touchpoint_enabled: boolean;
}

export function validateTransportReady(
  inputs: TransportReadyInputs,
): ValidationResult {
  const target = {
    validator_id: VALIDATOR_ID_TRANSPORT_READY,
    target_type: "session_transport",
    target_id: null,
  } as const;

  if (!inputs.bridge_activatable) {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.BRIDGE_NOT_ACTIVATABLE,
      notes: "upstream bridge is not activatable",
    });
  }
  if (!inputs.activation_eligible) {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.ACTIVATION_NOT_ELIGIBLE,
      notes: "upstream activation gate is not eligible",
    });
  }
  if (!inputs.touchpoint_enabled) {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.TOUCHPOINT_NOT_ENABLED,
      notes: "touchpoint is not enabled",
    });
  }
  return pass({ ...target, notes: "transport ready" });
}

// =============================================================================
// Session link availability (mirrors apps/local-host/src/transport/session-link.ts)
// =============================================================================

export interface SessionLinkInputs {
  readonly bridge_ready: boolean;
  readonly activation_eligible: boolean;
}

export function validateSessionLinkAvailable(
  inputs: SessionLinkInputs,
): ValidationResult {
  const target = {
    validator_id: VALIDATOR_ID_SESSION_LINK,
    target_type: "session_link",
    target_id: null,
  } as const;

  if (!inputs.bridge_ready) {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.BRIDGE_NOT_READY,
      notes: "upstream local-host bridge is not ready",
    });
  }
  if (!inputs.activation_eligible) {
    return fail({
      ...target,
      failure_code: FAILURE_CODES.ACTIVATION_NOT_ELIGIBLE,
      notes: "upstream activation gate is not eligible",
    });
  }
  return pass({ ...target, notes: "session link available" });
}
