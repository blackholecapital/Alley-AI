# FullBody | WB | P4.2 — Proof Consumption Decision

**Stage:** `FullBody | WB | P4.2`
**Branch:** `claude/prep-validation-hardening-5f7Nb`
**Predecessor:** WB P4.1 (commit `ec7569f` — 5 proof sibling files landed)
**Merged WA dependencies:** WA P1 + P1.1, WA P3.0, WA P4.0 (proof-chassis).

**Scope (decision only — narrow):** decide the initial *consumption mode* for each of the 5 proof files created in WB P4.1. Default to the narrowest mode that still preserves the option of later operator/shell aggregation. No code wired. No barrel widened. No runtime hook installed. No logging fan-out. No blocked scope pulled forward.

---

## 1. Consumption mode definitions (used below)

- **`local_only`** — callable only from within the same app directory tree (i.e., under the same top-level `apps/<shell>/` folder). No cross-app reachability granted in this pass.
- **`named_export`** — the file's named symbols are authorized for direct-path import by a specific future caller class. No barrel re-export. No automatic fan-out. Importer list is explicit.
- **`barrel_export`** — re-exported through a directory `index.ts` barrel. **Not used in this pass** — every one of the 5 files avoids barrel widening.
- **`defer_unconsumed`** — no first importer is declared or permitted in this pass. File remains dormant until a later stage authorizes consumption.

**Authorization model:** every file below gets exactly one mode. The mode determines *who may import it first*. In all 5 cases, the first actual importer is still **deferred to a later stage** — no file is consumed in P4.2. The mode is the *policy* for when consumption does arrive.

---

## 2. Per-file consumption decision

### 2.1 `apps/core-runtime/src/routes/proof.ts`

| Field | Value |
|---|---|
| **Exported symbols** | `routeProofs(): readonly ProofResult[]` |
| **Consumption mode** | `named_export` |
| **Why not `local_only`** | The future shell-layout aggregators in `apps/operator-shell/` and `apps/web-public/` (both deferred per WB P4.prep.2 D1/D2) live *outside* `apps/core-runtime/`. A `local_only` classification would block the approved later aggregation path. |
| **Why not `barrel_export`** | Adding `export { routeProofs } from "./proof.js"` to `apps/core-runtime/src/routes/index.ts` would widen the routes barrel, exposing the symbol to any future importer of the barrel — broad fan-out, exactly what WB P4.2 instruction §5 forbids. |
| **Why not `defer_unconsumed`** | The shell aggregators are already structurally named in WB P4.prep.2 (D1, D2) as the intended future caller. Marking the file purely unconsumed would require a separate re-authorization stage to permit what is already approved-in-principle. |
| **First approved importer(s)** | **none in P4.2.** Future authorized importers: the two deferred shell aggregator files (D1 `apps/operator-shell/src/app/layout/shell.layout.proof.ts`, D2 `apps/web-public/src/app/layout/shell.layout.proof.ts`) via direct path `../../../core-runtime/src/routes/proof.js`. |
| **Stays unconsumed in P4.2?** | **yes** — no actual import is added in P4.2 |
| **Why this avoids drift** | Cross-app reachability is granted only by *policy*, not by code. No file imports the symbol. The closed sets stay untouched. Removing the file still requires zero other edits. |
| **Rollback impact** | trivial — `git rm apps/core-runtime/src/routes/proof.ts`. No barrel to unwind, no importer to detach. |

### 2.2 `apps/core-runtime/src/touchpoints/proof.ts`

| Field | Value |
|---|---|
| **Exported symbols** | `touchpointProofs(): readonly ProofResult[]` |
| **Consumption mode** | `named_export` |
| **Why not `local_only`** | Same reason as §2.1 — the shell aggregators are cross-app consumers. |
| **Why not `barrel_export`** | Same — would widen `apps/core-runtime/src/touchpoints/index.ts` beyond the existing `Touchpoint` / `TouchpointEventRefs` surface. |
| **Why not `defer_unconsumed`** | Same — approved future consumer already named in prep. |
| **First approved importer(s)** | **none in P4.2.** Future: D1 and D2 shell aggregators via direct path `../../../core-runtime/src/touchpoints/proof.js`. |
| **Stays unconsumed in P4.2?** | **yes** |
| **Why this avoids drift** | Same as §2.1 — policy-only authorization, no code edge opened. |
| **Rollback impact** | trivial file removal. |

### 2.3 `apps/operator-shell/src/mounts/proof.ts`

| Field | Value |
|---|---|
| **Exported symbols** | `operatorMountProofs(): readonly ProofResult[]` |
| **Consumption mode** | `local_only` |
| **Why `local_only` works here** | The only pre-approved future consumer for this file is `apps/operator-shell/src/app/layout/shell.layout.proof.ts` (D1 from WB P4.prep.2), which lives **inside the same app tree** (`apps/operator-shell/`). Cross-app reachability is not required. |
| **Why not `named_export`** | `named_export` would policy-grant cross-app reachability that no approved consumer needs. Narrowing to `local_only` preserves the least-authority posture. |
| **Why not `barrel_export`** | Same as §2.1 — widening the mounts barrel would fan out to any consumer of the mounts directory. |
| **Why not `defer_unconsumed`** | The in-app shell aggregator (D1) is already the named future caller; policy authorization inside the app tree is safe. |
| **First approved importer(s)** | **none in P4.2.** Future: D1 `apps/operator-shell/src/app/layout/shell.layout.proof.ts` via relative path `../../mounts/proof.js`. |
| **Stays unconsumed in P4.2?** | **yes** |
| **Why this avoids drift** | The app-scoped authorization means web-public cannot import this file; the cross-shell isolation of mount proofs is preserved by construction. |
| **Rollback impact** | trivial file removal. |

