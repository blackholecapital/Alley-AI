# FullBody | WB | P4.prep.1 — Proof-Integration Prep, Half-Pass 1

**Stage:** `FullBody | WB | P4.prep.1`
**Branch:** `claude/prep-validation-hardening-5f7Nb`
**Merged WA dependencies:**
- `FullBody | WA | P1` + `WA | P1.1` (id/state domain layer)
- `FullBody | WA | P3.0` (compatibility profile layer)
- `FullBody | WA | P4.0` (proof path binding layer — `packages/proof-chassis/`) — merged via commit `04e64ab`

**Scope of this half-pass (narrow):** Section A (consumption-point inventory) and Section B (adapter attachment map) **only**. No aggregation model. No proof-risk analysis. No wiring. No app-behavior changes. `proof-chassis` is treated as the canonical adapter layer — this document does not propose a competing package and does not redefine any shape in `packages/proof-chassis/src/result-domain.ts`.

---

## Section A — Consumption-point inventory

Column legend:
- **File** — the concrete source file
- **Current IO shape** — what the file exports and what it returns at runtime
- **Consumes structured results?** — does this file already import anything from `proof-chassis` or from `validation-chassis`'s structured layer (ValidationResult)?
- **Nearest safe adapter hook** — the lowest-friction place a `proof-chassis` adapter could attach without changing the file's own signature
- **Risk class** — one of: `safe additive adapter`, `wrapper-only`, `signature-risk`, `app-surface risk`, `blocked`, `unresolved`

### A.1 Routes

| File | Current IO shape | Consumes structured results? | Nearest safe adapter hook | Risk class |
|---|---|---|---|---|
| `apps/core-runtime/src/routes/install.route.ts` | exports `INSTALL_ROUTE: Route` (constant literal) — no function, no runtime execution | no | sibling file `install.route.proof.ts` (or a centralized `routes/proof.ts`) that imports the constant + `isValidRoute` + `FULL_BODY_PROFILE` and calls `adaptValidationResult` / `adaptCompatibilityResult` with `consumption_point = CONSUMPTION_POINTS.ROUTE_LAYER` | safe additive adapter |
| `apps/core-runtime/src/routes/update.route.ts` | exports `UPDATE_ROUTE: Route` (constant literal) | no | (same) | safe additive adapter |
| `apps/core-runtime/src/routes/disable.route.ts` | exports `DISABLE_ROUTE: Route` (constant literal) | no | (same) | safe additive adapter |
| `apps/core-runtime/src/routes/remove.route.ts` | exports `REMOVE_ROUTE: Route` (constant literal) | no | (same) | safe additive adapter |
| `apps/core-runtime/src/routes/index.ts` | barrel — re-exports the 4 route constants | no | the barrel is the correct centralized attachment point; a new `routes/proof.ts` file can sit beside it and be re-exported | safe additive adapter |
| `packages/registry-chassis/src/route-registry.ts` (listed in `CONSUMPTION_MAP` under ROUTE_LAYER) | exports `const entries: readonly Route[]` + `lookupRoute()` + `listRoutes()` — lookup-only, no runtime side effects | no | call `listRoutes()` from an adapter caller, fan out through `adaptValidationResult` + `adaptCompatibilityResult` per row | safe additive adapter |

### A.2 Touchpoints

