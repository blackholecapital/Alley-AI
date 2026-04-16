# FullBody | WB | P3.1 — Compatibility / Composability Hardening, Pass 1

**Stage:** `FullBody | WB | P3.1`
**Branch:** `claude/prep-validation-hardening-5f7Nb`
**Predecessors on branch:** WB P2.prep, WB P2.1, WB P3.prep
**Merged WA dependencies:**
- `FullBody | WA | P1` + `WA | P1.1` (id/state domain layer)
- `FullBody | WA | P3.0` (compatibility profile layer) — merged via origin/main commit `7c8e6bf`

---

## 1. Files changed

### New files (additive — `packages/validation-chassis/src/`)

| File | Purpose |
|---|---|
| `compatibility.validator.ts` | Generic profile-membership validators: `validateProfileShell`, `validateProfileSurface`, `validateProfileRoute`, `validateProfileTouchpoint`, `validateProfileMount`; plus `classifyExposure<T>` helper and the shared `checkMembership` template |
| `shell-surface.validator.ts` | `validateShellSurface(inputs)` composes profile-shell + profile-surface, surfaces the unresolved shell-ownership-split limitation in notes |
| `shell-mount.validator.ts` | `validateShellMount(inputs)` composes profile-shell + profile-mount with the same split caveat |
| `mount-compatibility.validator.ts` | `validateMountSurfaceUnderProfile(inputs)` composes the existing `validateMountAuthorization` with profile-touchpoint and profile-surface checks |
| `profile-runtime-gate.validator.ts` | `validateBridgeActivatableUnderProfile`, `validateLocalBridgeReadyUnderProfile`, `validateActivationEligibleUnderProfile`, `validateTransportReadyUnderProfile`, `validateSessionLinkAvailableUnderProfile` — additive wrappers around the existing install-chain validators that take a `profile_id` and add a profile precheck for the relevant id (touchpoint or surface) where one applies |

### Edited in place

| File | Change |
|---|---|
| `packages/validation-chassis/src/failure-codes.ts` | Added 14 compatibility/profile failure codes (no removals) |
| `packages/validation-chassis/src/index.ts` | Re-exported the new validators and types |

### Worker-isolated

| File | Purpose |
|---|---|
| `worker-wb/p3.1/implementation-report.md` | This document |

### NOT edited (intentional — minimum merge surface, additive enforcement only)

- `packages/contracts-core/**` — WA-owned (P1, P1.1, P3.0). Read-only.
- `packages/contracts-core/src/profiles/**` — WA P3.0. Read-only.
- `packages/registry-chassis/**`, `packages/lifecycle-chassis/**`, `packages/runtime-bridge/**`, `packages/session-transport/**` — left as-is.
- `packages/schema-chassis/**` — already enum-aware after WB P2.1; no further edits.
- `apps/operator-shell/src/app/layout/shell.layout.ts`, `apps/web-public/src/app/layout/shell.layout.ts` — left as-is.
- `apps/core-runtime/src/routes/*.route.ts` (4 files) — left as-is.
- `apps/core-runtime/src/touchpoints/*.touchpoint.ts` (4 files) — left as-is.
- `apps/operator-shell/src/mounts/*.mount.ts`, `apps/web-public/src/mounts/*.mount.ts` (4 files) — left as-is.
- `apps/core-runtime/src/session/activation-gate.ts`, `apps/local-host/src/bridge/runtime-bridge.ts`, `apps/local-host/src/transport/session-link.ts` — left as-is.
- `packages/validation-chassis/src/install-chain.validator.ts`, `mount.validator.ts`, `route-surface.validator.ts`, `touchpoint-surface.validator.ts`, `touchpoint-event.validator.ts`, `trigger-event.validator.ts`, `lifecycle-transition.validator.ts`, `schema.validator.ts`, `id-domain.validator.ts`, `result.ts` — left as-is. The new validators COMPOSE these, never replace them.

---

## 2. Compatibility rules added

All rules read the landed `PROFILE_COMPATIBILITY_MAP` from
`packages/contracts-core/src/profiles/compatibility-map.ts`. **No rule
populates Mobile or PC buckets**, **no rule invents profile ids**, **no rule
narrows chassis contract types based on profile membership**, and **no rule
introduces a new chassis-profile status, derivation mode, or lifecycle path**.

