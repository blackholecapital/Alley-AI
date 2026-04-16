# FullBody | WB | P4.6 — Manual Verification Gate Decision

**Stage:** `FullBody | WB | P4.6`
**Branch:** `claude/prep-validation-hardening-5f7Nb`
**Predecessor:** WB P4.5 (commit `57e040a` — 2 proof-run callers landed)
**Merged WA dependencies:** WA P1 + P1.1, WA P3.0, WA P4.0.

**Scope (decision only — narrow):** specify the manual verification procedure for the 2 proof-run caller files landed in WB P4.5. Verification remains manual, non-default, and entirely outside the runtime/layout/boot/UI/test surfaces. No new harness, CLI, UI, logging, telemetry, proof bus, or auto-execution hook is introduced.

---

## 1. Manual caller context — what "manual verification" means in this repo

The repo today has **no test harness, no build system, no script runner, no CLI, and no UI runtime**. A manual verification therefore cannot be a committed test file, a committed runner script, or a CLI entrypoint. It must fit inside one of the following non-invasive contexts:

- **MV-A — static code review:** an operator reads the two proof-run files plus their sibling aggregator files and verifies by inspection that the type contracts hold, the imports resolve, and the wrapper body is a single `return` statement.
- **MV-B — out-of-repo scratch invocation:** an operator constructs a minimum valid input object in a scratch file or REPL that is **not committed** to this repo (e.g., in a temporary sibling directory or a local playground). They invoke the wrapper and inspect the returned `AggregateProofResult` shape against the expected success/failure criteria below.
- **MV-C — type-check-only verification via `tsc --noEmit`:** an operator runs a type checker against the 7 proof-related files (2 run callers + 2 aggregators + 1 install-chain proof + 2 mount proofs + routes/touchpoints proofs) to confirm the import graph resolves and the public function signatures match their types. **Only** if the operator has a local `tsc` installation; no `tsconfig.json` or `package.json` is committed by WB P4.6.

**None of MV-A / MV-B / MV-C requires any edit to any file committed in this repo.** Every path is rollback-neutral because there is nothing to roll back.

---

## 2. Per-caller manual verification plan

### 2.1 `apps/operator-shell/src/app/layout/shell.layout.proof-run.ts`

**Wrapper under test:** `runOperatorShellProof(inputs: OperatorShellProofInputs): AggregateProofResult`

**Approved manual caller context:** MV-A, MV-B, and MV-C are all approved. Each is a non-invasive manual path. No committed file is created by any of them.

**Exact invocation shape** (for MV-B):

```ts
// scratch context (NOT committed to this repo)
import { runOperatorShellProof } from "<local path to apps/operator-shell/src/app/layout/shell.layout.proof-run.ts>";

const inputs = /* see §2.1 — minimum valid example */;
const result = runOperatorShellProof(inputs);
```

**Minimum valid input example** (composed entirely from already-landed canonical values; uses only `FULL_BODY_PROFILE` and the canonical install-chain gates):

```ts
// Minimum valid OperatorShellProofInputs — passes every gate.
// All string literal values are members of their canonical closed
// sets (LIFECYCLE_STATES, REGISTRY_STATES, RESOLVER_STATES,
// CONSISTENCY_RESULTS, STAMP_STATES). No invented values.

const SAMPLE_RESOLVER_RUN_ID = "resolver-run.sample-0001";

const SAMPLE_RESOLVER_OUTPUT = {
  resolver_run_id: SAMPLE_RESOLVER_RUN_ID,
  resolved_declaration_envelope_id: "envelope.sample-0001",
  resolved_registry_artifact_ids: [] as const,
  resolver_state: "resolved",   // RESOLVER_STATES.RESOLVED
  consistency_result: "pass",   // CONSISTENCY_RESULTS.PASS
} as const;

const SAMPLE_INSTALL_STAMP = {
  install_stamp_law_ref: "stamp.law.sample-0001",
  resolver_run_id: SAMPLE_RESOLVER_RUN_ID,
  stamp_state: "issued",        // STAMP_STATES.ISSUED
} as const;

const inputs /*: OperatorShellProofInputs */ = {
  installChain: {
    stampCoverage: {
      resolverOutput: SAMPLE_RESOLVER_OUTPUT,
      installStamp:   SAMPLE_INSTALL_STAMP,
    },
    bridgeActivation: {
      install_stamp: SAMPLE_INSTALL_STAMP,
      stamped_output_present:         true,
      stamped_install_intake_present: true,
      applied_install_record_present: true,
    },
    bridgeReady: {
      install_stamp: SAMPLE_INSTALL_STAMP,
      production_install_verified: true,
    },
    activationEligibility: {
      resolverOutput: SAMPLE_RESOLVER_OUTPUT,
      installStamp:   SAMPLE_INSTALL_STAMP,
      stampedOutputPresent:         true,
      stampedInstallIntakePresent:  true,
      appliedInstallRecordPresent:  true,
    },
  },
};
```

