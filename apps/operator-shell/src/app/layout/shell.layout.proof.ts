// Proof sibling: operator-shell shell layout aggregator
// DOWNSTREAM STATUS: non-authoritative — pure composition of the per-layer
// proof results into a single shell-level AggregateProofResult.
//
// FullBody | WB | P4.3 — step 1 (operator-shell aggregator).
//
// Scope (per WB P4.3 instruction):
//   * direct-path imports only; no barrel edits
//   * composes ONLY:
//       - apps/core-runtime/src/routes/proof.ts          → routeProofs
//       - apps/core-runtime/src/touchpoints/proof.ts     → touchpointProofs
//       - apps/operator-shell/src/mounts/proof.ts        → operatorMountProofs
//       - apps/core-runtime/src/session/install-chain.proof.ts → installChainProof
//   * uses `aggregateOperatorSummary` from proof-chassis
//   * uses ONLY existing proof result types/constants — no closed-set expansion
//   * no runtime auto-execution — function is only invoked when a caller asks
//   * no logging fan-out, no side effects, no global state
//   * no shell behavior change — the existing shell.layout.ts file is not modified
//   * no new authority path
//
// Blocked items stay blocked:
//   * test-entry — not attached (no harness, no TEST_ENTRY consumption point)
//   * isTransportReady / isSessionLinkAvailable — not imported
//   * Mobile / PC profile — not consulted (only FULL_BODY_PROFILE via the
//     per-layer proof files)
//   * manifest declaration_* unresolved_domain expansion — not touched
//   * proof-path redesign — no new adapter, gate name, proof kind,
//     failure code, retryability state, or consumption point
//
// Rollback: `git rm apps/operator-shell/src/app/layout/shell.layout.proof.ts`.

import {
  aggregateOperatorSummary,
  CONSUMPTION_POINTS,
  type AggregateProofResult,
  type ProofResult,
} from "../../../../../packages/proof-chassis/src/index.js";
import { routeProofs } from "../../../../core-runtime/src/routes/proof.js";
import { touchpointProofs } from "../../../../core-runtime/src/touchpoints/proof.js";
import { operatorMountProofs } from "../../mounts/proof.js";
import {
  installChainProof,
  type InstallChainProofInputs,
} from "../../../../core-runtime/src/session/install-chain.proof.js";

export interface OperatorShellProofInputs {
  readonly installChain: InstallChainProofInputs;
}

/**
 * Pure composition: runs every per-layer proof producer that belongs to
 * the operator-shell surface and feeds the results into the proof-chassis
 * operator-summary adapter. Deterministic ordering:
 *   [...routeProofs(), ...touchpointProofs(), ...operatorMountProofs(),
 *    installChainProof(inputs.installChain)]
 *
 * Emits exactly one `AggregateProofResult` tagged
 * `CONSUMPTION_POINTS.SHELL_OPERATOR_PATH`. No side effects.
 */
export function operatorShellAggregate(
  inputs: OperatorShellProofInputs,
): AggregateProofResult {
  const components: readonly ProofResult[] = [
    ...routeProofs(),
    ...touchpointProofs(),
    ...operatorMountProofs(),
    installChainProof(inputs.installChain),
  ];

  return aggregateOperatorSummary({
    components,
    consumption_point: CONSUMPTION_POINTS.SHELL_OPERATOR_PATH,
    label: "operator_shell",
  });
}
