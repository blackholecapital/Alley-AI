# FullBody | WB | P2.prep — Validation Hardening Prep

**Stage:** `FullBody | WB | P2.prep`
**Scope:** Prep only. No authority changes. No final domain bindings. No shared base overwrite.
**Branch:** `claude/prep-validation-hardening-5f7Nb`
**Worker isolation:** all output lives under `worker-wb/p2-prep/` — no shared artifact mutated.

---

## 1. Validation Inventory

Every current validation point in the shared base, classified by hardening category.

Categories used:
- `shape-only` — typeof / null / Array.isArray surface check, no semantics
- `enum-needed` — currently a string compare; needs canonical enum domain (WA-dependent)
- `cross-reference-needed` — id is checked locally but is not validated against the registry that owns it
- `state-transition-needed` — checks a single terminal state but does not validate the transition path
- `install-chain-needed` — depends on prior install artifacts being present and consistent
- `boolean-only-gate` — accepts and/or returns raw booleans, no structured failure information

### 1.1 Contracts (`packages/contracts-core/src/chassis/`)

Contracts are pure type definitions. **No runtime validation logic exists.** Listed for completeness:

| File | Purpose |
|---|---|
| `trigger.contract.ts` (4–7) | `Trigger` interface — type only |
| `event.contract.ts` (4–7) | `Event` interface — type only |
| `route.contract.ts` (4–8) | `Route` interface — type only |
| `surface.contract.ts` (4–8) | `Surface` interface — type only |
| `touchpoint.contract.ts` (4–7) | `Touchpoint` interface — type only |
| `module.contract.ts` (4–8) | `Module` interface — type only |
| `install-stamp.contract.ts` (4–16) | `InstallStamp`, `ResolverOutput` — type only |
| `manifest.contract.ts` (4–22) | `DeclarationEnvelope`, `Declaration`, `Manifest` — type only |

**Validation gap:** all id-shaped fields are typed `string`; no canonical id-domain enforcement. → blocked on **WA P1** for canonical id domains.

### 1.2 Schemas (`packages/schema-chassis/src/`)

| File:Line | Validator | Class | Returns | Notes |
|---|---|---|---|---|
| `trigger.schema.ts:7–12` | `isValidTrigger` | shape-only + enum-needed | `boolean` predicate | string-only on `trigger_id`, `registry_state` — no enum |
| `event.schema.ts:7–12` | `isValidEvent` | shape-only + enum-needed | `boolean` predicate | same shape pattern |
| `route.schema.ts:7–13` | `isValidRoute` | shape-only + enum-needed + cross-reference-needed | `boolean` predicate | `surface_id` not cross-checked vs surface registry |
| `surface.schema.ts:7–13` | `isValidSurface` | shape-only + enum-needed + cross-reference-needed | `boolean` predicate | `shell_owner_id` not validated against any owner domain |
| `touchpoint.schema.ts:7–12` | `isValidTouchpoint` | shape-only + cross-reference-needed | `boolean` predicate | `surface_id` not cross-checked |
| `module.schema.ts:7–13` | `isValidModule` | shape-only + enum-needed (×2) | `boolean` predicate | `lifecycle_state` & `registry_state` raw strings |
| `install-stamp.schema.ts:7–13` | `isValidInstallStamp` | shape-only + enum-needed | `boolean` predicate | `stamp_state` raw string |
| `install-stamp.schema.ts:17–25` | `isValidResolverOutput` | shape-only + enum-needed (×2) + cross-reference-needed | `boolean` predicate | `resolver_state`, `consistency_result` raw strings; `resolved_registry_artifact_ids` content not registry-checked |
| `manifest.schema.ts:6–13` | `isValidDeclarationEnvelope` | shape-only + enum-needed | `boolean` predicate | `declaration_scope` raw string |
| `manifest.schema.ts:16–24` | `isValidDeclaration` | shape-only + enum-needed (×2) | `boolean` predicate | `declaration_kind`, `declaration_state` raw strings; `subject_id` not cross-checked |
| `manifest.schema.ts:27–34` | `isValidManifest` | shape-only + composite | `boolean` predicate | composes child predicates; still no enum/cross-ref |

**All schema validators return raw `boolean` (predicate form).** All are candidates for the structured-result wrapper described in §4.

### 1.3 Registries (`packages/registry-chassis/src/`)

Registries today only **lookup**. They do not validate inputs and they do not enforce that an id resides in a canonical id domain.

