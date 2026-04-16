// Upstream authority: xyz-factory-system
// DOWNSTREAM STATUS: non-authoritative — install-chain result adapter only.
//
// WA P4.0 — wraps the *results* of existing install-chain boolean gates
// into a structured ProofResult. This adapter does NOT re-implement any
// gate. It takes already-computed boolean outcomes from the existing
// package-level helpers:
//
//   packages/lifecycle-chassis/src/install.lifecycle.ts::hasStampCoverage
//   packages/runtime-bridge/src/bridge-contract.ts::isBridgeActivatable
//   apps/local-host/src/bridge/runtime-bridge.ts::isBridgeReady
//   apps/core-runtime/src/session/activation-gate.ts::isActivationEligible
//
// Gates are evaluated in the explicit install path order:
//   stamped-output  →  stamped-install-intake  →  applied-install-record
//   →  runtime activation
//
// The adapter walks the supplied gates in the caller-provided order and
// reports the first non-passing gate as the failure. If every gate
// passes, the aggregate passes. Order matters; the caller is
// responsible for supplying gates in the canonical install path order.

import {
  PROOF_KINDS,
  FAILURE_CODES,
  RETRYABILITY,
  type ConsumptionPoint,
  type ProofResult,
} from "./result-domain.js";

const STAGE_TAG = "FullBody | WA | P4.0";

// Canonical gate names — closed set. Adapters may not invent new names.
export const INSTALL_CHAIN_GATES = {
  STAMP_COVERAGE: "gate.hasStampCoverage",
  BRIDGE_ACTIVATABLE: "gate.isBridgeActivatable",
  BRIDGE_READY: "gate.isBridgeReady",
  ACTIVATION_ELIGIBLE: "gate.isActivationEligible",
} as const;
export type InstallChainGateName =
  (typeof INSTALL_CHAIN_GATES)[keyof typeof INSTALL_CHAIN_GATES];

export interface InstallChainGateOutcome {
  readonly gate_name: InstallChainGateName;
  readonly passed: boolean;
}

export interface InstallChainAdapterInputs {
  /**
   * Ordered gate outcomes. Caller computes each boolean by calling the
   * existing helper function (hasStampCoverage / isBridgeActivatable /
   * isBridgeReady / isActivationEligible) and passes the results here.
   * Order must follow the canonical install path; the adapter reports
   * the first failing gate as the blocker.
   */
  readonly gates: readonly InstallChainGateOutcome[];
  readonly consumption_point: ConsumptionPoint;
}

export function adaptInstallChainResult(
  inputs: InstallChainAdapterInputs,
): ProofResult {
  const { gates, consumption_point } = inputs;

  const firstFailure = gates.find((g) => !g.passed);
  const passed = firstFailure === undefined;

  const failure_code = passed
    ? FAILURE_CODES.NONE
    : FAILURE_CODES.INSTALL_CHAIN_INCOMPLETE;

  const retryability = passed
    ? RETRYABILITY.RETRYABLE
    : RETRYABILITY.BLOCKING;

  const operator_summary = passed
    ? "install-chain passed (stamped-output → stamped-install-intake → applied-install-record → activation)"
    : `install-chain blocked at ${firstFailure!.gate_name}`;

  return {
    proof_kind: PROOF_KINDS.INSTALL_CHAIN,
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
