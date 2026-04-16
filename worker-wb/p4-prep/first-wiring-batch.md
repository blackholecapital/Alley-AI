# FullBody | WB | P4.prep.2 — First Wiring Batch Decision

**Stage:** `FullBody | WB | P4.prep.2`
**Branch:** `claude/prep-validation-hardening-5f7Nb`
**Predecessor:** `FullBody | WB | P4.prep.1` (see `worker-wb/p4-prep/proof-integration-prep.md`)
**Merged WA dependencies:** WA P1 + P1.1, WA P3.0, WA P4.0 (proof-chassis). No new WA stages beyond P4.0 have landed.

**Scope (narrow, decision-only):** This document splits every attachment point listed in P4.prep.1 into three buckets — `approved_now`, `blocked`, `defer_later` — and specifies the exact dependency-ordered file list for the approved batch. **No code is wired in this pass.** No new proof artifact is created in this pass. No closed set is expanded. No new gate name, proof kind, consumption point, or failure code is proposed.

---

## 1. Bucket summary

| Bucket | Count | Meaning |
|---|---|---|
| `approved_now` | 5 sibling `*.proof.ts` files | Safe-additive or wrapper-only against already-existing closed sets; zero mutation of any existing source file; zero authority drift; trivial rollback (delete file) |
| `blocked` | 8 items | Must not ship in P4.1 without a separate explicit promotion |
| `defer_later` | 3 items | Structurally safe but held back for ordering discipline; next-batch candidates |

---

## 2. Approved now

Every entry in this table is additive: the file does not exist today, and none of the files it imports will be modified. Rollback for every row is "`git rm <file>`". No existing signature is changed.

Adapter column maps to exports from `packages/proof-chassis/src/index.ts` — no other adapter layer is used.

### 2.1 Route layer

| # | New file | Adapter(s) used | `consumption_point` | Risk class | Why safe now | Wraps | Emits | Rollback |
|---|---|---|---|---|---|---|---|---|
| 1 | `apps/core-runtime/src/routes/proof.ts` | `adaptValidationResult`, `adaptCompatibilityResult` | `CONSUMPTION_POINTS.ROUTE_LAYER` | safe additive adapter | New sibling file only; imports the 4 landed `Route` constants (`INSTALL_ROUTE`, `UPDATE_ROUTE`, `DISABLE_ROUTE`, `REMOVE_ROUTE`) plus `isValidRoute` from `schema-chassis` plus `FULL_BODY_PROFILE` from `contracts-core`; does not modify any import target | `isValidRoute(route)` boolean predicate from schema-chassis; `classifyCompatibility(FULL_BODY_PROFILE, "route", route.route_id)` via `adaptCompatibilityResult` | `routeProofs(): readonly ProofResult[]` — 8 results (4 validation + 4 compatibility), each tagged `ROUTE_LAYER` | delete the file |

### 2.2 Touchpoint layer

| # | New file | Adapter(s) used | `consumption_point` | Risk class | Why safe now | Wraps | Emits | Rollback |
|---|---|---|---|---|---|---|---|---|
| 2 | `apps/core-runtime/src/touchpoints/proof.ts` | `adaptValidationResult`, `adaptCompatibilityResult` | `CONSUMPTION_POINTS.TOUCHPOINT_LAYER` | safe additive adapter | New sibling file only; imports the 4 landed `Touchpoint` constants (`INSTALL_TOUCHPOINT`, `UPDATE_TOUCHPOINT`, `DISABLE_TOUCHPOINT`, `REMOVE_TOUCHPOINT`) plus `isValidTouchpoint` plus `FULL_BODY_PROFILE` | `isValidTouchpoint(tp)` boolean; `classifyCompatibility(FULL_BODY_PROFILE, "touchpoint", tp.touchpoint_id)` | `touchpointProofs(): readonly ProofResult[]` — 8 results (4 validation + 4 compatibility), each tagged `TOUCHPOINT_LAYER` | delete the file |

### 2.3 Mount wrapper layer

Two new files (one per shell) because mount declarations live in separate shell directories. Both are wrapper-only: they wrap the existing `isMountAuthorized(): boolean` functions. The wrapper files do not modify `install.mount.ts`, `update.mount.ts`, `disable.mount.ts`, or `remove.mount.ts`.