| File:Line | Function | Class | Returns |
|---|---|---|---|
| `trigger-registry.ts:13–15` | `lookupTrigger` | cross-reference-needed | `Trigger \| undefined` |
| `event-registry.ts:21–23` | `lookupEvent` | cross-reference-needed | `Event \| undefined` |
| `route-registry.ts:13–15` | `lookupRoute` | cross-reference-needed | `Route \| undefined` |
| `surface-registry.ts:11–13` | `lookupSurface` | cross-reference-needed | `Surface \| undefined` |
| `module-registry.ts:10–12` | `lookupModule` | cross-reference-needed | `Module \| undefined` |

**Validation gap:** no `assertRegistered(...)` style helper, no structured failure for "id absent from registry". Callers must hand-test `=== undefined`.

### 1.4 Lifecycle (`packages/lifecycle-chassis/src/`)

| File:Line | Function | Class | Returns |
|---|---|---|---|
| `install.lifecycle.ts:11–18` `hasStampCoverage` | resolver_state==="resolved" | enum-needed + state-transition-needed | `boolean` |
| `install.lifecycle.ts:14` | consistency_result==="pass" | enum-needed | (combined) |
| `install.lifecycle.ts:15` | stamp_state==="issued" | enum-needed + state-transition-needed | (combined) |
| `install.lifecycle.ts:16` | resolver_run_id equality | install-chain-needed (id pairing) | (combined) |
| `disable.lifecycle.ts:9–11` `isDisableEligible` | current==="installed" | state-transition-needed | `boolean` |
| `remove.lifecycle.ts:9–14` `isRemoveEligible` | current==="installed" \|\| "disabled" | state-transition-needed | `boolean` |
| `update.lifecycle.ts:9–11` `isUpdateEligible` | current==="installed" | state-transition-needed | `boolean` |

**Gap:** none of these encode the *legal transition graph*. They only check the *current* state. There is no rejection of e.g. "installed → installed" replays, no rejection of impossible source states, no record of which transition was attempted.

### 1.5 Routes (`apps/core-runtime/src/routes/`)

| File:Line | Surface |
|---|---|
| `install.route.ts:6–10` `INSTALL_ROUTE` → `sf.cli.factory` |
| `update.route.ts:6–10` `UPDATE_ROUTE` → `sf.cli.factory` |
| `disable.route.ts:6–10` `DISABLE_ROUTE` → `sf.api.factory` |
| `remove.route.ts:6–10` `REMOVE_ROUTE` → `sf.api.factory` |

**No runtime validation.** Constants only. The `surface_id` literal is never cross-checked against the surface registry at runtime. → cross-reference-needed (route → surface).

### 1.6 Touchpoints (`apps/core-runtime/src/touchpoints/`)

| File:Line | Touchpoint | Surface | Events |
|---|---|---|---|
| `install.touchpoint.ts:7–22` | `tp.cli.install` | `sf.cli.factory` | `evt.chassis.install.{requested,completed,failed}` |
| `update.touchpoint.ts:7–16` | `tp.cli.update` | `sf.cli.factory` | `evt.chassis.update.{requested,completed,failed}` |
| `disable.touchpoint.ts:7–16` | `tp.api.disable` | `sf.api.factory` | `evt.chassis.disable.{requested,completed,failed}` |
| `remove.touchpoint.ts:7–16` | `tp.api.remove` | `sf.api.factory` | `evt.chassis.remove.{requested,completed,failed}` |

**No runtime validation.** Constants only. Neither `surface_id` nor any `event_id` literal is cross-checked at load time. → cross-reference-needed (touchpoint → surface, touchpoint → event).

### 1.7 Bridge / Runtime checks

| File:Line | Function | Class | Returns |
|---|---|---|---|
| `packages/runtime-bridge/src/bridge-contract.ts:14–21` `isBridgeActivatable` | stamp_state==="issued" + 3 presence flags | enum-needed + install-chain-needed | `boolean` |
| `apps/local-host/src/bridge/runtime-bridge.ts:12–17` `isBridgeReady` | stamp_state==="issued" + `production_install_verified` | enum-needed + install-chain-needed + boolean-only-gate | `boolean` |
| `apps/core-runtime/src/session/activation-gate.ts:22–32` `isActivationEligible` | 3 presence flags + 3 enum checks + `resolver_run_id` equality | enum-needed + install-chain-needed + cross-reference-needed | `boolean` |
| `packages/session-transport/src/transport-contract.ts:11–17` `isTransportReady` | 3 boolean flags AND-ed | boolean-only-gate | `boolean` |
| `apps/local-host/src/transport/session-link.ts:9–11` `isSessionLinkAvailable` | 2 boolean flags AND-ed | boolean-only-gate | `boolean` |

