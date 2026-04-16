# FullBody | WB | P4.4 — First Controlled Caller Path Decision

**Stage:** `FullBody | WB | P4.4`
**Branch:** `claude/prep-validation-hardening-5f7Nb`
**Predecessor:** WB P4.3 (commit `d3a6f72` — 2 shell aggregators landed)
**Merged WA dependencies:** WA P1 + P1.1, WA P3.0, WA P4.0.

**Scope (decision only — narrow):** decide the first *invocation mode* for each of the 2 shell aggregator files created in WB P4.3. Default to the narrowest safe mode. No code is wired in this pass. No runtime path, layout render flow, or boot hook is touched.

---

## 1. Invocation mode definitions (used below)

- **`manual_call_only`** — a named caller function exists in a clearly-isolated file (not a runtime entrypoint, not a layout file, not a boot/init hook). The caller exposes the aggregator under a stable symbol so a human operator or a future diagnostic harness can invoke it explicitly, but nothing in the app calls the caller automatically. This is the preferred mode per WB P4.4 instruction §3.
- **`dev_only_explicit_call`** — a dev-only file (e.g. a script that would only run under an explicit dev command) calls the aggregator. **Not used in this pass** — there is no dev harness, no build system, no script runner in this repo, so a "dev-only" file would just be a `manual_call_only` file with a misleading label.
- **`defer_uninvoked`** — no caller file is created. The aggregator remains dormant with zero reachable invocation path. Used when even a manual caller would risk broadening authority.

---

## 2. Per-aggregator invocation decision

### 2.1 `apps/operator-shell/src/app/layout/shell.layout.proof.ts`

