# FullBody | WB | P4.7 — Proof-Run Retention Decision (zero-edit)

**Stage:** `FullBody | WB | P4.7`
**Branch:** `claude/prep-validation-hardening-5f7Nb`
**Predecessor:** WB P4.6 (commit `e0e0b0e` — manual verification gate specified)
**Merged WA dependencies:** WA P1 + P1.1, WA P3.0, WA P4.0.

**Scope:** zero-edit review of the manual verification outcome from WB P4.6 against gate checks C1–C5, and declaration of the retention decision for the proof-run path. Zero source edits. No new source files. No barrel edits. No runtime hookup. No test-entry promotion. The only artifact committed in this stage is this worker-isolated decision document.

---

## 1. Under-review surface

Nine proof-related files across the tree, all landed in prior WB P4.x stages:

| # | File | Stage landed | Purpose |
|---|---|---|---|
| 1 | `apps/core-runtime/src/routes/proof.ts` | P4.1 | `routeProofs(): readonly ProofResult[]` |
| 2 | `apps/core-runtime/src/touchpoints/proof.ts` | P4.1 | `touchpointProofs(): readonly ProofResult[]` |
| 3 | `apps/operator-shell/src/mounts/proof.ts` | P4.1 | `operatorMountProofs(): readonly ProofResult[]` |
| 4 | `apps/web-public/src/mounts/proof.ts` | P4.1 | `webPublicMountProofs(): readonly ProofResult[]` |
| 5 | `apps/core-runtime/src/session/install-chain.proof.ts` | P4.1 | `installChainProof(inputs): ProofResult` |
| 6 | `apps/operator-shell/src/app/layout/shell.layout.proof.ts` | P4.3 | `operatorShellAggregate(inputs): AggregateProofResult` |
| 7 | `apps/web-public/src/app/layout/shell.layout.proof.ts` | P4.3 | `webPublicShellAggregate(inputs): AggregateProofResult` |
| 8 | `apps/operator-shell/src/app/layout/shell.layout.proof-run.ts` | P4.5 | `runOperatorShellProof(inputs): AggregateProofResult` |
| 9 | `apps/web-public/src/app/layout/shell.layout.proof-run.ts` | P4.5 | `runWebPublicShellProof(inputs): AggregateProofResult` |

---

## 2. Gate results for C1–C5

### C1 — wrapper returns `proof.aggregate`

**Status: PASS (both wrappers).**

Call chain verified by static trace through the 4 files relevant to each shell:

```
runOperatorShellProof(inputs)
  → operatorShellAggregate(inputs)
    → aggregateOperatorSummary({ components, consumption_point: SHELL_OPERATOR_PATH, label: "operator_shell" })
      → returns { proof_kind: PROOF_KINDS.AGGREGATE /* = "proof.aggregate" */, ... }
```

```
runWebPublicShellProof(inputs)
  → webPublicShellAggregate(inputs)
    → aggregateOperatorSummary({ components, consumption_point: SHELL_OPERATOR_PATH, label: "web_public" })
      → returns { proof_kind: PROOF_KINDS.AGGREGATE /* = "proof.aggregate" */, ... }
```

Anchor evidence:
- `apps/operator-shell/src/app/layout/shell.layout.proof-run.ts:33` — `return operatorShellAggregate(inputs);`
- `apps/web-public/src/app/layout/shell.layout.proof-run.ts:36` — `return webPublicShellAggregate(inputs);`
- `apps/operator-shell/src/app/layout/shell.layout.proof.ts:70` — `return aggregateOperatorSummary({ ... });`
- `apps/web-public/src/app/layout/shell.layout.proof.ts:65` — `return aggregateOperatorSummary({ ... });`
- `packages/proof-chassis/src/operator-summary.adapter.ts:94` — `proof_kind: PROOF_KINDS.AGGREGATE,`

### C2 — no side effects

**Status: PASS.**

Grep over all 9 proof files (glob `**/*proof*.ts` under `apps/`) for the canonical side-effect primitives: `console.`, `process.`, `require(`, `fs.`, `fetch(`, `document.`, `window.`, `setTimeout`, `setInterval`, `Math.random`.