### 2.4 `apps/web-public/src/mounts/proof.ts`

| Field | Value |
|---|---|
| **Exported symbols** | `webPublicMountProofs(): readonly ProofResult[]` |
| **Consumption mode** | `local_only` |
| **Why `local_only`** | Symmetric to §2.3 — the only pre-approved future consumer is `apps/web-public/src/app/layout/shell.layout.proof.ts` (D2), same app tree. |
| **Why not the other modes** | Same reasoning as §2.3. |
| **First approved importer(s)** | **none in P4.2.** Future: D2 via relative path `../../mounts/proof.js`. |
| **Stays unconsumed in P4.2?** | **yes** |
| **Why this avoids drift** | Cross-shell isolation preserved; operator-shell cannot reach `webPublicMountProofs`. |
| **Rollback impact** | trivial file removal. |

### 2.5 `apps/core-runtime/src/session/install-chain.proof.ts`

| Field | Value |
|---|---|
| **Exported symbols** | `installChainProof(inputs: InstallChainProofInputs): ProofResult`; type `InstallChainProofInputs` |
| **Consumption mode** | `named_export` |
| **Why not `local_only`** | Both future shell aggregators (D1, D2) need to call `installChainProof` to include the install-chain component in their per-shell aggregate. Those aggregators live in different apps (`apps/operator-shell/` and `apps/web-public/`) from this file (`apps/core-runtime/`). `local_only` would block the approved aggregation path. |
| **Why not `barrel_export`** | The existing `apps/core-runtime/src/session/index.ts` barrel only re-exports `ActivationGateInputs` and `isActivationEligible`. Adding `installChainProof` would widen the session barrel surface and expose the function to any future importer of the session barrel — broad fan-out. |
| **Why not `defer_unconsumed`** | The shell aggregators are the named future consumer; policy authorization is consistent with prep. |
| **First approved importer(s)** | **none in P4.2.** Future: D1 and D2 via direct path `../../../core-runtime/src/session/install-chain.proof.js`. |
| **Stays unconsumed in P4.2?** | **yes** |
| **Why this avoids drift** | The function is a pure computation — zero side effects, no logger, no global state, no runtime hook. Authorizing direct-path import does not open any runtime execution edge; the function still only runs when explicitly called. |
| **Rollback impact** | trivial file removal. |

---

## 3. Export-surface summary table

| File | Mode | Exports in this pass | Barrel touched? | First importer in P4.2 |
|---|---|---|---|---|
| `apps/core-runtime/src/routes/proof.ts` | `named_export` | `routeProofs` | **no** | **none** |
| `apps/core-runtime/src/touchpoints/proof.ts` | `named_export` | `touchpointProofs` | **no** | **none** |
| `apps/operator-shell/src/mounts/proof.ts` | `local_only` | `operatorMountProofs` | **no** | **none** |
| `apps/web-public/src/mounts/proof.ts` | `local_only` | `webPublicMountProofs` | **no** | **none** |
| `apps/core-runtime/src/session/install-chain.proof.ts` | `named_export` | `installChainProof`, `InstallChainProofInputs` | **no** | **none** |

**Barrels touched by this decision:** `0`. The 4 existing barrels remain exactly at their P4.1 state:
- `apps/core-runtime/src/routes/index.ts` — unchanged
- `apps/core-runtime/src/touchpoints/index.ts` — unchanged
- `apps/core-runtime/src/session/index.ts` — unchanged
- `apps/operator-shell/src/mounts/index.ts` — unchanged
- `apps/web-public/src/mounts/index.ts` — unchanged

**No source edits of any kind are produced by this decision document.** WB P4.2 is prep-only.

---

## 4. First approved importer list

**approved_now importers:** none.

No file anywhere in the repo is authorized to import any of the 5 proof symbols in this pass. Every file remains dormant. The consumption modes in §2 grant *policy* reachability for specific future callers, but no call site is created in P4.2.

This means:
- The existing `activation-gate.ts` does **not** import `installChainProof`.
- The existing `shell.layout.ts` files do **not** import any proof symbol.
- The existing route / touchpoint / mount files do **not** import their proof siblings.
- No test file imports any proof symbol (no test harness exists; B1 stays blocked).
- No package under `packages/` imports any proof symbol.

---

## 5. Defer-later list

Each item here is a concrete future consumer that §2 policy-authorizes but which is **not** wired in P4.2.

