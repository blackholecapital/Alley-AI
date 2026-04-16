# FullBody | WB | P2.1 — Validation Hardening, Implementation Pass 1

**Stage:** `FullBody | WB | P2.1`
**Branch:** `claude/prep-validation-hardening-5f7Nb`
**Predecessor:** `FullBody | WB | P2.prep` (worker-wb/p2-prep/validation-prep.md)
**WA dependency:** consumes the typed-domain layer landed in
`packages/contracts-core/src/chassis/domain.ts` from
`FullBody | WA | P1` and `FullBody | WA | P1.1` (merged via origin/main).

---

## 1. Files changed

### New package — `packages/validation-chassis/`

| File | Purpose |
|---|---|
| `DERIVED_FROM.md` | Authority + dependency declaration |
| `src/result.ts` | `ValidationResult` shape + `pass`/`fail`/`skipped`/`isPass`/`firstFailure`/`allPass` helpers |
| `src/failure-codes.ts` | `FAILURE_CODES` vocabulary (28 codes) + `FailureCode` type |
| `src/id-domain.validator.ts` | `validateIdDomain(kind, id)` + 7 typed `isKnown*Id` predicates binding `ROUTE_IDS`, `SURFACE_IDS`, `TOUCHPOINT_IDS`, `TRIGGER_IDS`, `EVENT_IDS`, `MODULE_IDS`, `SHELL_OWNER_IDS` |
| `src/route-surface.validator.ts` | `validateRouteSurface(route)` cross-check (id domain + surface registry lookup) |
| `src/touchpoint-surface.validator.ts` | `validateTouchpointSurface(touchpoint)` cross-check |
| `src/touchpoint-event.validator.ts` | `validateTouchpointEvents(touchpoint, refs)` cross-check across all 3 event legs (request/completion/failure) |
| `src/trigger-event.validator.ts` | `validateTriggerEvent(trigger)` cross-check via `TRIGGER_TO_REQUEST_EVENT` map (suffix-naming convention; flagged for foreman) |
| `src/lifecycle-transition.validator.ts` | `validateLifecycleTransition({action, module_id, current_lifecycle_state})` over the *currently landed* `LIFECYCLE_STATES` set only |
| `src/install-chain.validator.ts` | `validateBridgeActivatable`, `validateLocalBridgeReady`, `validateActivationEligible`, `validateTransportReady`, `validateSessionLinkAvailable` — structured equivalents of the existing boolean gates, returning the FIRST missing prior artifact rather than collapsing into a single bool |
| `src/mount.validator.ts` | `validateMountAuthorization({mount, expected_surface_id})` |
| `src/schema.validator.ts` | `validateRoute`, `validateSurface`, `validateTouchpoint`, `validateEvent`, `validateTrigger`, `validateModule`, `validateInstallStamp`, `validateResolverOutput`, `validateDeclarationEnvelope`, `validateDeclaration`, `validateManifest` — composes shape predicate + enum-set membership + id-domain check |
| `src/index.ts` | Barrel — exports the full public surface |

### Edited in place — `packages/schema-chassis/src/`

Each shape predicate was upgraded to bind landed enum domains:

| File | Upgrade |
|---|---|
| `route.schema.ts` | now requires `registry_state === REGISTRY_STATES.REGISTERED` |
| `surface.schema.ts` | now requires `registry_state === REGISTRY_STATES.REGISTERED` AND `shell_owner_id === SHELL_OWNER_IDS.FACTORY` |
| `event.schema.ts` | now requires `registry_state === REGISTRY_STATES.REGISTERED` |
| `trigger.schema.ts` | now requires `registry_state === REGISTRY_STATES.REGISTERED` |
| `touchpoint.schema.ts` | shape-only (id-domain check is delegated to validation-chassis to surface a structured `id_domain_violation`); comment added explaining the split |
| `module.schema.ts` | now requires `registry_state === REGISTRY_STATES.REGISTERED` AND `lifecycle_state ∈ LIFECYCLE_STATES` (via `isLifecycleStateValue` helper) |
| `install-stamp.schema.ts` | `isValidInstallStamp` now requires `stamp_state === STAMP_STATES.ISSUED`; `isValidResolverOutput` now requires `resolver_state === RESOLVER_STATES.RESOLVED` AND `consistency_result === CONSISTENCY_RESULTS.PASS`; also tightened `resolved_registry_artifact_ids` array element typing |
| `manifest.schema.ts` | **UNCHANGED.** `declaration_kind`, `declaration_state`, `declaration_scope` are held at string-only per WB P2.1 instruction #5 — placeholder enum sets are empty in WA P1.1 |

### Untouched (intentional — minimum merge surface)

- `packages/contracts-core/**` — WA-owned, no edits
- `packages/lifecycle-chassis/**` — already enum-bound after WA P1.1; left as-is
- `packages/registry-chassis/**` — already enum-bound; left as-is
- `packages/runtime-bridge/**` — left as-is
- `apps/core-runtime/src/session/activation-gate.ts` — left as-is
- `apps/local-host/src/bridge/runtime-bridge.ts` — left as-is
- `packages/session-transport/**` — left as-is
- `apps/local-host/src/transport/**` — left as-is
- `apps/operator-shell/src/mounts/**`, `apps/web-public/src/mounts/**` — left as-is
- `apps/core-runtime/src/touchpoints/**`, `apps/core-runtime/src/routes/**` — left as-is