| File | Current IO shape | Consumes structured results? | Nearest safe adapter hook | Risk class |
|---|---|---|---|---|
| `apps/core-runtime/src/touchpoints/install.touchpoint.ts` | exports `INSTALL_TOUCHPOINT: Touchpoint` + `INSTALL_EVENTS: TouchpointEventRefs` + the `TouchpointEventRefs` interface definition | no | sibling `install.touchpoint.proof.ts` or centralized `touchpoints/proof.ts` calling `adaptValidationResult` (via `isValidTouchpoint`) + `adaptCompatibilityResult` (`kind: TOUCHPOINT`, `FULL_BODY_PROFILE.touchpoints`) | safe additive adapter |
| `apps/core-runtime/src/touchpoints/update.touchpoint.ts` | exports `UPDATE_TOUCHPOINT` + `UPDATE_EVENTS` | no | (same) | safe additive adapter |
| `apps/core-runtime/src/touchpoints/disable.touchpoint.ts` | exports `DISABLE_TOUCHPOINT` + `DISABLE_EVENTS` | no | (same) | safe additive adapter |
| `apps/core-runtime/src/touchpoints/remove.touchpoint.ts` | exports `REMOVE_TOUCHPOINT` + `REMOVE_EVENTS` | no | (same) | safe additive adapter |
| `apps/core-runtime/src/touchpoints/index.ts` | barrel — re-exports the 4 touchpoint constants + their events + `TouchpointEventRefs` type | no | centralized attachment point — add `touchpoints/proof.ts` sibling and re-export from barrel | safe additive adapter |
| `apps/operator-shell/src/mounts/install.mount.ts` | exports `INSTALL_MOUNT: Touchpoint` + `isMountAuthorized(): boolean` | no — `isMountAuthorized` returns raw boolean | wrap `isMountAuthorized()` result via `adaptValidationResult` in a new sibling `install.mount.proof.ts`; the existing function is **not** modified in place | wrapper-only |
| `apps/operator-shell/src/mounts/update.mount.ts` | exports `UPDATE_MOUNT` + `isMountAuthorized(): boolean` | no | (same) | wrapper-only |
| `apps/web-public/src/mounts/disable.mount.ts` | exports `DISABLE_MOUNT` + `isMountAuthorized(): boolean` | no | (same) | wrapper-only |
| `apps/web-public/src/mounts/remove.mount.ts` | exports `REMOVE_MOUNT` + `isMountAuthorized(): boolean` | no | (same) | wrapper-only |
| `apps/operator-shell/src/mounts/index.ts` | barrel | no | centralized attachment point for a `mounts/proof.ts` sibling | safe additive adapter |
| `apps/web-public/src/mounts/index.ts` | barrel | no | (same) | safe additive adapter |

### A.3 Bridge / runtime gates

| File | Current IO shape | Consumes structured results? | Nearest safe adapter hook | Risk class |
|---|---|---|---|---|
| `packages/lifecycle-chassis/src/install.lifecycle.ts` | `hasStampCoverage(inputs: InstallCoverageInputs): boolean` — listed in `CONSUMPTION_MAP` under BRIDGE_GATE_LAYER | no | caller-level wrapper: compute the boolean, feed it as the first `InstallChainGateOutcome` (`gate_name = INSTALL_CHAIN_GATES.STAMP_COVERAGE`) into `adaptInstallChainResult` | wrapper-only |
| `packages/runtime-bridge/src/bridge-contract.ts` | `isBridgeActivatable(state: RuntimeBridgeState): boolean` — listed in `CONSUMPTION_MAP` under BRIDGE_GATE_LAYER | no | wrap outcome into `InstallChainGateOutcome { gate_name: BRIDGE_ACTIVATABLE, passed }` before `adaptInstallChainResult` | wrapper-only |
| `apps/core-runtime/src/session/activation-gate.ts` | `isActivationEligible(inputs: ActivationGateInputs): boolean` — listed in `CONSUMPTION_MAP` under BRIDGE_GATE_LAYER | no | wrap outcome into `InstallChainGateOutcome { gate_name: ACTIVATION_ELIGIBLE, passed }` | wrapper-only |
| `apps/local-host/src/bridge/runtime-bridge.ts` | `isBridgeReady(config: BridgeConfig): boolean` — listed in `CONSUMPTION_MAP` under BRIDGE_GATE_LAYER | no | wrap outcome into `InstallChainGateOutcome { gate_name: BRIDGE_READY, passed }` | wrapper-only |
| `packages/session-transport/src/transport-contract.ts` | `isTransportReady(state: TransportState): boolean` — **NOT** listed in any `CONSUMPTION_MAP` binding | no | no current adapter covers it. `proof-chassis` does not yet name this as a gate. Candidate for WB P4.prep.2 flagging | unresolved |
| `apps/local-host/src/transport/session-link.ts` | `isSessionLinkAvailable(config: SessionLinkConfig): boolean` — **NOT** listed in any `CONSUMPTION_MAP` binding | no | no current adapter covers it | unresolved |

### A.4 Shell / operator-facing paths

| File | Current IO shape | Consumes structured results? | Nearest safe adapter hook | Risk class |
|---|---|---|---|---|
| `apps/operator-shell/src/app/layout/shell.layout.ts` | exports `SHELL_CONFIG` constant + `resolveShellSurface(): Surface` — listed in `CONSUMPTION_MAP` under SHELL_OPERATOR_PATH | no | sibling file `shell.layout.proof.ts` exporting a NEW function (e.g. `resolveShellSurfaceProof(): AggregateProofResult`) that calls `aggregateOperatorSummary` over per-shell validation + compatibility + install-chain components. `resolveShellSurface` itself is **not** modified in place | safe additive adapter |
| `apps/web-public/src/app/layout/shell.layout.ts` | exports `SHELL_CONFIG` constant + `resolveShellSurface(): Surface` — listed in `CONSUMPTION_MAP` under SHELL_OPERATOR_PATH | no | (same) | safe additive adapter |

