// Proof run caller: web-public
// DOWNSTREAM STATUS: non-authoritative — manual-call-only thin wrapper
// around the local sibling `webPublicShellAggregate` function.
//
// FullBody | WB | P4.5 — step 2 (web-public proof-run caller).
//
// Symmetric to apps/operator-shell/src/app/layout/shell.layout.proof-run.ts.
// Same scope rules, same invocation mode, same hard limits.
//
// Invocation mode: manual_call_only (per WB P4.4 decision).
// Not wired to any runtime entrypoint, layout render flow, boot/init
// hook, UI, test, or telemetry path. Nothing in this repo imports this
// file. A human operator or future diagnostic harness must invoke
// `runWebPublicShellProof(inputs)` explicitly.
//
// Hard scope (WB P4.5 instruction §2, §4, §5):
//   * imports limited to `./shell.layout.proof.js` + `AggregateProofResult`
//     type from proof-chassis
//   * exactly one exported function
//   * thin wrapper — returns `webPublicShellAggregate(inputs)` directly
//   * no side effects
//   * no module-load execution
//   * no logging, telemetry, UI, or env/process branching
//
// Rollback: `git rm apps/web-public/src/app/layout/shell.layout.proof-run.ts`.

import {
  webPublicShellAggregate,
  type WebPublicShellProofInputs,
} from "./shell.layout.proof.js";
import type { AggregateProofResult } from "../../../../../packages/proof-chassis/src/index.js";

export function runWebPublicShellProof(
  inputs: WebPublicShellProofInputs,
): AggregateProofResult {
  return webPublicShellAggregate(inputs);
}