**Expected SUCCESS output shape** (for the input above):

```ts
// AggregateProofResult (from packages/proof-chassis/src/result-domain.ts)
{
  proof_kind: "proof.aggregate",            // PROOF_KINDS.AGGREGATE
  consumption_point: "consume.shell_operator", // SHELL_OPERATOR_PATH
  passed: true,
  retryability: "retryable",                 // RETRYABILITY.RETRYABLE
  failure_code: "none",                      // FAILURE_CODES.NONE
  operator_summary: "operator_shell: 21/21 components passed",
  diagnostic: {
    expected_tag: "FullBody | WA | P4.0",
    actual_tag:   "FullBody | WA | P4.0",
    stage: "P4.0",
    consumption_point: "consume.shell_operator",
  },
  components: [ /* readonly ProofResult[] of length 21 */ ],
}
```

Component count breakdown (the operator must verify this by counting `result.components.length`):

| Component group | Count | Source |
|---|---|---|
| route validation + compatibility | 8 | `routeProofs()` (4 routes × 2) |
| touchpoint validation + compatibility | 8 | `touchpointProofs()` (4 touchpoints × 2) |
| operator-shell mount validation + compatibility | 4 | `operatorMountProofs()` (2 mounts × 2) |
| install-chain | 1 | `installChainProof(inputs.installChain)` |
| **total** | **21** | |

**Expected FAILURE output shape** (produced by flipping a single presence flag in the input above, e.g. `stamped_output_present: false`):

```ts
{
  proof_kind: "proof.aggregate",
  consumption_point: "consume.shell_operator",
  passed: false,
  retryability: "blocking",                 // RETRYABILITY.BLOCKING
  failure_code: "install_chain_incomplete", // FAILURE_CODES.INSTALL_CHAIN_INCOMPLETE
  operator_summary: "operator_shell: 20/21 components passed, 1 failing (first failure: install_chain_incomplete)",
  diagnostic: { /* as above */ },
  components: [ /* 21 components; the 21st (install-chain) has passed=false */ ],
}
```

The aggregate's `failure_code` is derived from the first non-`none` component failure in input order. Because the install-chain component is last in the component array and every earlier component still passes, the first non-`none` code in deterministic order is the install-chain component's `install_chain_incomplete`, which WA P4.0 forwards into the aggregate.

**Rollback-safe verification note:** MV-A, MV-B, and MV-C all produce zero committed artifacts. No scratch file, REPL transcript, or `tsc` output is committed as part of WB P4.6. There is nothing to roll back from verification itself.

### 2.2 `apps/web-public/src/app/layout/shell.layout.proof-run.ts`

**Wrapper under test:** `runWebPublicShellProof(inputs: WebPublicShellProofInputs): AggregateProofResult`

**Approved manual caller context:** same three modes (MV-A, MV-B, MV-C) as §2.1.

**Exact invocation shape** (for MV-B):

```ts
// scratch context (NOT committed to this repo)
import { runWebPublicShellProof } from "<local path to apps/web-public/src/app/layout/shell.layout.proof-run.ts>";

const inputs = /* same minimum valid example as §2.1 */;
const result = runWebPublicShellProof(inputs);
```

**Minimum valid input example:** **identical to §2.1**. `WebPublicShellProofInputs` and `OperatorShellProofInputs` are structurally equivalent (`{ installChain: InstallChainProofInputs }`); the caller label is the only thing that differs between the two aggregators.

**Expected SUCCESS output shape:**

```ts
{
  proof_kind: "proof.aggregate",
  consumption_point: "consume.shell_operator",
  passed: true,
  retryability: "retryable",
  failure_code: "none",
  operator_summary: "web_public: 21/21 components passed",  // label differs
  diagnostic: { /* as in §2.1 */ },
  components: [ /* length 21 */ ],
}
```

Component breakdown for the web-public aggregator:

| Component group | Count |
|---|---|
| route validation + compatibility | 8 |
| touchpoint validation + compatibility | 8 |
| **web-public** mount validation + compatibility | 4 (from `webPublicMountProofs()`) |
| install-chain | 1 |
| **total** | **21** |

**Expected FAILURE output shape:** symmetric to §2.1; `operator_summary` label is `web_public` and the failing component is the install-chain gate.

**Rollback-safe verification note:** same as §2.1 — zero committed artifacts.

---

## 3. Verification checks (what the operator must confirm)