### 2.1 Exposure-classification rule

`classifyExposure<T extends string>(exposure, id) → "allowed" | "blocked" | "optional" | "unresolved"`

- `allowed` ⇐ `id ∈ exposure.allowed`
- `optional` ⇐ `id ∈ exposure.optional` (treated as pass with note)
- `blocked` ⇐ `id ∈ exposure.blocked`, OR (`id ∉` any of the three buckets) AND at least one bucket is non-empty
- `unresolved` ⇐ all three buckets empty (per WA P3.0 directive: "treated as 'no exposure decided' rather than 'everything blocked'")

### 2.2 Per-id-kind membership rules

Each runs `classifyExposure` against the corresponding profile bucket and emits a structured `ValidationResult`:

| Validator | Rule |
|---|---|
| `validateProfileShell(profile_id, shell_owner_id)` | `shell_owner_id ∈ profile.shells` (allowed/blocked/optional/unresolved) |
| `validateProfileSurface(profile_id, surface_id)` | `surface_id ∈ profile.surfaces` |
| `validateProfileRoute(profile_id, route_id)` | `route_id ∈ profile.routes` |
| `validateProfileTouchpoint(profile_id, touchpoint_id)` | `touchpoint_id ∈ profile.touchpoints` |
| `validateProfileMount(profile_id, mount_touchpoint_id)` | `mount_touchpoint_id ∈ profile.mounts` (mounts in WA P3.0 are keyed by `TouchpointId`, not by a separate mount id domain) |

For each: `unknown profile_id → fail(profile_unknown)`; `allowed → pass`; `optional → pass(notes="optional, allowed pending canonical authority")`; `blocked → fail(profile_<kind>_blocked)`; `unresolved → skipped(notes carries failure_code_if_resolved=profile_<kind>_unresolved)`.

### 2.3 Composite rules

| Validator | Composes | Behavior on unresolved |
|---|---|---|
| `validateShellSurface(profile_id, shell_owner_id, surface_id, shell_split_kind?)` | `validateProfileShell` + `validateProfileSurface` | If either is `skipped` → skipped. If `shell_split_kind` is provided AND both pass → `skipped` with `failure_code_if_resolved=shell_ownership_split_unresolved` (covers prep risk **C-3**) |
| `validateShellMount(profile_id, shell_owner_id, mount_touchpoint_id, shell_split_kind?)` | `validateProfileShell` + `validateProfileMount` | Same rules |
| `validateMountSurfaceUnderProfile(mount, expected_surface_id, profile_id)` | `validateMountAuthorization` (existing P2.1) + `validateProfileTouchpoint` + `validateProfileSurface` | If profile checks are unresolved → skipped with explicit notes |

### 2.4 Profile-aware runtime-gate rules (cover prep risks RT-1..RT-6)

Each wrapper takes the existing install-chain validator's inputs PLUS a `profile_id` (and where applicable, the specific touchpoint or surface id the gate decision affects):

| Wrapper | Underlying gate | Profile precheck |
|---|---|---|
| `validateBridgeActivatableUnderProfile` | `validateBridgeActivatable` | profile must be known (no per-id precheck — bridge is global) |
| `validateLocalBridgeReadyUnderProfile` | `validateLocalBridgeReady` | profile must be known (global) |
| `validateActivationEligibleUnderProfile` | `validateActivationEligible` | profile must be known (global) |
| `validateTransportReadyUnderProfile` | `validateTransportReady` | `validateProfileTouchpoint(profile_id, touchpoint_id)` short-circuits the gate when the touchpoint is blocked in the profile (covers RT-4: collapse of `touchpoint_enabled` boolean) |
| `validateSessionLinkAvailableUnderProfile` | `validateSessionLinkAvailable` | `validateProfileSurface(profile_id, surface_id)` short-circuits when the surface is blocked (covers RT-5) |

The wrappers preserve the underlying gate signature unchanged. They neither modify nor depend on changes to `runtime-bridge`, `activation-gate`, `runtime-bridge` (local-host), `transport-contract`, or `session-link.ts`.

---

## 3. Validators / helpers added