Direct modification of either `resolveShellSurface()` signature would be **app-surface risk** and is explicitly not proposed here.

### A.5 Test-entry paths

| Candidate | Current state | Consumes structured results? | Nearest safe adapter hook | Risk class |
|---|---|---|---|---|
| *(no test directory exists)* | `find` over the workspace shows zero `test/` or `tests/` directories, zero `*.test.ts` / `*.spec.ts` files, and no bootstrap/entry under any `apps/*/src/` | n/a | **no attachment point exists today.** `proof-chassis/src/result-domain.ts::CONSUMPTION_POINTS` publishes only `ROUTE_LAYER`, `TOUCHPOINT_LAYER`, `BRIDGE_GATE_LAYER`, `SHELL_OPERATOR_PATH` — there is no `TEST_ENTRY` constant to tag a result with. | blocked |
| *(WA P4.0 `CONSUMPTION_MAP`)* | does not list any test-layer binding | n/a | see blocked row above | blocked |

Attaching a test-entry adapter is BLOCKED by two missing pieces:
1. no test harness / directory in the workspace
2. no `CONSUMPTION_POINTS.TEST_ENTRY` constant in `proof-chassis/src/result-domain.ts`

Neither can be resolved inside WB P4.prep.1 without authority drift (item 2 is WA-owned).

---

## Section B — Adapter attachment map

One row per adapter exported from `proof-chassis`. Each row lists exactly where — across the 5 areas inventoried in Section A — that adapter can attach safely. `→ wired?` is always **no** in this half-pass; wiring is explicitly deferred.

### B.1 Validation result adapter

- **Source:** `packages/proof-chassis/src/validation.adapter.ts::adaptValidationResult`
- **Input contract:** `{ target_name: string, passed: boolean, consumption_point: ConsumptionPoint, unresolved_domain?: boolean }`
- **Output:** `ProofResult` with `proof_kind = PROOF_KINDS.VALIDATION`
- **Hard rule honored:** does NOT import from `schema-chassis`. Caller supplies `passed` from a WB-side predicate.

| Area | Attachment site | `consumption_point` | Source of `passed` | Notes |
|---|---|---|---|---|
| routes | new `apps/core-runtime/src/routes/proof.ts` fanning out over the 4 `Route` constants and/or `listRoutes()` | `CONSUMPTION_POINTS.ROUTE_LAYER` | `isValidRoute(route)` from `packages/schema-chassis/src/route.schema.ts` | one `ProofResult` per route |
| touchpoints | new `apps/core-runtime/src/touchpoints/proof.ts` over the 4 `Touchpoint` constants | `CONSUMPTION_POINTS.TOUCHPOINT_LAYER` | `isValidTouchpoint(touchpoint)` from `packages/schema-chassis/src/touchpoint.schema.ts` | one `ProofResult` per touchpoint |
| touchpoints / mounts | new `apps/operator-shell/src/mounts/proof.ts` and `apps/web-public/src/mounts/proof.ts` over the 4 mount `Touchpoint` constants | `CONSUMPTION_POINTS.TOUCHPOINT_LAYER` | `isValidTouchpoint(mount)` AND/OR the existing `isMountAuthorized()` boolean return | emit ONE `ProofResult` per mount; if the caller feeds `isMountAuthorized()` the `target_name` must disambiguate (e.g. `"INSTALL_MOUNT::authorization"`) |
| bridge/runtime | n/a — validation adapter does not apply to install-chain gates | — | — | install-chain uses `adaptInstallChainResult` |
| shell/operator | n/a — shell rollup uses `aggregateOperatorSummary`, which consumes validation `ProofResult`s as inputs, not directly | — | — | |
| test-entry | blocked — no test-entry consumption point | — | — | see A.5 |

The `unresolved_domain = true` path of this adapter is reserved for manifest fields whose canonical domains are still empty (`declaration_kind`, `declaration_state`, `declaration_scope`). No manifest-level attachment is proposed in WB P4.prep.1; that decision is part of the next half-pass.

### B.2 Compatibility result adapter