The validation-chassis structured validators **wrap** these existing helpers without modifying them. This is the intentional isolation strategy: every existing boolean gate remains callable; the structured-result path is a parallel API surface.

---

## 2. Validation rules added

### Shape rules (packages/schema-chassis upgrades)
- `route.registry_state ∈ REGISTRY_STATES`
- `surface.registry_state ∈ REGISTRY_STATES`, `surface.shell_owner_id ∈ SHELL_OWNER_IDS`
- `event.registry_state ∈ REGISTRY_STATES`
- `trigger.registry_state ∈ REGISTRY_STATES`
- `module.registry_state ∈ REGISTRY_STATES`, `module.lifecycle_state ∈ LIFECYCLE_STATES`
- `install_stamp.stamp_state ∈ STAMP_STATES`
- `resolver_output.resolver_state ∈ RESOLVER_STATES`, `resolver_output.consistency_result ∈ CONSISTENCY_RESULTS`
- `resolver_output.resolved_registry_artifact_ids[]` element type `string`

### Id-domain rules (validation-chassis)
- `route_id ∈ ROUTE_IDS`
- `surface_id ∈ SURFACE_IDS`
- `touchpoint_id ∈ TOUCHPOINT_IDS`
- `trigger_id ∈ TRIGGER_IDS`
- `event_id ∈ EVENT_IDS`
- `module_id ∈ MODULE_IDS`
- `shell_owner_id ∈ SHELL_OWNER_IDS`

### Lifecycle transition rules (validation-chassis)
| action | allowed sources |
|---|---|
| install | only `null` (pre-install state not in landed `LIFECYCLE_STATES`) |
| update | `LIFECYCLE_STATES.INSTALLED` |
| disable | `LIFECYCLE_STATES.INSTALLED` |
| remove | `LIFECYCLE_STATES.INSTALLED`, `LIFECYCLE_STATES.DISABLED` |

### Install-chain ordering rules (validation-chassis)
- Bridge activatable: stamp issued → stamped output → stamped install intake → applied install record (each reported with its own failure code)
- Local-host bridge ready: stamp issued → production install verified
- Activation eligible: 3 artifact-presence flags → resolver state resolved → consistency pass → stamp issued → resolver_run_id matches stamp
- Transport ready: bridge_activatable → activation_eligible → touchpoint_enabled
- Session link available: bridge_ready → activation_eligible

---

## 3. Cross-checks implemented

| Cross-check | Implementation | Failure code |
|---|---|---|
| route → surface | `validateRouteSurface` (id-domain + `lookupSurface`) | `route_surface_unregistered` |
| touchpoint → surface | `validateTouchpointSurface` | `touchpoint_surface_unregistered` |
| touchpoint → event | `validateTouchpointEvents` (3 legs) | `touchpoint_event_unregistered` |
| trigger → event | `validateTriggerEvent` (suffix-convention map) | `trigger_event_unregistered` |
| registry entry → canonical id domain | `validateIdDomain(kind, id)` | `id_domain_violation` |
| lifecycle action → allowed transition | `validateLifecycleTransition` | `lifecycle_transition_illegal` |
| install step → prior artifact present | 5 install-chain validators in `install-chain.validator.ts` | per-step (8 distinct codes) |

---

## 4. Boolean gates replaced

The original boolean predicates listed in `worker-wb/p2-prep/validation-prep.md` §3
remain in place (not removed) so existing call sites and barrel exports stay
intact. **For each boolean gate, a structured `validate*` sibling now exists
in `packages/validation-chassis/`.** Mapping:

| Boolean gate (kept) | Structured replacement (new) |
|---|---|
| `isValidRoute` | `validateRoute` |
| `isValidSurface` | `validateSurface` |
| `isValidTouchpoint` | `validateTouchpoint` |
| `isValidEvent` | `validateEvent` |
| `isValidTrigger` | `validateTrigger` |
| `isValidModule` | `validateModule` |
| `isValidInstallStamp` | `validateInstallStamp` |
| `isValidResolverOutput` | `validateResolverOutput` |
| `isValidDeclarationEnvelope` | `validateDeclarationEnvelope` (string-held) |
| `isValidDeclaration` | `validateDeclaration` (string-held) |
| `isValidManifest` | `validateManifest` |
| `isBridgeActivatable` | `validateBridgeActivatable` |
| `isBridgeReady` | `validateLocalBridgeReady` |
| `isActivationEligible` | `validateActivationEligible` |
| `isTransportReady` | `validateTransportReady` |
| `isSessionLinkAvailable` | `validateSessionLinkAvailable` |
| `isMountAuthorized` (×4) | `validateMountAuthorization` |
| `hasStampCoverage` / `is{Disable,Remove,Update}Eligible` | `validateLifecycleTransition` |
| `lookupRoute`/`lookupSurface`/etc. (`T \| undefined`) | composed inside cross-check validators (`route_surface_unregistered`, etc.) |