| Symbol | Kind | File |
|---|---|---|
| `ExposureClass` | type alias | `compatibility.validator.ts` |
| `classifyExposure<T>` | helper function | `compatibility.validator.ts` |
| `validateProfileShell` | validator | `compatibility.validator.ts` |
| `validateProfileSurface` | validator | `compatibility.validator.ts` |
| `validateProfileRoute` | validator | `compatibility.validator.ts` |
| `validateProfileTouchpoint` | validator | `compatibility.validator.ts` |
| `validateProfileMount` | validator | `compatibility.validator.ts` |
| `ShellSurfaceInputs` / `validateShellSurface` | type + validator | `shell-surface.validator.ts` |
| `ShellMountInputs` / `validateShellMount` | type + validator | `shell-mount.validator.ts` |
| `MountSurfaceCompatibilityInputs` / `validateMountSurfaceUnderProfile` | type + validator | `mount-compatibility.validator.ts` |
| `ProfileBridgeActivationInputs` / `validateBridgeActivatableUnderProfile` | type + validator | `profile-runtime-gate.validator.ts` |
| `ProfileLocalBridgeReadyInputs` / `validateLocalBridgeReadyUnderProfile` | type + validator | `profile-runtime-gate.validator.ts` |
| `ProfileActivationEligibilityInputs` / `validateActivationEligibleUnderProfile` | type + validator | `profile-runtime-gate.validator.ts` |
| `ProfileTransportReadyInputs` / `validateTransportReadyUnderProfile` | type + validator | `profile-runtime-gate.validator.ts` |
| `ProfileSessionLinkInputs` / `validateSessionLinkAvailableUnderProfile` | type + validator | `profile-runtime-gate.validator.ts` |

**Total: 16 new exported symbols + 14 new failure-code constants.**

---

## 4. Profile-aware checks added

All five profile-aware runtime-gate wrappers (§2.4) are now callable. They sit alongside the existing structured install-chain validators from WB P2.1; existing callers continue to use the unchanged validators.

The `tagWithProfile` helper attaches a `notes` trail recording which profile a runtime decision was made under, so any auditor walking validation results can answer "what profile context was active when this gate fired?" without changing the gate's underlying logic or signature.

The wrappers respect the WA P3.0 unresolved-bucket rule: when the profile precheck returns `skipped` (empty bucket), the wrapper still runs the underlying gate and records the unresolved-membership concern in the result's `notes` field — never silently passes, never silently fails.

---

## 5. Blocked / unresolved items

All items below remain unresolved and are surfaced as `skipped` results (or `notes` annotations) at runtime, never as guesses.

| Item | Status | Reason |
|---|---|---|
| `MOBILE_OPTIMIZED_PROFILE` allowed/blocked/optional buckets | empty (UNRESOLVED) | WA P3.0 explicitly does not invent values; WB P3.1 does not populate. Validators emit `skipped` with `failure_code_if_resolved=profile_<kind>_unresolved`. |
| `PC_OPTIMIZED_PROFILE` allowed/blocked/optional buckets | empty (UNRESOLVED) | (same) |
| Shell ownership split (operator-shell vs web-public) | UNRESOLVED | Both shells use `SHELL_OWNER_IDS.FACTORY` in the merged base; canonical authority has not published a split. `validateShellSurface` and `validateShellMount` accept an optional `shell_split_kind` and STOP at that point with a `skipped` result carrying `failure_code_if_resolved=shell_ownership_split_unresolved`. |
| Touchpoint↔event coupling per profile | UNRESOLVED | WA P3.0 does not key event ids per profile. WB P3.1 does NOT introduce a per-profile event namespace. Existing `validateTouchpointEvents` is profile-agnostic. |
| Profile-specific touchpoint variants (e.g. mobile-flavored install) | UNRESOLVED | Subset_of_full_body forbids inventing ids; WB cannot create variants. |
| Profile-bound install-chain semantics (bridge / activation / session-link state machine forks) | EXPLICITLY DECLINED | WA P3.0 derivation rules forbid forking lifecycle, install-law, or runtime authority. Profile-aware wrappers add precheck only, never modify gate semantics. |
| Mobile/PC profile shell membership for the single landed `shell.factory` | UNRESOLVED | derived buckets empty |
| Mobile/PC profile surface membership | UNRESOLVED | derived buckets empty |
| Mobile/PC profile route/touchpoint/mount membership | UNRESOLVED | derived buckets empty |