- **Source:** `packages/proof-chassis/src/compatibility.adapter.ts::adaptCompatibilityResult`
- **Input contract:** `{ profile: ProfileConstraint, kind: CompatibilityKind, id: string, consumption_point: ConsumptionPoint }`
- **Output:** `ProofResult` with `proof_kind = PROOF_KINDS.COMPATIBILITY`
- **Hard rule honored:** derived-profile empty buckets resolve to `COMPATIBILITY_UNRESOLVED`, never `COMPATIBILITY_BLOCKED` (WA P3.0 rule).

| Area | Attachment site | `consumption_point` | `profile` | `kind` | `id` |
|---|---|---|---|---|---|
| routes | same `routes/proof.ts` file as B.1 — same fan-out | `CONSUMPTION_POINTS.ROUTE_LAYER` | `FULL_BODY_PROFILE` (the only populated profile) | `COMPATIBILITY_KINDS.ROUTE` | each `Route.route_id` |
| touchpoints (core-runtime) | same `touchpoints/proof.ts` as B.1 | `CONSUMPTION_POINTS.TOUCHPOINT_LAYER` | `FULL_BODY_PROFILE` | `COMPATIBILITY_KINDS.TOUCHPOINT` | each `Touchpoint.touchpoint_id` |
| mounts | same mount-proof sibling files as B.1 | `CONSUMPTION_POINTS.TOUCHPOINT_LAYER` | `FULL_BODY_PROFILE` | `COMPATIBILITY_KINDS.MOUNT` | each mount's `touchpoint_id` (WA P3.0 keys mounts by `TouchpointId`) |
| shell/operator (per-shell surface) | `shell.layout.proof.ts` (see B.4) | `CONSUMPTION_POINTS.SHELL_OPERATOR_PATH` | `FULL_BODY_PROFILE` | `COMPATIBILITY_KINDS.SURFACE` + `COMPATIBILITY_KINDS.SHELL` | `SHELL_CONFIG.surface_id`, `SHELL_CONFIG.shell_id` |
| bridge/runtime | n/a | — | — | — | — |
| test-entry | blocked (A.5) | — | — | — | — |

Mobile / PC profile attachments are **not** listed. WA P3.0 derived profile buckets remain empty. `classifyCompatibility` already returns `UNRESOLVED` for those inputs; the adapter would emit `COMPATIBILITY_UNRESOLVED` with `RETRYABILITY.BLOCKING`. That behavior is correct today, but WB P4.prep.1 does not schedule any attachment that invokes it.

### B.3 Install-chain result adapter

- **Source:** `packages/proof-chassis/src/install-chain.adapter.ts::adaptInstallChainResult`
- **Input contract:** `{ gates: readonly InstallChainGateOutcome[], consumption_point: ConsumptionPoint }`
- **Output:** `ProofResult` with `proof_kind = PROOF_KINDS.INSTALL_CHAIN`
- **Gate name set (closed):** `STAMP_COVERAGE`, `BRIDGE_ACTIVATABLE`, `BRIDGE_READY`, `ACTIVATION_ELIGIBLE`
- **Ordering rule:** caller supplies gates in the canonical install-path order; the adapter reports the first non-passing gate.

| Area | Attachment site | `consumption_point` | `gates[]` (canonical order) |
|---|---|---|---|
| bridge/runtime gates | **one** new caller file (candidate: `apps/core-runtime/src/session/install-chain.proof.ts` or `packages/runtime-bridge/src/install-chain.proof.ts`) that collects the 4 canonical booleans in one pass | `CONSUMPTION_POINTS.BRIDGE_GATE_LAYER` | `[ STAMP_COVERAGE ← hasStampCoverage(inputs), BRIDGE_ACTIVATABLE ← isBridgeActivatable(state), BRIDGE_READY ← isBridgeReady(config), ACTIVATION_ELIGIBLE ← isActivationEligible(inputs) ]` |
| routes | n/a | — | — |
| touchpoints | n/a | — | — |
| shell/operator | n/a directly; the resulting `ProofResult` feeds into `aggregateOperatorSummary` (B.4) | — | — |
| transport-contract / session-link | **unresolved** — not named in `INSTALL_CHAIN_GATES`; cannot be adapted via this adapter without WA extending the gate-name set. | — | — |
| test-entry | blocked (A.5) | — | — |

### B.4 Operator / test summary adapter

