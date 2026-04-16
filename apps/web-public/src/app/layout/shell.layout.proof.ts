// Proof sibling: web-public shell layout aggregator
// DOWNSTREAM STATUS: non-authoritative — pure composition of the per-layer
// proof results into a single shell-level AggregateProofResult.
//
// FullBody | WB | P4.3 — step 2 (web-public aggregator).
//
// Symmetric to apps/operator-shell/src/app/layout/shell.layout.proof.ts.
// Same scope rules, same adapter, same closed sets, same blocked items.
// Only the mount proof source differs (web-public mounts instead of
// operator-shell mounts).
//
// Scope (per WB P4.3 instruction):
//   * direct-path imports only; no barrel edits
//   * composes ONLY:
//       - apps/core-runtime/src/routes/proof.ts          → routeProofs
//       - apps/core-runtime/src/touchpoints/proof.ts     → touchpointProofs
//       - apps/web-public/src/mounts/proof.ts            → webPublicMountProofs
//       - apps/core-runtime/src/session/install-chain.proof.ts → installChainProof
//   * uses `aggregateOperatorSummary` from proof-chassis
//   * uses ONLY existing proof result types/constants — no closed-set expansion
//   * no runtime auto-execution, no logging fan-out, no side effects
//   * no shell behavior change — the existing shell.layout.ts file is not modified
//   * no new authority path
//
// Rollback: `git rm apps/web-public/src/app/layout/shell.layout.proof.ts`.

import {
  aggregateOperatorSummary,
  CONSUMPTION_POINTS,
  type AggregateProofResult,
  type ProofResult,
} from "../../../../../packages/proof-chassis/src/index.js";
import { routeProofs } from "../../../../core-runtime/src/routes/proof.js";
import { touchpointProofs } from "../../../../core-runtime/src/touchpoints/proof.js";
import { webPublicMountProofs } from "../../mounts/proof.js";
import {
  installChainProof,
  type InstallChainProofInputs,
} from "../../../../core-runtime/src/session/install-chain.proof.js";

export interface WebPublicShellProofInputs {
  readonly installChain: InstallChainProofInputs;
}

/**
 * Pure composition: runs every per-layer proof producer that belongs to
 * the web-public shell surface and feeds the results into the
 * proof-chassis operator-summary adapter. Deterministic ordering:
 *   [...routeProofs(), ...touchpointProofs(), ...webPublicMountProofs(),
 *    installChainProof(inputs.installChain)]
 *
 * Emits exactly one `AggregateProofResult` tagged
 * `CONSUMPTION_POINTS.SHELL_OPERATOR_PATH`. No side effects.
 */
export function webPublicShellAggregate(
  inputs: WebPublicShellProofInputs,
): AggregateProofResult {
  const components: readonly ProofResult[] = [
    ...routeProofs(),
    ...touchpointProofs(),
    ...webPublicMountProofs(),
    installChainProof(inputs.installChain),
  ];

  return aggregateOperatorSummary({
    components,
    consumption_point: CONSUMPTION_POINTS.SHELL_OPERATOR_PATH,
    label: "web_public",
  });
}
