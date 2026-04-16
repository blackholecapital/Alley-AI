// Proof run caller: operator-shell
// DOWNSTREAM STATUS: non-authoritative — manual-call-only thin wrapper
// around the local sibling `operatorShellAggregate` function.
//
// FullBody | WB | P4.5 — step 1 (operator-shell proof-run caller).
//
// Invocation mode: manual_call_only (per WB P4.4 decision).
// This file is NOT wired to any runtime entrypoint, layout render flow,
// boot/init hook, UI, test, or telemetry path. Nothing in this repo
// imports this file. A human operator or future diagnostic harness
// must invoke `runOperatorShellProof(inputs)` explicitly.
//
// Hard scope (WB P4.5 instruction §2, §4, §5):
//   * imports limited to `./shell.layout.proof.js` + `AggregateProofResult`
//     type from proof-chassis
//   * exactly one exported function
//   * thin wrapper — returns `operatorShellAggregate(inputs)` directly
//   * no side effects
//   * no module-load execution
//   * no logging, telemetry, UI, or env/process branching
//
// Rollback: `git rm apps/operator-shell/src/app/layout/shell.layout.proof-run.ts`.

import {
  operatorShellAggregate,
  type OperatorShellProofInputs,
} from "./shell.layout.proof.js";
import type { AggregateProofResult } from "../../../../../packages/proof-chassis/src/index.js";

export function runOperatorShellProof(
  inputs: OperatorShellProofInputs,
): AggregateProofResult {
  return operatorShellAggregate(inputs);
}