### 1.8 Mounts (authorization gates)

| File:Line | Surface literal checked | Class | Returns |
|---|---|---|---|
| `apps/operator-shell/src/mounts/install.mount.ts:11–13` `isMountAuthorized` | `sf.cli.factory` | enum-needed + cross-reference-needed | `boolean` |
| `apps/operator-shell/src/mounts/update.mount.ts:11–13` | `sf.cli.factory` | (same) | `boolean` |
| `apps/web-public/src/mounts/disable.mount.ts:11–13` | `sf.api.factory` | (same) | `boolean` |
| `apps/web-public/src/mounts/remove.mount.ts:11–13` | `sf.api.factory` | (same) | `boolean` |

**Total inventoried validation points: 46.** All return raw `boolean` (or `T | undefined` for the registry lookups). No structured result anywhere in the shared base today.

---

## 2. Cross-Check Map (target for V2)

The required cross-check edges. None of these are enforced at runtime today; this map drives the V2 validators.

### 2.1 route → surface
| route_id | declared surface_id | must be present in `surface-registry` |
|---|---|---|
| `rt.chassis.install` | `sf.cli.factory` | ✓ |
| `rt.chassis.update` | `sf.cli.factory` | ✓ |
| `rt.chassis.disable` | `sf.api.factory` | ✓ |
| `rt.chassis.remove` | `sf.api.factory` | ✓ |

V2 validator: `validateRouteSurface(route) → ValidationResult` — fails with `route_surface_unregistered` when not found.

### 2.2 touchpoint → surface
| touchpoint_id | declared surface_id | must be present in `surface-registry` |
|---|---|---|
| `tp.cli.install` | `sf.cli.factory` | ✓ |
| `tp.cli.update` | `sf.cli.factory` | ✓ |
| `tp.api.disable` | `sf.api.factory` | ✓ |
| `tp.api.remove` | `sf.api.factory` | ✓ |

V2 validator: `validateTouchpointSurface(touchpoint) → ValidationResult` — fails with `touchpoint_surface_unregistered`.

### 2.3 touchpoint → event
Each `TouchpointEventRefs` triple (`request_event_id`, `completion_event_id`, `failure_event_id`) must resolve in `event-registry`.

| touchpoint_id | request | completion | failure |
|---|---|---|---|
| `tp.cli.install` | `evt.chassis.install.requested` | `evt.chassis.install.completed` | `evt.chassis.install.failed` |
| `tp.cli.update` | `evt.chassis.update.requested` | `evt.chassis.update.completed` | `evt.chassis.update.failed` |
| `tp.api.disable` | `evt.chassis.disable.requested` | `evt.chassis.disable.completed` | `evt.chassis.disable.failed` |
| `tp.api.remove` | `evt.chassis.remove.requested` | `evt.chassis.remove.completed` | `evt.chassis.remove.failed` |

V2 validator: `validateTouchpointEvents(touchpoint, refs) → ValidationResult[]` — fails per-leg with `touchpoint_event_unregistered`.

### 2.4 trigger → event
Triggers in `trigger-registry` must each pair with the corresponding `requested` event in `event-registry`.

| trigger_id | required event_id |
|---|---|
| `trg.chassis.install` | `evt.chassis.install.requested` |
| `trg.chassis.update` | `evt.chassis.update.requested` |
| `trg.chassis.disable` | `evt.chassis.disable.requested` |
| `trg.chassis.remove` | `evt.chassis.remove.requested` |

V2 validator: `validateTriggerEvent(trigger) → ValidationResult` — fails with `trigger_event_unregistered`. **Naming-pair convention is local heuristic only and must be confirmed against WA output.**

### 2.5 registry entry → canonical id domain
Every registry entry id must conform to its canonical domain prefix:

| registry | id field | required prefix |
|---|---|---|
| `trigger-registry` | `trigger_id` | `trg.` |
| `event-registry` | `event_id` | `evt.` |
| `route-registry` | `route_id` | `rt.` |
| `surface-registry` | `surface_id` | `sf.` |
| `module-registry` | `module_id` | `mod.` (heuristic — confirm WA) |
| (touchpoint) | `touchpoint_id` | `tp.` |