**Result: 0 matches** across all 9 files. Every file is pure: only function declarations, imports, and a single `return` per exported function.

Module-load behavior confirmed zero: no top-level invocation, no singleton construction outside the declared `const ROUTES` / `const TOUCHPOINTS` / `const OPERATOR_SHELL_MOUNTS` / `const WEB_PUBLIC_MOUNTS` array literals, no IIFE, no top-level `await`, no ambient side effect.

### C3 — import paths resolve

**Status: PASS.**

Every direct-path import across the 9 files was resolved via `realpath` from its declaring file. All 12 cross-file edges from the 2 shell-layout aggregators land on existing files:

| Import edge (operator-shell) | Resolution |
|---|---|
| `./shell.layout.proof.ts` | OK |
| `../../../../../packages/proof-chassis/src/index.ts` | OK |
| `../../../../core-runtime/src/routes/proof.ts` | OK |
| `../../../../core-runtime/src/touchpoints/proof.ts` | OK |
| `../../mounts/proof.ts` | OK |
| `../../../../core-runtime/src/session/install-chain.proof.ts` | OK |

| Import edge (web-public) | Resolution |
|---|---|
| `./shell.layout.proof.ts` | OK |
| `../../../../../packages/proof-chassis/src/index.ts` | OK |
| `../../../../core-runtime/src/routes/proof.ts` | OK |
| `../../../../core-runtime/src/touchpoints/proof.ts` | OK |
| `../../mounts/proof.ts` | OK |
| `../../../../core-runtime/src/session/install-chain.proof.ts` | OK |

Internal edges inside each proof producer (routes, touchpoints, mounts, install-chain) were resolved when those files were landed in P4.1 and remain unchanged.

### C4 — aggregate shape valid and `components.length === 21`

**Status: PASS (both aggregators).**

Static component count derived from the constants actually exported by the source files:

| Constant set | Count (grep-verified) |
|---|---|
| `_ROUTE: Route` constants under `apps/core-runtime/src/routes/` | 4 (INSTALL_ROUTE, UPDATE_ROUTE, DISABLE_ROUTE, REMOVE_ROUTE) |
| `_TOUCHPOINT: Touchpoint` constants under `apps/core-runtime/src/touchpoints/` | 4 (INSTALL_TOUCHPOINT, UPDATE_TOUCHPOINT, DISABLE_TOUCHPOINT, REMOVE_TOUCHPOINT) |
| `_MOUNT: Touchpoint` constants under `apps/operator-shell/src/mounts/` | 2 (INSTALL_MOUNT, UPDATE_MOUNT) |
| `_MOUNT: Touchpoint` constants under `apps/web-public/src/mounts/` | 2 (DISABLE_MOUNT, REMOVE_MOUNT) |

Per-aggregator component arithmetic (2 proofs per artifact: validation + compatibility; install-chain contributes a single composite ProofResult):

| Aggregator | routes | touchpoints | mounts | install-chain | **total** |
|---|---|---|---|---|---|
| `operatorShellAggregate` | 4 × 2 = 8 | 4 × 2 = 8 | 2 × 2 = 4 | 1 | **21** |
| `webPublicShellAggregate` | 4 × 2 = 8 | 4 × 2 = 8 | 2 × 2 = 4 | 1 | **21** |

`AggregateProofResult` structural shape is preserved by the single uninlined call site `aggregateOperatorSummary({ components, consumption_point, label })`, which WA P4.0 guarantees returns every required field (`proof_kind`, `consumption_point`, `passed`, `retryability`, `failure_code`, `operator_summary`, `diagnostic`, `components`).

### C5 — blocked items remain excluded

**Status: PASS.**

Grep across the 9 proof files for the blocked-symbol set: `isTransportReady | isSessionLinkAvailable | MOBILE_OPTIMIZED | PC_OPTIMIZED | unresolved_domain | declaration_kind | declaration_state | declaration_scope`.

**Result: 4 matches, all comment-only.**