| # | New file | Adapter(s) used | `consumption_point` | Risk class | Why safe now | Wraps | Emits | Rollback |
|---|---|---|---|---|---|---|---|---|
| 3 | `apps/operator-shell/src/mounts/proof.ts` | `adaptValidationResult`, `adaptCompatibilityResult` | `CONSUMPTION_POINTS.TOUCHPOINT_LAYER` | wrapper-only | Imports `INSTALL_MOUNT`, `UPDATE_MOUNT`, and their existing `isMountAuthorized()` helpers; imports `FULL_BODY_PROFILE`. No edit to any mount file. | `isMountAuthorized()` boolean (×2, one per mount) into `adaptValidationResult({target_name: "INSTALL_MOUNT::authorization", passed, ...})`; `classifyCompatibility(FULL_BODY_PROFILE, "mount", mount.touchpoint_id)` via `adaptCompatibilityResult` | `operatorMountProofs(): readonly ProofResult[]` — 4 results (2 validation + 2 compatibility), each tagged `TOUCHPOINT_LAYER` | delete the file |
| 4 | `apps/web-public/src/mounts/proof.ts` | `adaptValidationResult`, `adaptCompatibilityResult` | `CONSUMPTION_POINTS.TOUCHPOINT_LAYER` | wrapper-only | Symmetric to item 3 for `DISABLE_MOUNT`, `REMOVE_MOUNT` | `isMountAuthorized()` boolean (×2); `classifyCompatibility(..., "mount", ...)` | `webPublicMountProofs(): readonly ProofResult[]` — 4 results, each tagged `TOUCHPOINT_LAYER` | delete the file |

### 2.4 Bridge gate attachment

Exactly **one** new caller file, per the WA P4.0 staged-rollout note ("wire the install-chain adapter into a SINGLE non-authoritative call site"). This entry satisfies stage 3 of that rollout from the WB side by producing a proof sibling; it does not replace any existing boolean helper. The `INSTALL_CHAIN_GATES` closed set is used as-is: `STAMP_COVERAGE`, `BRIDGE_ACTIVATABLE`, `BRIDGE_READY`, `ACTIVATION_ELIGIBLE` — in that order.

| # | New file | Adapter used | `consumption_point` | Risk class | Why safe now | Wraps | Emits | Rollback |
|---|---|---|---|---|---|---|---|---|
| 5 | `apps/core-runtime/src/session/install-chain.proof.ts` | `adaptInstallChainResult` | `CONSUMPTION_POINTS.BRIDGE_GATE_LAYER` | wrapper-only | New sibling file next to `activation-gate.ts`; imports `hasStampCoverage` (lifecycle-chassis), `isBridgeActivatable` (runtime-bridge), `isBridgeReady` (local-host bridge), `isActivationEligible` (core-runtime activation-gate) — every import is call-only. No modification of any of those four files. The 4 gate names come from `INSTALL_CHAIN_GATES`, which is a closed set and stays unchanged. | The 4 boolean helpers listed above, packed into `InstallChainGateOutcome[]` in canonical install-path order | `installChainProof(inputs): ProofResult` — one `ProofResult` tagged `BRIDGE_GATE_LAYER`; first failing gate becomes the reported failure_code `INSTALL_CHAIN_INCOMPLETE` | delete the file |

### 2.5 Shell operator attachments

**None in this batch.** Both shell aggregator files are in `defer_later` (see §4) because they depend on items 1–5 existing first; splitting them into a second batch is safer operationally and avoids bundling a 7-file wiring PR.

---

## 3. Blocked

These items remain **blocked** for WB P4.1 unless a separate, explicit promotion is issued. Each row mirrors the blocked list from P4.prep.1 §Blocked items, plus the new P4.prep.2-specific blocks for structural invention and closed-set expansion.