| # | Would-be importer | Importer status | Mode required | Notes |
|---|---|---|---|---|
| DL-1 | `apps/operator-shell/src/app/layout/shell.layout.proof.ts` | file does not exist; deferred by WB P4.prep.2 D1 | consumes `named_export` (from routes/touchpoints/install-chain) + `local_only` (from operator-shell mounts) | first candidate for a later wiring pass |
| DL-2 | `apps/web-public/src/app/layout/shell.layout.proof.ts` | file does not exist; deferred by WB P4.prep.2 D2 | consumes `named_export` (from routes/touchpoints/install-chain) + `local_only` (from web-public mounts) | symmetric to DL-1 |
| DL-3 | `listRoutes()` / `listTouchpoints()` / `listEvents()` registry fan-out inside the existing proof files | deferred by WB P4.prep.2 D3 | would not change consumption mode; only adds internal iteration inside the proof files themselves | unrelated to export surface |
| DL-4 | any test-entry importer | **blocked** (not deferred) — WB P4.prep.2 B1, no harness + no `TEST_ENTRY` consumption point | n/a until canonical authority publishes a test consumption point | do not promote |
| DL-5 | any runtime auto-execution hook (e.g. tying `installChainProof` to a runtime startup path) | **explicitly blocked** by WB P4.2 instruction §5 "no runtime auto-execution hook" | n/a | do not promote |
| DL-6 | any logger/observer that fans out proof results to stdout, telemetry, or files | **explicitly blocked** by WB P4.2 instruction §5 "no logging fan-out" | n/a | do not promote |
| DL-7 | a repo-wide proof registry (e.g. a `packages/proof-chassis/src/registry.ts` that collects every proof symbol) | **explicitly blocked** by WB P4.2 instruction §5 "no app-wide proof registry" | n/a | do not promote |
| DL-8 | a proof bus (pub/sub layer between producers and consumers of `ProofResult`) | **explicitly blocked** by WB P4.2 instruction §5 "no new proof bus" | n/a | do not promote |

---

## 6. Blocked scope reconfirmation

The blocked set from WB P4.prep.2 stays blocked in full. None of these items are pulled forward by the §2 policy decisions:

| Blocked item | Still blocked in P4.2? | Why |
|---|---|---|
| test-entry attachment | **yes** | no test harness; no `TEST_ENTRY` consumption point |
| `isTransportReady` attachment | **yes** | not in `INSTALL_CHAIN_GATES` closed set |
| `isSessionLinkAvailable` attachment | **yes** | same |
| Mobile profile attachment | **yes** | empty buckets; WA P3.0 unresolved |
| PC profile attachment | **yes** | same |
| `unresolved_domain` path for manifest `declaration_*` fields | **yes** | WA P1.1 placeholders still empty |
| aggregation model changes | **yes** | `AggregateProofResult` shape untouched |
| proof-path redesign | **yes** | no new adapter, no new gate name, no new consumption point, no new proof kind, no new failure code, no new retryability state |
| shell aggregator files (D1, D2) | **yes** | deferred, not promoted by this pass |

---

## 7. Source-edit requirements for P4.3

**Zero source edits are required for P4.3 by this decision.**

If P4.3 wires the deferred shell aggregators (DL-1, DL-2), those aggregators will import from the 5 proof files via the direct paths established in §2. They will **not** require any edit to:
- the 5 proof files themselves (the named symbols already exist)
- any existing barrel (no widening required; the aggregators import via direct path, not through a barrel)
- any existing source under `packages/` (everything lives on the app side)
- any file under `contracts-core`, `proof-chassis`, `schema-chassis`, `lifecycle-chassis`, `runtime-bridge`, `registry-chassis`, `session-transport`, or `validation-chassis`

If P4.3 has a different purpose, this section should be re-evaluated against that purpose's instructions; no implicit authorization is granted here beyond what §2 specifies.

---

## 8. Discipline checks against WB P4.2 instructions

- [x] §1 — each new proof file has an initial consumption mode assigned (§2, §3)
- [x] §2 — default is the narrowest workable mode; `local_only` used where the future consumer is in-app; `named_export` used only where cross-app reachability is required; `barrel_export` not used anywhere
- [x] §3 — consumption map produced for all 5 files
- [x] §4 — per-file rows include exported symbols, allowed importers, unconsumed-in-P4.2 status, drift-avoidance rationale, rollback impact
- [x] §5 — scope kept tight: no shell aggregator promotion, no barrel widening, no app-wide proof registry, no new proof bus, no runtime auto-execution hook, no logging fan-out
- [x] §6 — recommendation separated into approved_now (§2) and defer_later (§5)
- [x] §7 — approved_now targets (the 5 files) support later shell aggregation via the direct-path import edge named in each row, without requiring aggregation today
- [x] §8 — no transport/session-link attachment, no Mobile/PC profile use, no aggregation model change, no closed-set expansion, no behavior change
- [x] no code was wired; no file outside `worker-wb/p4.2/` was written or modified by this pass

---

## 9. Tag packet

```yaml
expected_tag: "FullBody | WB | P4.2"
actual_tag:   "FullBody | WB | P4.2"
result:       pass
failure_code: null
retryable:    false
next_stage:   "FullBody | WB | P4.3"
```