| Match | Location | Kind |
|---|---|---|
| `isTransportReady` / `isSessionLinkAvailable` | `apps/core-runtime/src/session/install-chain.proof.ts:13–14` | comment explaining exclusion from `INSTALL_CHAIN_GATES` |
| `isTransportReady` / `isSessionLinkAvailable` | `apps/operator-shell/src/app/layout/shell.layout.proof.ts:23` | comment explaining non-import |
| `manifest declaration_* unresolved_domain` | `apps/operator-shell/src/app/layout/shell.layout.proof.ts:26` | comment documenting parking status |

No `import` line, no `require`, no call site, no symbol reference in executable code for any blocked item. Mobile / PC profile constants are never mentioned — not even in comments.

---

## 3. Decision

**`accept_for_retention`** — all five gate checks pass for **both** `runOperatorShellProof` and `runWebPublicShellProof`. The proof-run path is accepted for freeze-track retention.

Rationale against WB P4.7 instruction §4: "choose `accept_for_retention` only if all C1–C5 are satisfied for both wrappers." All five are satisfied for both. There is no gap that requires a retention note, and none of the §6 rejection criteria is met (no contradiction with landed scope, no blocked-scope leak, no side effects, `AggregateProofResult` contract is stable under `proof-chassis`, no runtime drift because no runtime path is touched).

---

## 4. Confirmation: zero edits made in this stage

```
git diff HEAD -- .
```

→ **zero lines of output** before this decision document was created. After adding only `worker-wb/p4.7/retention-decision.md`:

- **0** source files modified
- **0** new source files created under `apps/`, `packages/`, or `xyz-factory-system/`
- **0** barrel files touched
- **0** test files created
- **0** CLI / harness / script files created
- **0** runtime hookups added
- **0** new entries in any closed set (`PROOF_KINDS`, `CONSUMPTION_POINTS`, `FAILURE_CODES`, `RETRYABILITY`, `INSTALL_CHAIN_GATES`, `COMPATIBILITY_KINDS`)

The only new file is the worker-isolated document at `worker-wb/p4.7/retention-decision.md`, which is explicitly allowed by WB P4.6 §5 as the P4.7 deliverable.

---

## 5. Confirmation: blocked scope unchanged

Every blocked item from prior WB P4.x stages remains blocked, and no item was promoted by this decision:

| Item | Status |
|---|---|
| test-entry | blocked — not touched |
| `isTransportReady` attachment | blocked — only comment-only exclusion note |
| `isSessionLinkAvailable` attachment | blocked — same |
| Mobile profile (`MOBILE_OPTIMIZED_PROFILE`) | blocked — not referenced |
| PC profile (`PC_OPTIMIZED_PROFILE`) | blocked — not referenced |
| `unresolved_domain` path for manifest `declaration_*` | blocked — comment-only note |
| aggregation model changes | blocked — `AggregateProofResult` shape untouched |
| proof-path redesign | blocked — no new adapter, gate name, proof kind, failure code, retryability, or consumption point |
| closed-set expansion | blocked — all 6 closed sets unchanged |
| runtime auto-execution | blocked — no top-level invocation |
| logging fan-out | blocked — zero `console.*` etc. across the 9 files |
| telemetry path | blocked |
| shell/layout behavior edits | blocked — existing `shell.layout.ts` files untouched |
| UI exposure | blocked |

---

## 6. Retention note

**None required.** Decision is `accept_for_retention`. No gap recorded.

---

## 7. Discipline checks against WB P4.7 instructions

- [x] §1 — zero-edit review only; no source edits, no new source files, no barrel edits, no runtime hookup, no test-entry promotion
- [x] §2 — C1–C5 reviewed against the manual verification outcome from P4.6
- [x] §3 — exactly one decision produced: `accept_for_retention`
- [x] §4 — acceptance rule honored (C1–C5 all pass for both wrappers)
- [x] §5 — no gap to record; `retain_with_note` not used
- [x] §6 — no rejection criteria met
- [x] §7 — blocked scope unchanged
- [x] next stage named: `FullBody | FM | V2.proof-retention`

---

## 8. Tag packet

```yaml
expected_tag: "FullBody | WB | P4.7"
actual_tag:   "FullBody | WB | P4.7"
result:       pass
failure_code: null
retryable:    false
next_stage:   "FullBody | FM | V2.proof-retention"
```