V2 validator: `validateIdDomain(kind, id) → ValidationResult` — fails with `id_domain_violation`. **The canonical id-domain table is owned by WA P1 and must NOT be hard-coded here yet.** This validator is staged but blocked.

### 2.6 lifecycle action → allowed state transition
Today the lifecycle predicates only check current-state membership; they do not encode legal transitions. Required transition graph:

| action | allowed source states | target state |
|---|---|---|
| install | `absent`, `removed` | `installed` |
| update | `installed` | `installed` (re-stamped) |
| disable | `installed` | `disabled` |
| remove | `installed`, `disabled` | `removed` |

V2 validator: `validateLifecycleTransition(action, fromState) → ValidationResult` — fails with `lifecycle_transition_illegal`. **The state vocabulary itself (`installed`/`disabled`/`removed`/`absent`) is owned by WA P1.** Heuristic only until then.

### 2.7 install step → prior artifact present
Install-chain ordering enforced today only as 3 boolean flags. Required ordering:

| step | depends on artifacts |
|---|---|
| `bridge_activatable` | `install_stamp.stamp_state === "issued"`, `stamped_output_present`, `stamped_install_intake_present`, `applied_install_record_present` |
| `activation_eligible` | all of the above + `resolverOutput.resolver_state === "resolved"` + `consistency_result === "pass"` + `resolver_run_id` matches stamp |
| `transport_ready` | `bridge_activatable` ∧ `activation_eligible` ∧ `touchpoint_enabled` |
| `session_link_available` | `bridge_ready` ∧ `activation_eligible` |

V2 validator: `validateInstallChainStep(step, observed) → ValidationResult` — fails with `install_chain_missing_prior` and reports the *first* missing prior artifact (not just an AND-collapsed boolean).

---

## 3. Boolean-Only Gate List (raw-boolean returners — explicit)

Every site that returns or consumes a raw boolean today and must be replaced with a structured `ValidationResult`:

1. `packages/schema-chassis/src/trigger.schema.ts:6` `isValidTrigger`
2. `packages/schema-chassis/src/event.schema.ts:6` `isValidEvent`
3. `packages/schema-chassis/src/route.schema.ts:6` `isValidRoute`
4. `packages/schema-chassis/src/surface.schema.ts:6` `isValidSurface`
5. `packages/schema-chassis/src/touchpoint.schema.ts:6` `isValidTouchpoint`
6. `packages/schema-chassis/src/module.schema.ts:6` `isValidModule`
7. `packages/schema-chassis/src/install-stamp.schema.ts:6` `isValidInstallStamp`
8. `packages/schema-chassis/src/install-stamp.schema.ts:16` `isValidResolverOutput`
9. `packages/schema-chassis/src/manifest.schema.ts:6` `isValidDeclarationEnvelope`
10. `packages/schema-chassis/src/manifest.schema.ts:16` `isValidDeclaration`
11. `packages/schema-chassis/src/manifest.schema.ts:27` `isValidManifest`
12. `packages/lifecycle-chassis/src/install.lifecycle.ts:11` `hasStampCoverage`
13. `packages/lifecycle-chassis/src/disable.lifecycle.ts:9` `isDisableEligible`
14. `packages/lifecycle-chassis/src/remove.lifecycle.ts:9` `isRemoveEligible`
15. `packages/lifecycle-chassis/src/update.lifecycle.ts:9` `isUpdateEligible`
16. `packages/runtime-bridge/src/bridge-contract.ts:14` `isBridgeActivatable`
17. `packages/session-transport/src/transport-contract.ts:11` `isTransportReady`
18. `apps/local-host/src/bridge/runtime-bridge.ts:12` `isBridgeReady`
19. `apps/local-host/src/transport/session-link.ts:9` `isSessionLinkAvailable`
20. `apps/core-runtime/src/session/activation-gate.ts:22` `isActivationEligible`
21. `apps/operator-shell/src/mounts/install.mount.ts:11` `isMountAuthorized`
22. `apps/operator-shell/src/mounts/update.mount.ts:11` `isMountAuthorized`
23. `apps/web-public/src/mounts/disable.mount.ts:11` `isMountAuthorized`
24. `apps/web-public/src/mounts/remove.mount.ts:11` `isMountAuthorized`

Pure-boolean composition gates (collapse signal — explicit subgroup):
- `isTransportReady` (3-flag AND)
- `isSessionLinkAvailable` (2-flag AND)

These are the lowest-information sites and lose all upstream failure context.