The structured siblings are the V2 path. Boolean gates are kept as a parallel
API for hypothetical existing callers. Subsequent stages may delegate the
boolean gates to the structured validators (single-line `return validate*().result === "pass"`)
once the foreman gate confirms no other branch depends on the current bool
shape — that swap is deferred to keep this pass safe.

---

## 5. Items still blocked (waiting on canonical authority)

| Item | Status | Blocker |
|---|---|---|
| Manifest fields `declaration_kind`, `declaration_state`, `declaration_scope` | string-only (intentional) | `DECLARATION_KINDS`, `DECLARATION_STATES`, `DECLARATION_SCOPES` are empty in WA P1.1 |
| Lifecycle states beyond `INSTALLED` / `DISABLED` | not encoded | `LIFECYCLE_STATES` does not yet publish `removed`, `absent`, etc. — `validateLifecycleTransition` carries an explicit `null` source for the install case |
| Trigger ↔ event canonical pairing | suffix-naming heuristic (`trg.X` ↔ `evt.X.requested`) | no canonical pairing map published; flagged in `trigger-event.validator.ts` header |
| Final `failure_code` namespace | local placeholder vocabulary in `failure-codes.ts` | canonical failure-code domain not published |
| Final `validator_id` namespace | local string convention `validation-chassis.<area>.<kind>` | canonical validator-id namespace not published |
| Module-id domain beyond `mod.chassis.core` | only one module id known | `MODULE_IDS` carries only one entry today |

None of these blocked items are guessed-bound in this pass. They are fenced behind comments and (in the lifecycle case) behind explicit null handling.

---

## 6. Merge-risk list — files likely to conflict at FM | V1.1

Sorted by risk. The new package is *not* a merge risk because it adds files only.

| Risk | File | Why |
|---|---|---|
| **medium** | `packages/schema-chassis/src/route.schema.ts` | edited in place |
| **medium** | `packages/schema-chassis/src/surface.schema.ts` | edited in place |
| **medium** | `packages/schema-chassis/src/event.schema.ts` | edited in place |
| **medium** | `packages/schema-chassis/src/trigger.schema.ts` | edited in place |
| **medium** | `packages/schema-chassis/src/touchpoint.schema.ts` | edited in place (comment-only logical change but content edited) |
| **medium** | `packages/schema-chassis/src/module.schema.ts` | edited in place; introduces local `isLifecycleStateValue` helper |
| **medium** | `packages/schema-chassis/src/install-stamp.schema.ts` | edited in place; both predicates upgraded |
| **low** | `packages/schema-chassis/src/manifest.schema.ts` | NOT edited but flagged because any other branch upgrading manifest may collide |
| **low** | `packages/schema-chassis/src/index.ts` | NOT edited |
| **none** | `packages/validation-chassis/**` | new package, additive only |
| **none** | `worker-wb/**` | worker-isolated docs only |

Conflict mitigation: every schema-chassis edit consists of (a) one new import line and (b) replacing the predicate body with a sequence of explicit `if` statements that preserve the original semantics. Three-way merges should resolve cleanly because the transformation is mechanical and the imports are added (not modified).

The new validation-chassis package depends on:
- `packages/contracts-core` (read-only)
- `packages/schema-chassis` (read-only)
- `packages/registry-chassis` (read-only)

It does not depend on, import from, or modify any `apps/*` source. No backward (package → app) edges introduced.

---

## 7. Discipline checks

- [x] Shared typed domains actually used (`REGISTRY_STATES`, `LIFECYCLE_STATES`, `STAMP_STATES`, `RESOLVER_STATES`, `CONSISTENCY_RESULTS`, `SHELL_OWNER_IDS`, `ROUTE_IDS`, `SURFACE_IDS`, `TOUCHPOINT_IDS`, `TRIGGER_IDS`, `EVENT_IDS`, `MODULE_IDS` — every one is imported by at least one validator)
- [x] Cross-checks implemented in code (7 cross-check categories landed)
- [x] Structured validation results introduced where changed (`ValidationResult` flowing through 11 schema validators, 4 cross-check validators, 5 install-chain validators, 1 lifecycle-transition validator, 1 mount validator, 1 id-domain validator)
- [x] Unresolved manifest fields remain unresolved (manifest.schema.ts unchanged; schema.validator.ts emits explicit string-held notes)
- [x] No authority drift (no contracts-core edits, no lifecycle/install rewrites, no registry entries added or removed)
- [x] No imports from `DECLARATION_KINDS` / `DECLARATION_STATES` / `DECLARATION_SCOPES` placeholder sets
- [x] No package → app dependency edges
- [x] WA-owned domain layer is consumed read-only

---

## 8. Tag packet

```yaml
expected_tag: "FullBody | WB | P2.1"
actual_tag:   "FullBody | WB | P2.1"
result:       pass
failure_code: null
retryable:    false
next_stage:   "FullBody | FM | V1.1 merge gate"
```