Per WB P4.6 instruction §4, the verification must confirm **only** these five properties. Each row maps to a specific assertion the operator records (mentally or in a scratch note, never committed).

| # | Check | How to confirm |
|---|---|---|
| C1 | Wrapper returns an aggregate result | `typeof result === "object" && result.proof_kind === "proof.aggregate"`; object identity passes through from `aggregateOperatorSummary` |
| C2 | No side effects occur during invocation | Before invoking, confirm no `console.*`, `process.*`, `fs.*`, `fetch`, `document`, `window`, `setTimeout`, `setInterval`, module-level code, or logging exists in any of the 5 proof files + 2 aggregators + 2 proof-run callers (grep over the 9 files — already verified in WB P4.1, P4.3, P4.5; re-verify here by re-running the grep). The invocation itself produces zero stdout/stderr output and no file writes |
| C3 | Import path resolves | For MV-C: `tsc --noEmit` succeeds against the 9 proof files with their direct-path imports. For MV-A/MV-B: read through each `import` statement and confirm each resolved path points at an existing file |
| C4 | Aggregator output is structurally valid | `result` matches `AggregateProofResult` shape: `proof_kind`, `consumption_point`, `passed`, `retryability`, `failure_code`, `operator_summary`, `diagnostic`, `components` are all present; `components` is an array of the expected length (21); each component is itself a structurally valid `ProofResult`. Use the tables in §2.1 / §2.2 as the expected reference |
| C5 | Blocked items remain excluded | Re-run grep across the 9 proof-related files for: `console\|process\.\|require(\|fs\.\|fetch\|document\|window\|setTimeout\|setInterval\|isTransportReady\|isSessionLinkAvailable\|MOBILE_OPTIMIZED\|PC_OPTIMIZED\|unresolved_domain\|declaration_kind\|declaration_state\|declaration_scope\|aggregateOperatorSummary.*log\|telemetry`. Zero matches expected (except for the one comment-only mention of `isTransportReady` / `isSessionLinkAvailable` in `install-chain.proof.ts` that documents their exclusion from `INSTALL_CHAIN_GATES`) |

**Out of scope for verification (do NOT attempt to confirm in P4.6):**
- No asserting anything about Mobile / PC profile output — those buckets are empty and produce `compatibility_unresolved` for any id; that behavior is WA P3.0's responsibility, not something P4.6 verifies
- No asserting anything about manifest `declaration_*` fields — still unresolved
- No asserting transport/session-link inclusion — explicitly blocked
- No runtime performance / timing / resource measurement

---

## 4. Approved_now / manual_steps / defer_later / blocked

### 4.1 `approved_now`

| # | Item | Notes |
|---|---|---|
| AN-1 | Manual verification per §2.1 and §2.2 using any of MV-A, MV-B, MV-C | all three produce zero committed artifacts |
| AN-2 | Confirming the 5 checks C1–C5 from §3 | the operator holds the results; nothing is written back into the repo |

### 4.2 `manual_steps` (in exact order)

| Step | Actor | Action | Produces |
|---|---|---|---|
| 1 | operator | static code review of the 9 proof-related files (5 P4.1 + 2 P4.3 + 2 P4.5) for structural sanity (MV-A) | mental note |
| 2 | operator | re-run the blocked-item grep from §3 C5 across the same 9 files | grep output, not committed |
| 3 | operator | construct the minimum valid input example from §2.1 in an **uncommitted** scratch context | scratch file (not in repo) |
| 4 | operator | invoke `runOperatorShellProof(inputs)` via MV-B and inspect `result.passed`, `result.components.length === 21`, `result.operator_summary === "operator_shell: 21/21 components passed"` | in-memory result |
| 5 | operator | invoke `runWebPublicShellProof(inputs)` symmetrically and inspect the same fields with label `web_public` | in-memory result |
| 6 | operator | (optional) flip `inputs.installChain.bridgeActivation.stamped_output_present` to `false` and re-invoke both wrappers; confirm `result.passed === false`, `result.failure_code === "install_chain_incomplete"`, `result.retryability === "blocking"` | in-memory result |
| 7 | operator | (optional) run `tsc --noEmit` against the 9 files if a local type checker is available (MV-C) | type-check exit code, not committed |
| 8 | operator | confirm no scratch file was accidentally committed: `git status` on the repo must show the working tree as clean after all verification steps | clean working tree |

### 4.3 `defer_later`