| Field | Value |
|---|---|
| **Aggregator symbol** | `operatorShellAggregate(inputs: OperatorShellProofInputs): AggregateProofResult` (from WB P4.3) |
| **Invocation mode** | `manual_call_only` |
| **Approved first caller (file)** | `apps/operator-shell/src/app/layout/shell.layout.proof-run.ts` — a new sibling file next to the aggregator |
| **Exact import path (inside the new caller)** | `./shell.layout.proof.js` (local sibling, same directory) |
| **Invocation trigger** | **manual only** — the file exports a named function (candidate name: `runOperatorShellProof(inputs: OperatorShellProofInputs): AggregateProofResult`) that an external operator must invoke explicitly. The function is not called anywhere in the repo, not wired to any runtime entrypoint, not wired to the layout render flow, not wired to any boot/init hook, and not exposed to any UI |
| **Required input shape** | `OperatorShellProofInputs` = `{ installChain: InstallChainProofInputs }` (from the aggregator's own type export, which in turn requires `{ stampCoverage: InstallCoverageInputs, bridgeActivation: RuntimeBridgeState, bridgeReady: BridgeConfig, activationEligibility: ActivationGateInputs }` as defined in `apps/core-runtime/src/session/install-chain.proof.ts`). Every sub-type is already in the repo from WB P4.1 and earlier stages; no new type is introduced. |
| **One-shot or repeatable** | **repeatable** — the underlying aggregator is a pure function (no state, no side effects, no logging); the caller wrapper inherits that property. Each call computes a fresh `AggregateProofResult` from the inputs provided. |
| **Rollback impact** | **trivial** — `git rm apps/operator-shell/src/app/layout/shell.layout.proof-run.ts`. No other file is touched. No barrel is widened. No existing function is modified. |
| **Why `manual_call_only` over `defer_uninvoked`** | `manual_call_only` is the preferred mode per WB P4.4 instruction §3. Creating a named caller wrapper now gives operators a stable invocation surface without attaching anything to the runtime, layout, or boot path. `defer_uninvoked` would require a separate later re-authorization to add even a diagnostic caller, with no safety gain. |
| **Why not `dev_only_explicit_call`** | There is no dev harness, no build system, no script runner in this repo. A "dev-only" label would be indistinguishable from `manual_call_only` and would just obscure the mode. |

### 2.2 `apps/web-public/src/app/layout/shell.layout.proof.ts`

| Field | Value |
|---|---|
| **Aggregator symbol** | `webPublicShellAggregate(inputs: WebPublicShellProofInputs): AggregateProofResult` (from WB P4.3) |
| **Invocation mode** | `manual_call_only` |
| **Approved first caller (file)** | `apps/web-public/src/app/layout/shell.layout.proof-run.ts` — a new sibling file next to the aggregator |
| **Exact import path (inside the new caller)** | `./shell.layout.proof.js` (local sibling, same directory) |
| **Invocation trigger** | **manual only** — exports `runWebPublicShellProof(inputs: WebPublicShellProofInputs): AggregateProofResult`; same isolation rules as §2.1 |
| **Required input shape** | `WebPublicShellProofInputs` = `{ installChain: InstallChainProofInputs }`; same structural shape as §2.1 |
| **One-shot or repeatable** | **repeatable** — same rationale |
| **Rollback impact** | **trivial** — `git rm apps/web-public/src/app/layout/shell.layout.proof-run.ts` |
| **Why `manual_call_only`** | Symmetric to §2.1 — default narrow-safe mode. |

---

## 3. Approved first caller table

| Aggregator | First caller file (new in P4.5) | Exported symbol (proposed name) | Import edge |
|---|---|---|---|
| `operatorShellAggregate` | `apps/operator-shell/src/app/layout/shell.layout.proof-run.ts` | `runOperatorShellProof(inputs): AggregateProofResult` | `./shell.layout.proof.js` (local sibling only; no cross-app imports from the caller) |
| `webPublicShellAggregate` | `apps/web-public/src/app/layout/shell.layout.proof-run.ts` | `runWebPublicShellProof(inputs): AggregateProofResult` | `./shell.layout.proof.js` (local sibling only; no cross-app imports from the caller) |

**Non-importer constraint.** In P4.5, **nothing else in the repo** will import either `*.proof-run.ts` file. Specifically the following are **not** allowed to import the caller:

- any existing `shell.layout.ts`
- any runtime entrypoint
- any bootstrap file
- any layout render path
- any barrel (`apps/*/src/app/layout/` has no barrel today and must not gain one in P4.5)
- any UI component, UI route, or UI binding
- any test file (test-entry is still blocked — see §5)

The only purpose of the caller file is to expose a named invocation function. Whoever actually invokes it must do so manually, from outside the repo's current runtime path.

---

## 4. Approved_now / defer_later / blocked

### 4.1 `approved_now` — ready for WB P4.5

| # | Item | Notes |
|---|---|---|
| AN-1 | Create `apps/operator-shell/src/app/layout/shell.layout.proof-run.ts` exporting `runOperatorShellProof(inputs: OperatorShellProofInputs): AggregateProofResult` which simply returns `operatorShellAggregate(inputs)` | one file, one function, one import edge; no other changes |
| AN-2 | Create `apps/web-public/src/app/layout/shell.layout.proof-run.ts` exporting `runWebPublicShellProof(inputs: WebPublicShellProofInputs): AggregateProofResult` which simply returns `webPublicShellAggregate(inputs)` | symmetric to AN-1 |

Nothing else is in `approved_now`. No file edit to existing sources. No barrel widening. No runtime wiring. No logging. No UI. No test.

### 4.2 `defer_later`

Each entry is a structurally possible caller/wiring path that is **not** authorized by P4.4, but is noted here so a later stage can consider it.

| # | Deferred item | Why deferred |
|---|---|---|
| DL4.4-1 | A CLI-style diagnostic harness that runs `runOperatorShellProof` and `runWebPublicShellProof` and prints the aggregate to stdout | requires a logging/telemetry path; WB P4.4 instruction §5 forbids logging fan-out |
| DL4.4-2 | A CI check that fails the build if either aggregate `passed === false` | there is no CI, no build system, and no test harness in this repo today |
| DL4.4-3 | A UI exposure (e.g., an operator-shell diagnostics page that renders the `AggregateProofResult`) | WB P4.4 instruction §5 forbids UI exposure unless "explicitly isolated and non-default"; no isolation pattern is proposed in this pass |
| DL4.4-4 | An app-wide proof registry that indexes all callers | WB P4.4 instruction §5 forbids an app-wide proof registry |
| DL4.4-5 | A proof bus / pub-sub layer between proof producers and consumers | forbidden by §5 |
| DL4.4-6 | A boot-time or layout-render auto-call of either caller | forbidden by §3 and §5 |
| DL4.4-7 | Promoting the `proof-run.ts` caller files into any existing barrel (e.g., a layout barrel) | would widen fan-out; not approved here |
| DL4.4-8 | Cross-app invocation (e.g., operator-shell caller running the web-public aggregator) | directly violates app isolation; not approved |

### 4.3 `blocked` — unchanged from prior passes

Every item blocked in WB P4.prep.2, P4.1, P4.2, and P4.3 **stays blocked**. None is pulled forward by this decision.

| Item | Status | Enforcement in P4.5 |
|---|---|---|
| test-entry | **blocked** | no test file imports the caller; no `TEST_ENTRY` consumption point added |
| `isTransportReady` attachment | **blocked** | not imported by the caller (caller only imports its sibling aggregator) |
| `isSessionLinkAvailable` attachment | **blocked** | same |
| Mobile profile (`MOBILE_OPTIMIZED_PROFILE`) | **blocked** | not imported |
| PC profile (`PC_OPTIMIZED_PROFILE`) | **blocked** | not imported |
| `unresolved_domain` path for manifest `declaration_*` fields | **blocked** | not touched |
| Aggregation model changes | **blocked** | caller only re-exports the aggregator's result; no edit to `AggregateProofResult`, `ProofResult`, `PROOF_KINDS`, `FAILURE_CODES`, `RETRYABILITY`, `CONSUMPTION_POINTS`, `INSTALL_CHAIN_GATES`, or `COMPATIBILITY_KINDS` |
| Proof-path redesign | **blocked** | no new adapter, no new caller shape beyond the thin wrapper |
| Closed-set expansion | **blocked** | no new enum value anywhere |
| Runtime auto-execution | **blocked** | caller function is not invoked from any runtime path |
| Logging fan-out | **blocked** | caller returns the `AggregateProofResult` as a value; no `console.log`, no file write, no telemetry |
| Telemetry path | **blocked** | same |
| App-wide proof registry | **blocked** | no registry file created |
| Proof bus | **blocked** | no bus file created |
| Shell/layout behavior edits | **blocked** | existing `shell.layout.ts` files stay untouched |
| UI exposure | **blocked** | no component, no render path, no export to any UI module |

---

## 5. Exact P4.5 edit requirement

The choice is among the three options in WB P4.4 instruction §8:
- **zero source edits** — defer everything
- **one isolated caller file per app** — the narrow-safe default
- **full defer** — equivalent to the first option in this repo

**Decision: one isolated caller file per app.**

Concretely, WB P4.5 is authorized to do **exactly and only** the following, with zero other edits:

1. Create `apps/operator-shell/src/app/layout/shell.layout.proof-run.ts` with this exact content shape (the type imports are resolved via the aggregator's own barrel-free direct path):

   ```ts
   import {
     operatorShellAggregate,
     type OperatorShellProofInputs,
   } from "./shell.layout.proof.js";
   import type { AggregateProofResult } from "<direct path to proof-chassis index>";

   export function runOperatorShellProof(
     inputs: OperatorShellProofInputs,
   ): AggregateProofResult {
     return operatorShellAggregate(inputs);
   }
   ```

2. Create `apps/web-public/src/app/layout/shell.layout.proof-run.ts` with the symmetric content (substituting `webPublicShellAggregate`, `WebPublicShellProofInputs`, `runWebPublicShellProof`).

**Hard limits on P4.5:**

- exactly **2** files created; **0** files modified
- each file contains exactly **1** exported function
- each exported function is a thin wrapper: `return <aggregator>(inputs)`
- no barrel may be edited
- no existing source file may be modified
- no `console.*`, no `process.*`, no file write, no telemetry, no UI, no auto-call
- no import beyond the two listed above per file (`./shell.layout.proof.js` + the `AggregateProofResult` type from proof-chassis)
- no second function, no configuration object, no helper, no side-effect-at-module-load-time constant
- rollback: `git rm` of the two files only

If WB P4.5's instructions conflict with any of the hard limits above, the conflict must be flagged and the operator must re-authorize before P4.5 executes.

---

## 6. Discipline checks against WB P4.4 instructions

- [x] §1 — invocation mode decided for each of the 2 aggregator files (§2)
- [x] §2 — mode is one of `manual_call_only` / `dev_only_explicit_call` / `defer_uninvoked`; `manual_call_only` chosen for both
- [x] §3 — narrowest safe mode preferred; no attachment to runtime entrypoints, layout render flow, or boot/init hooks
- [x] §4 — per-aggregator fields populated (first caller, import path, trigger, input shape, one-shot/repeatable, rollback)
- [x] §5 — no auto-execution, no logging fan-out, no telemetry, no test-entry promotion, no app-wide proof registry, no proof bus, no shell/layout behavior edit, no UI exposure
- [x] §6 — output separated into `approved_now`, `defer_later`, `blocked`
- [x] §7 — every blocked item preserved
- [x] §8 — P4.5 edit requirement stated exactly: **one isolated caller file per app**
- [x] no code wired in this pass; decision document only

---

## 7. Tag packet

```yaml
expected_tag: "FullBody | WB | P4.4"
actual_tag:   "FullBody | WB | P4.4"
result:       pass
failure_code: null
retryable:    false
next_stage:   "FullBody | WB | P4.5"
```