| # | Blocked item | Why blocked | Blocker owner |
|---|---|---|---|
| B1 | Test-entry attachment of any adapter | No test harness exists in the workspace; `proof-chassis/src/result-domain.ts::CONSUMPTION_POINTS` publishes no `TEST_ENTRY` constant | WA (would need a new consumption point) + project scaffolding |
| B2 | `isTransportReady` adapter attachment (`packages/session-transport/src/transport-contract.ts`) | Not named in `INSTALL_CHAIN_GATES` closed set; adding a name would be closed-set expansion | WA — closed-set expansion is WA-owned |
| B3 | `isSessionLinkAvailable` adapter attachment (`apps/local-host/src/transport/session-link.ts`) | Same as B2 | WA |
| B4 | Mobile profile attachment against `adaptCompatibilityResult` (any kind) | `MOBILE_OPTIMIZED_PROFILE` buckets are empty per WA P3.0; attachments would emit only `COMPATIBILITY_UNRESOLVED` and would not add value | WA P3.x (profile authority) |
| B5 | PC profile attachment against `adaptCompatibilityResult` (any kind) | Same as B4 for `PC_OPTIMIZED_PROFILE` | WA P3.x |
| B6 | `unresolved_domain = true` path of `adaptValidationResult` (manifest `declaration_kind`, `declaration_state`, `declaration_scope`) | `DECLARATION_KINDS` / `DECLARATION_STATES` / `DECLARATION_SCOPES` placeholders still empty per WA P1.1; attachment today would only emit `UNMAPPED_DOMAIN` | WA P1.x (canonical authority for manifest enums) |
| B7 | Aggregation model expansion (any change to `ProofResult`, `AggregateProofResult`, `PROOF_KINDS`, `FAILURE_CODES`, `CONSUMPTION_POINTS`, `RETRYABILITY`, `DiagnosticTagPacket`) | WA P4.0 result-domain shape is canonical; P4.prep.2 uses it as-is | WA |
| B8 | Proof-path redesign of any kind (new adapter module, new gate name, parallel result shape) | Would compete with or redefine proof-chassis | WA |

**Result of this blocked set:** the first wiring batch touches zero blocked items. Every approved file in §2 uses only landed symbols from `proof-chassis`, `contracts-core`, `schema-chassis`, `lifecycle-chassis`, `runtime-bridge`, and the existing app-side constants.

---

## 4. Defer later

Items that are structurally safe-additive but are deliberately held out of the first batch. They are candidates for the immediate follow-up batch after the first approved batch lands.

| # | Deferred item | Would-be file path | Adapter | Why deferred |
|---|---|---|---|---|
| D1 | Operator-shell aggregator sibling | `apps/operator-shell/src/app/layout/shell.layout.proof.ts` | `aggregateOperatorSummary` | Depends on items 1–5 (routes/touchpoints/mounts/bridge-gate proofs) being wired first. Scheduling in a second batch preserves strict dependency order and keeps the first PR small and reviewable. Not a scope question — a sequencing question. |
| D2 | Web-public aggregator sibling | `apps/web-public/src/app/layout/shell.layout.proof.ts` | `aggregateOperatorSummary` | Symmetric to D1. Same sequencing rationale. |
| D3 | `listRoutes()` / `listTouchpoints()` / `listEvents()` fan-out in `*.proof.ts` files | (same proof files as items 1 and 2) | same as items 1 and 2 | The first batch uses the 4 static Route/Touchpoint constants directly. A later batch can extend the proof files to also iterate `packages/registry-chassis/*-registry.ts::list*()` so that drift between apps and registries is caught by the proof path. Deferred because it introduces a second source of truth per proof and is better resolved once the first batch is in and observable. |

Neither D1 nor D2 modifies any existing file, adds a new gate name, or changes any closed set. They are purely ordering-deferred. D3 is logically an extension of items 1/2, not a new attachment point.

---

## 5. First wiring batch — exact order

Dependency-ordered execution list for the approved batch. Every file is new; every import target is read-only. Each step is independently rollback-safe.

| Step | File path | Adapter(s) | Consumption tag | Depends on | Risk class | Separation |
|---|---|---|---|---|---|---|
| 1 | `apps/core-runtime/src/routes/proof.ts` | `adaptValidationResult`, `adaptCompatibilityResult` | `ROUTE_LAYER` | (none) | safe additive adapter | ROUTE LAYER |
| 2 | `apps/core-runtime/src/touchpoints/proof.ts` | `adaptValidationResult`, `adaptCompatibilityResult` | `TOUCHPOINT_LAYER` | (none — parallel to step 1) | safe additive adapter | TOUCHPOINT LAYER |
| 3 | `apps/operator-shell/src/mounts/proof.ts` | `adaptValidationResult`, `adaptCompatibilityResult` | `TOUCHPOINT_LAYER` | step 2 (conceptually; no import edge) | wrapper-only | MOUNT WRAPPER |
| 4 | `apps/web-public/src/mounts/proof.ts` | `adaptValidationResult`, `adaptCompatibilityResult` | `TOUCHPOINT_LAYER` | step 2 (conceptually; no import edge) | wrapper-only | MOUNT WRAPPER |
| 5 | `apps/core-runtime/src/session/install-chain.proof.ts` | `adaptInstallChainResult` | `BRIDGE_GATE_LAYER` | (none — standalone caller of 4 existing boolean helpers) | wrapper-only | BRIDGE GATE |

**Strict requirements enforced by this ordering:**