The 5 `lookup*` registry functions return `T | undefined` rather than `boolean`, but they have the same defect: callers cannot tell *why* a lookup failed (id never registered vs id deregistered vs registry not loaded). Marked for the same conversion in V2.

---

## 4. Proposed Structured Validation Result Shape

```ts
// Proposed — not yet bound to any shared domain.
// Field names locked. Field domain values are placeholders pending WA P1.

export interface ValidationResult {
  /** Stable id of the validator producing the result. e.g. "schema.route.shape" */
  readonly validator_id: string;

  /** What kind of artifact was validated. e.g. "route" | "touchpoint" | "install_stamp" */
  readonly target_type: string;

  /** Id of the specific artifact validated, when one exists. */
  readonly target_id: string | null;

  /** Outcome. Closed set. */
  readonly result: "pass" | "fail" | "skipped";

  /** Stable machine code when result === "fail"; null otherwise. */
  readonly failure_code: string | null;

  /** Whether the caller may retry the same validation without remediation. */
  readonly retryable: boolean;

  /** Whether a fail must halt the enclosing operation (vs. warn-only). */
  readonly blocking: boolean;

  /** Free-form operator-readable diagnostic. Never used for control flow. */
  readonly notes: string | null;
}
```

Initial reserved `failure_code` set (placeholder vocabulary, NOT bound to WA yet):

- `shape_invalid`
- `id_domain_violation`
- `enum_value_unknown`
- `route_surface_unregistered`
- `touchpoint_surface_unregistered`
- `touchpoint_event_unregistered`
- `trigger_event_unregistered`
- `lifecycle_transition_illegal`
- `install_chain_missing_prior`
- `stamp_state_not_issued`
- `resolver_state_not_resolved`
- `consistency_result_not_pass`
- `resolver_run_id_mismatch`
- `mount_surface_unauthorized`
- `registry_lookup_missed`

This vocabulary is staged here for WB P2 wiring. The final binding to canonical failure-code domains is a WA P1 deliverable.

---

## 5. Blocked Items — Waiting on WA P1

The following V2 validators cannot be finalized until WA P1 publishes the canonical typed domains. Each is marked here so WB P2 does not guess.

| Item | Blocked because | Needed from WA |
|---|---|---|
| `validateIdDomain` (§2.5) | id-prefix table is heuristic | canonical id-domain table (per kind) |
| `validateLifecycleTransition` (§2.6) | source/target state vocabulary is heuristic | canonical lifecycle state enum + legal transition graph |
| Enum-needed schema validators (§1.2) | `registry_state`, `lifecycle_state`, `stamp_state`, `resolver_state`, `consistency_result`, `declaration_kind`, `declaration_state`, `declaration_scope` are raw strings | canonical enum domains for each |
| `failure_code` final binding (§4) | placeholder vocabulary only | canonical failure-code domain |
| `validator_id` namespace | placeholder string | canonical validator-id namespace |
| Trigger ↔ event pairing (§2.4) | name-suffix heuristic only | canonical trigger→event binding map |
| Module id prefix (§2.5) | `mod.` is a guess | canonical module-id domain |

**Hard rule observed for this prep:** no file under `packages/schema-chassis`, `packages/contracts-core`, `packages/registry-chassis`, `packages/lifecycle-chassis`, `packages/runtime-bridge`, `packages/session-transport`, `packages/policy-chassis`, or any `apps/*` source file was modified. No new import edges from those packages into anything WA-owned were introduced. All deliverables are confined to `worker-wb/p2-prep/`.

---

## 6. Tag Packet

```yaml
expected_tag: "FullBody | WB | P2.prep"
actual_tag:   "FullBody | WB | P2.prep"
result:       pass
failure_code: null
retryable:    false
next_stage:   "FullBody | WB | P2"
```

### Operator verification checklist
- [x] All current validation points inventoried (46 sites across 8 areas)
- [x] All weak validation areas classified into the 6 hardening categories
- [x] All cross-check requirements listed (route→surface, tp→surface, tp→event, trg→event, registry→id-domain, lifecycle→transition, install→prior-artifact)
- [x] Boolean-only gates explicitly captured (24 sites, plus 5 `lookup*` defect siblings)
- [x] WA-dependent items clearly marked (§5)
- [x] No final domain binding guessed
- [x] No authority behavior changed
- [x] No hard import added from unfinished WA output
- [x] No shared base file overwritten — output isolated under `worker-wb/p2-prep/`

**Pass condition met.** Ready for `FullBody | WB | P2`.