| # | Item | Why deferred |
|---|---|---|
| DL4.6-1 | Committed test harness covering the two callers | test-entry still blocked (B1, no harness, no `TEST_ENTRY` consumption point) |
| DL4.6-2 | Committed CI check or CI workflow file | no CI in the repo; introducing one would be an authority expansion |
| DL4.6-3 | Committed type-check config (`tsconfig.json`) or package manifest (`package.json`) | WB P4.6 scope forbids new build/test infrastructure; if a type-check config is desired later it must be scoped as a separate stage |
| DL4.6-4 | Committed fixture file with the minimum valid input example | would create an implicit second caller and widen the attachment surface; keep fixtures out-of-repo for P4.6 |
| DL4.6-5 | Operator-shell diagnostic UI panel that shows the aggregate result | UI exposure still blocked |
| DL4.6-6 | Runtime scheduled re-run of the aggregators | runtime auto-execution still blocked |
| DL4.6-7 | Telemetry or structured-log export of the aggregate results | logging fan-out still blocked |
| DL4.6-8 | Cross-aggregator summary (e.g., "operator_shell AND web_public" meta-aggregate) | would require a new aggregation layer; model changes still blocked |

### 4.4 `blocked` — unchanged from prior passes

Every blocked item from WB P4.prep.2 through P4.5 **stays blocked**. None is pulled forward.

| Item | Status | Enforcement in P4.7 |
|---|---|---|
| test-entry | blocked | no test file, no `TEST_ENTRY` consumption point |
| `isTransportReady` attachment | blocked | not imported anywhere |
| `isSessionLinkAvailable` attachment | blocked | not imported anywhere |
| Mobile profile (`MOBILE_OPTIMIZED_PROFILE`) | blocked | not imported |
| PC profile (`PC_OPTIMIZED_PROFILE`) | blocked | not imported |
| `unresolved_domain` path for manifest `declaration_*` | blocked | not touched |
| Aggregation model changes | blocked | no edit to `AggregateProofResult` / `ProofResult` / any closed set |
| Proof-path redesign | blocked | no new adapter, gate name, proof kind, failure code, retryability, or consumption point |
| Closed-set expansion | blocked | all 6 closed sets (`PROOF_KINDS`, `CONSUMPTION_POINTS`, `FAILURE_CODES`, `RETRYABILITY`, `INSTALL_CHAIN_GATES`, `COMPATIBILITY_KINDS`) unchanged |
| Runtime auto-execution | blocked | no top-level call added |
| Logging fan-out | blocked | no logger path |
| Telemetry path | blocked | none |
| Shell/layout behavior edits | blocked | existing `shell.layout.ts` untouched |
| UI exposure | blocked | no UI code |

---

## 5. P4.7 edit requirement

**Decision: zero source edits for P4.7.**

WB P4.7 is authorized to produce **zero edits** to any source file committed in the repo. The manual verification procedure above is complete as a *documented* artifact (this file plus `worker-wb/p4.4/caller-path-decision.md` and `worker-wb/p4.2/consumption-decision.md`). Nothing needs to be wired, committed, or packaged into the repo for P4.7.

**Hard limits on P4.7:**

- **0** source files modified
- **0** new source files created
- **0** barrel edits
- **0** new files under `apps/`, `packages/`, or `xyz-factory-system/`
- **0** new test files, CLI files, harness files, or script files
- worker-isolated documentation (`worker-wb/p4.7/…`) is acceptable if P4.7 requires a new decision/report artifact; if it does not, P4.7 may be a zero-file stage

If WB P4.7's instructions conflict with any of the hard limits above, the conflict must be flagged and the operator must re-authorize before P4.7 executes.

---

## 6. Discipline checks against WB P4.6 instructions

- [x] §1 — manual verification procedure defined for both proof-run callers (§2)
- [x] §2 — verification stays manual, non-default, and does not hook into runtime, layout, boot, UI, or test-entry
- [x] §3 — per-caller entries contain approved manual caller context, exact invocation shape, minimum valid input example, expected success output shape, expected failure output shape, and a rollback-safe verification note
- [x] §4 — verification confirms only the 5 allowed properties: wrapper returns aggregate result, no side effects, import path resolves, aggregator output structurally valid, blocked items remain excluded
- [x] §5 — no new harness, CLI, UI, logging path, telemetry, proof bus, app-wide proof registry, or auto-execution hook introduced
- [x] §6 — results separated into `approved_now`, `manual_steps`, `defer_later`, and `blocked`
- [x] §7 — every blocked item preserved
- [x] P4.7 edit requirement stated exactly: **zero source edits**
- [x] no code wired in this pass; worker-isolated decision document only

---

## 7. Tag packet

```yaml
expected_tag: "FullBody | WB | P4.6"
actual_tag:   "FullBody | WB | P4.6"
result:       pass
failure_code: null
retryable:    false
next_stage:   "FullBody | WB | P4.7"
```