WB P3.1 does NOT carry any code path that would silently shift behavior if Mobile/PC are populated later — every unresolved branch routes through `skipped` with explicit notes.

---

## 6. Discipline checks against WB P3.1 instructions

| Instruction | Status |
|---|---|
| §1 — landed profile layer used as read authority | ✓ — every validator imports from `packages/contracts-core/src/index.js` (WA P3.0 barrel) and reads `PROFILE_COMPATIBILITY_MAP` |
| §1 — Full Body remains superset | ✓ — Full Body's `allowed` buckets are not modified or shadowed |
| §1 — Mobile/PC remain unresolved unless explicitly constrained by landed profile data | ✓ — derived empty buckets resolve to `skipped`, not invented values |
| §2 — shell→allowed surfaces check | ✓ — `validateShellSurface` |
| §2 — shell→allowed mounts check | ✓ — `validateShellMount` |
| §2 — profile→allowed routes check | ✓ — `validateProfileRoute` |
| §2 — profile→allowed touchpoints check | ✓ — `validateProfileTouchpoint` |
| §2 — mount→allowed surface check | ✓ — `validateMountSurfaceUnderProfile` |
| §2 — runtime/bridge profile-distinction collapse | ✓ — 5 profile-aware runtime-gate wrappers (RT-1..RT-5 covered; RT-6 noted) |
| §3 — additive only, no destructive rewrites | ✓ — only `failure-codes.ts` and `index.ts` were edited inside `validation-chassis`; both edits add new entries, change none |
| §3 — keep existing behavior stable | ✓ — no app source touched; no existing validator signature modified |
| §4 — do not populate Mobile/PC | ✓ — both stay empty |
| §4 — do not invent profile ids | ✓ — only `PROFILE_IDS` consumed |
| §4 — do not fork lifecycle / install law | ✓ — `lifecycle-chassis` and install-chain semantics untouched |
| §4 — do not shift runtime authority into profiles | ✓ — wrappers tag with profile, never override gate decisions |
| §4 — do not rename existing ids to make profiles fit | ✓ — no id renames |
| §5 — unresolved profile membership marked explicitly | ✓ — `skipped` results carry `failure_code_if_resolved` in notes |
| §5 — shell ownership split flagged and stopped | ✓ — `shell_split_kind` parameter triggers explicit `skipped` |
| §5 — provisional touchpoint/event/profile coupling logged not invented | ✓ — no new coupling code |

---

## 7. Merge-risk list (for FM | V1.2)

| Risk | Path | Why |
|---|---|---|
| **none (additive)** | `packages/validation-chassis/src/compatibility.validator.ts` | new file |
| **none (additive)** | `packages/validation-chassis/src/shell-surface.validator.ts` | new file |
| **none (additive)** | `packages/validation-chassis/src/shell-mount.validator.ts` | new file |
| **none (additive)** | `packages/validation-chassis/src/mount-compatibility.validator.ts` | new file |
| **none (additive)** | `packages/validation-chassis/src/profile-runtime-gate.validator.ts` | new file |
| **low** | `packages/validation-chassis/src/failure-codes.ts` | edited; only appended new constants in a new section, no removals or reorderings |
| **low** | `packages/validation-chassis/src/index.ts` | edited; only appended new exports |
| **none** | `worker-wb/p3.1/implementation-report.md` | worker-isolated doc |

No `apps/*`, no `contracts-core/*`, no `schema-chassis/*`, no `lifecycle-chassis/*`, no `runtime-bridge/*` modifications. Validation-chassis additions are all dependency-direction-safe (downward to contracts-core only).

Forecast for the next stage: if WA publishes Mobile/PC bucket contents, the only WB changes required will be call-site additions (no edits to the validators in this commit).

---

## 8. Tag packet

```yaml
expected_tag: "FullBody | WB | P3.1"
actual_tag:   "FullBody | WB | P3.1"
result:       pass
failure_code: null
retryable:    false
next_stage:   "FullBody | FM | V1.2 merge gate"
```