- **Source:** `packages/proof-chassis/src/operator-summary.adapter.ts::aggregateOperatorSummary`
- **Input contract:** `{ components: readonly ProofResult[], consumption_point?: ConsumptionPoint, label?: string }`
- **Output:** `AggregateProofResult` with `proof_kind = PROOF_KINDS.AGGREGATE`
- **Rollup rules (from WA P4.0, honored without modification):** `passed = every component.passed`; `failure_code = first non-NONE component failure or AGGREGATE_COMPONENT_FAILED`; `retryability = worst-case of failing components`.

| Area | Attachment site | `consumption_point` | Component sources |
|---|---|---|---|
| shell/operator — operator shell | new `apps/operator-shell/src/app/layout/shell.layout.proof.ts` calling `aggregateOperatorSummary({ components: [...routeProofs, ...touchpointProofs, ...mountProofs, installChainProof, ...shellCompatProofs], consumption_point: SHELL_OPERATOR_PATH, label: "operator_shell" })` | `CONSUMPTION_POINTS.SHELL_OPERATOR_PATH` | B.1 route/touchpoint/mount `ProofResult`s + B.3 install-chain `ProofResult` + B.2 shell/surface compatibility `ProofResult`s |
| shell/operator — web-public shell | new `apps/web-public/src/app/layout/shell.layout.proof.ts` calling `aggregateOperatorSummary({ ..., label: "web_public" })` | `CONSUMPTION_POINTS.SHELL_OPERATOR_PATH` | same mix, filtered to the web-public shell's mounts/routes/surface |
| test-entry | **blocked** — no test harness today; no `TEST_ENTRY` consumption point in `proof-chassis` | — | — |
| routes / touchpoints / bridge | n/a at this adapter level — those layers produce per-target `ProofResult`s that feed B.4 | — | — |

---

## Blocked items for this half-pass

| # | Item | Why blocked in P4.prep.1 | Deferral target |
|---|---|---|---|
| 1 | test-entry consumption point | no `CONSUMPTION_POINTS.TEST_ENTRY` constant in `packages/proof-chassis/src/result-domain.ts`; no test directory exists | wait for WA to publish a test consumption point, or scope a separate proposal in WB P4.prep.2 |
| 2 | `isTransportReady` adapter attachment | `INSTALL_CHAIN_GATES` closed set in `install-chain.adapter.ts` does not name transport readiness | WB P4.prep.2 — flag; WA-owned decision whether to extend the gate-name set |
| 3 | `isSessionLinkAvailable` adapter attachment | same as item 2 | WB P4.prep.2 |
| 4 | Mobile / PC profile attachment listing | derived profile buckets remain empty per WA P3.0 | canonical profile authority; not WB-resolvable |
| 5 | manifest field validation (`declaration_kind`, `declaration_state`, `declaration_scope`) attachment via the `unresolved_domain` path of `adaptValidationResult` | WA P1.1 placeholders still empty; attaching today would emit only `UNMAPPED_DOMAIN` results | canonical authority; parking for later half-pass |
| 6 | aggregation model sketch | explicitly out of scope for P4.prep.1; the `AggregateProofResult` shape already exists in `proof-chassis` and must not be redefined here | WB P4.prep.2 |
| 7 | proof-path risk analysis | explicitly out of scope for P4.prep.1 | WB P4.prep.2 |
| 8 | any adapter wiring, any new file under `packages/` or `apps/`, any edit to `validation-chassis` | explicitly out of scope — P4.prep.1 is documentation-only | WB P4.1 |

---

## Discipline checks

- [x] Only `worker-wb/p4-prep/proof-integration-prep.md` touched; no source edits
- [x] Section A and Section B are the only content beyond this header/discipline block and the tag packet
- [x] No aggregation-model design beyond pointing at the already-landed `AggregateProofResult` shape
- [x] No proof-path risk analysis (deferred to WB P4.prep.2)
- [x] No authority drift: `proof-chassis` treated as canonical adapter layer; no result shape redefined; no competing adapter package proposed
- [x] No Mobile / PC population; derived profiles left empty
- [x] No manifest-field enum guessing; `declaration_*` fields remain parked
- [x] No edits to `contracts-core`, `schema-chassis`, `registry-chassis`, `lifecycle-chassis`, `runtime-bridge`, `session-transport`, `validation-chassis`, `proof-chassis`, or any `apps/*` source

---

## Tag packet

```yaml
expected_tag: "FullBody | WB | P4.prep.1"
actual_tag:   "FullBody | WB | P4.prep.1"
result:       pass
failure_code: null
retryable:    false
next_stage:   "FullBody | WB | P4.prep.2"
```
