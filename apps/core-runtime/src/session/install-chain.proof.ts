// Proof sibling: install chain
// DOWNSTREAM STATUS: non-authoritative — wrapper-only composition of the
// four canonical install-chain boolean helpers into a single
// install-chain ProofResult via `adaptInstallChainResult`.
//
// FullBody | WB | P4.1 — step 5 (bridge gate attachment).
//
// Scope (per WB P4.prep.2 decision):
//   * collect only the 4 canonical install-chain booleans in canonical
//     order (STAMP_COVERAGE → BRIDGE_ACTIVATABLE → BRIDGE_READY →
//     ACTIVATION_ELIGIBLE)
//   * use the existing INSTALL_CHAIN_GATES closed set from proof-chassis
//   * DO NOT include transport/session-link (isTransportReady and
//     isSessionLinkAvailable are explicitly blocked — they are not in
//     the INSTALL_CHAIN_GATES closed set)
//   * no closed-set expansion
//   * each gate helper is imported call-only; no helper is modified
//
// Import edges (call-only, no mutations):
//   lifecycle-chassis::hasStampCoverage   (package — canonical install path)
//   runtime-bridge::isBridgeActivatable   (package — canonical install path)
//   local-host/bridge::isBridgeReady      (app-to-app call-only edge;
//                                          pre-approved in P4.prep.2)
//   ./activation-gate::isActivationEligible (same directory)
//
// Rollback: `git rm apps/core-runtime/src/session/install-chain.proof.ts`.

import {
  adaptInstallChainResult,
  INSTALL_CHAIN_GATES,
  CONSUMPTION_POINTS,
  type InstallChainGateOutcome,
  type ProofResult,
} from "../../../../packages/proof-chassis/src/index.js";
import {
  hasStampCoverage,
  type InstallCoverageInputs,
} from "../../../../packages/lifecycle-chassis/src/index.js";
import {
  isBridgeActivatable,
  type RuntimeBridgeState,
} from "../../../../packages/runtime-bridge/src/index.js";
import {
  isBridgeReady,
  type BridgeConfig,
} from "../../../../apps/local-host/src/bridge/index.js";
import {
  isActivationEligible,
  type ActivationGateInputs,
} from "./activation-gate.js";

export interface InstallChainProofInputs {
  readonly stampCoverage: InstallCoverageInputs;
  readonly bridgeActivation: RuntimeBridgeState;
  readonly bridgeReady: BridgeConfig;
  readonly activationEligibility: ActivationGateInputs;
}

/**
 * Compose the four canonical install-chain booleans into one
 * install-chain ProofResult. Gates are evaluated in the canonical order
 * fixed by `INSTALL_CHAIN_GATES`:
 *   1. STAMP_COVERAGE       — lifecycle-chassis::hasStampCoverage
 *   2. BRIDGE_ACTIVATABLE   — runtime-bridge::isBridgeActivatable
 *   3. BRIDGE_READY         — local-host/bridge::isBridgeReady
 *   4. ACTIVATION_ELIGIBLE  — core-runtime/session::isActivationEligible
 *
 * The adapter reports the first failing gate and emits one ProofResult
 * tagged `CONSUMPTION_POINTS.BRIDGE_GATE_LAYER`.
 */
export function installChainProof(
  inputs: InstallChainProofInputs,
): ProofResult {
  const gates: readonly InstallChainGateOutcome[] = [
    {
      gate_name: INSTALL_CHAIN_GATES.STAMP_COVERAGE,
      passed: hasStampCoverage(inputs.stampCoverage),
    },
    {
      gate_name: INSTALL_CHAIN_GATES.BRIDGE_ACTIVATABLE,
      passed: isBridgeActivatable(inputs.bridgeActivation),
    },
    {
      gate_name: INSTALL_CHAIN_GATES.BRIDGE_READY,
      passed: isBridgeReady(inputs.bridgeReady),
    },
    {
      gate_name: INSTALL_CHAIN_GATES.ACTIVATION_ELIGIBLE,
      passed: isActivationEligible(inputs.activationEligibility),
    },
  ];

  return adaptInstallChainResult({
    gates,
    consumption_point: CONSUMPTION_POINTS.BRIDGE_GATE_LAYER,
  });
}