- Steps 1–5 introduce **zero** modifications to any existing file.
- Steps 1–5 introduce **zero** new exports from any existing file's barrel. Each new `*.proof.ts` has its own exports; updating the barrels is a follow-up batch concern, not this batch's responsibility.
- Steps 1–5 use **only** adapter exports from `packages/proof-chassis/src/index.ts`. No direct import from any other adapter package.
- Steps 1–5 use **only** the existing `INSTALL_CHAIN_GATES` closed set — no new gate name is proposed.
- Steps 1–5 use **only** the existing `CONSUMPTION_POINTS` closed set — no new consumption point is proposed.
- Steps 1–5 do **not** touch `isTransportReady` or `isSessionLinkAvailable`; both remain in blocked (B2, B3).
- Steps 1–5 do **not** touch any profile other than `FULL_BODY_PROFILE`.
- Steps 1–5 do **not** touch `declaration_kind`, `declaration_state`, or `declaration_scope`.
- Steps 1–5 do **not** invoke `aggregateOperatorSummary`. Aggregation is the deferred second-batch concern (D1, D2).
- Steps 1–5 do **not** modify or redefine any `proof-chassis` type or constant.

**Separation rule check (P4.prep.2 instruction §5):**

| Layer | Contains | Mixed with another layer? |
|---|---|---|
| route layer attachments | step 1 | no |
| touchpoint layer attachments | step 2 | no |
| mount wrapper attachments | steps 3, 4 | no |
| bridge gate attachment | step 5 | no |
| shell operator attachments | — (deferred) | n/a (deferred) |

Each layer is in exactly one file (or two symmetric files for mounts, one per shell). No file crosses layer boundaries.

---

## 6. Risk notes per approved item

| Step | Primary risk | Mitigation |
|---|---|---|
| 1 (routes/proof.ts) | If `schema-chassis` `isValidRoute` drifts in the future, this file's validation proof will flip without the source file being touched | proof file is additive; any flip is observable via the ProofResult, which is the exact intent |
| 2 (touchpoints/proof.ts) | Same as step 1 for `isValidTouchpoint` | same — observable, not silent |
| 3 (operator-shell mounts/proof.ts) | Wraps `isMountAuthorized()` whose current semantics are surface-literal check only; any future change to that function changes the proof output | additive; trivially reversible |
| 4 (web-public mounts/proof.ts) | Same as step 3 | same |
| 5 (install-chain.proof.ts) | Composes 4 gate helpers across 4 different source files; runtime input surface is the largest in this batch (requires `ResolverOutput`, `InstallStamp`, `BridgeConfig`, `RuntimeBridgeState`, `ActivationGateInputs`) | (a) all 4 helpers are pre-existing and pre-tested; (b) the composition is strictly sequential per `INSTALL_CHAIN_GATES` canonical order; (c) the file is a pure function — no global state, no side effects; (d) trivially reversible |

**None of the 5 approved items introduces a new failure code, new gate name, new consumption point, new profile, or new proof kind.** Every symbol referenced already exists and is closed-set-approved upstream.

---

## 7. Discipline checks against WB P4.prep.2 instructions

- [x] §1 — every candidate from P4.prep.1 placed into `approved_now`, `blocked`, or `defer_later`
- [x] §2 — `approved_now` contains only safe-additive or wrapper-only items against existing closed sets, with no authority drift and no existing source mutation
- [x] §3 — exact first wiring order produced (5 steps, file paths, adapters, tags, dependency, risk class)
- [x] §4 — test-entry / transport / session-link / Mobile / PC / unresolved-domain placeholders / aggregation model expansion / proof-path redesign are ALL in the blocked table and none are present in the approved batch
- [x] §5 — route / touchpoint / mount / bridge / shell layer attachments explicitly separated; shell layer is empty-for-this-batch and deferred
- [x] §6 — per-approved-item columns filled (why safe, what wrapped, what emitted, rollback)
- [x] §7 — no code wired in this pass (documentation only)
- [x] no new gate name introduced
- [x] `INSTALL_CHAIN_GATES` closed set remains unchanged
- [x] attachment order is explicit and dependency-respecting
- [x] safe-additive and wrapper-only clearly separated in §2 column "Risk class"

---

## 8. Tag packet

```yaml
expected_tag: "FullBody | WB | P4.prep.2"
actual_tag:   "FullBody | WB | P4.prep.2"
result:       pass
failure_code: null
retryable:    false
next_stage:   "FullBody | WB | P4.1"
```
