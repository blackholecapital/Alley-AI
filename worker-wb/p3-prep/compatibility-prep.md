# FullBody | WB | P3.prep — Compatibility / Composability Hardening Prep

**Stage:** `FullBody | WB | P3.prep`
**Branch:** `claude/prep-validation-hardening-5f7Nb`
**Predecessors on this branch:** WB P2.prep, WB P2.1
**Merged WA dependency:** `FullBody | WA | P1` + `WA | P1.1` (id/state domain layer)
**Worker isolation:** all output lives under `worker-wb/p3-prep/` — no shared artifact mutated.

This is a **prep-only** pass. No exposure point is changed; no profile is finalized; no compatibility rule is enforced. The deliverable is the exposure map plus the matrix WA P-PROFILE will need before WB P3.1 can wire enforcement.

---

## 1. Exposure inventory

Every place in the merged base where a shell, surface, route, touchpoint, mount, or runtime gate becomes externally observable.

### 1.1 Shells (2)

| File:Line | Symbol | Shell owner | Surface declared | Notes |
|---|---|---|---|---|
| `apps/operator-shell/src/app/layout/shell.layout.ts:13` | `SHELL_CONFIG` | `SHELL_OWNER_IDS.FACTORY` | `SURFACE_IDS.CLI_FACTORY` | single surface per shell |
| `apps/operator-shell/src/app/layout/shell.layout.ts:20` | `resolveShellSurface()` | (same) | (same) | constructs `Surface` literal |
| `apps/web-public/src/app/layout/shell.layout.ts:13` | `SHELL_CONFIG` | `SHELL_OWNER_IDS.FACTORY` | `SURFACE_IDS.API_FACTORY` | single surface per shell |
| `apps/web-public/src/app/layout/shell.layout.ts:20` | `resolveShellSurface()` | (same) | (same) | constructs `Surface` literal |

### 1.2 Surfaces (2)

Declared in `packages/registry-chassis/src/surface-registry.ts:11–14`. Both have `shell_owner_id === SHELL_OWNER_IDS.FACTORY`.

| Surface id | Shell owner | Registry state |
|---|---|---|
| `sf.cli.factory` | `shell.factory` | `registered` |
| `sf.api.factory` | `shell.factory` | `registered` |

### 1.3 Routes (4)

Declared in `apps/core-runtime/src/routes/*.route.ts`. Each route hard-binds exactly one `surface_id`.

| File | Route id | Bound surface |
|---|---|---|
| `apps/core-runtime/src/routes/install.route.ts:11` | `rt.chassis.install` | `sf.cli.factory` |
| `apps/core-runtime/src/routes/update.route.ts:11`  | `rt.chassis.update`  | `sf.cli.factory` |
| `apps/core-runtime/src/routes/disable.route.ts:11` | `rt.chassis.disable` | `sf.api.factory` |
| `apps/core-runtime/src/routes/remove.route.ts:11`  | `rt.chassis.remove`  | `sf.api.factory` |

Routes are also mirrored in `packages/registry-chassis/src/route-registry.ts:11–16` with the same surface bindings.

### 1.4 Touchpoints (4)

Declared in `apps/core-runtime/src/touchpoints/*.touchpoint.ts`. Each touchpoint hard-binds exactly one `surface_id` and exactly one `TouchpointEventRefs` triple (`request_event_id`, `completion_event_id`, `failure_event_id`).

| File | Touchpoint id | Surface | Request event | Completion event | Failure event |
|---|---|---|---|---|---|
| `install.touchpoint.ts:12,23` | `tp.cli.install` | `sf.cli.factory` | `evt.chassis.install.requested` | `evt.chassis.install.completed` | `evt.chassis.install.failed` |
| `update.touchpoint.ts:12,17`  | `tp.cli.update`  | `sf.cli.factory` | `evt.chassis.update.requested`  | `evt.chassis.update.completed`  | `evt.chassis.update.failed`  |
| `disable.touchpoint.ts:7,12`  | `tp.api.disable` | `sf.api.factory` | `evt.chassis.disable.requested` | `evt.chassis.disable.completed` | `evt.chassis.disable.failed` |
| `remove.touchpoint.ts:7,12`   | `tp.api.remove`  | `sf.api.factory` | `evt.chassis.remove.requested`  | `evt.chassis.remove.completed`  | `evt.chassis.remove.failed`  |

### 1.5 Mounts (4)

Each mount file binds one `Touchpoint` literal to one declared surface and exposes a single-literal authorization predicate.

| File | Constant | Touchpoint id | Bound surface | Auth predicate |
|---|---|---|---|---|
| `apps/operator-shell/src/mounts/install.mount.ts:10,15` | `INSTALL_MOUNT` | `tp.cli.install` | `sf.cli.factory` | `isMountAuthorized()` returns `surface_id === SURFACE_IDS.CLI_FACTORY` |
| `apps/operator-shell/src/mounts/update.mount.ts:10,15`  | `UPDATE_MOUNT`  | `tp.cli.update`  | `sf.cli.factory` | (same pattern, CLI literal) |
| `apps/web-public/src/mounts/disable.mount.ts:10,15`     | `DISABLE_MOUNT` | `tp.api.disable` | `sf.api.factory` | (same pattern, API literal) |
| `apps/web-public/src/mounts/remove.mount.ts:10,15`      | `REMOVE_MOUNT`  | `tp.api.remove`  | `sf.api.factory` | (same pattern, API literal) |

Mounts are exposed to their owning shell via:
- `apps/operator-shell/src/mounts/index.ts:4–5` → `INSTALL_MOUNT`, `UPDATE_MOUNT`
- `apps/web-public/src/mounts/index.ts:4–5` → `DISABLE_MOUNT`, `REMOVE_MOUNT`

### 1.6 Bridge / runtime access points (5)

| File:Line | Symbol | Inputs | Externally observable as |
|---|---|---|---|
| `packages/runtime-bridge/src/bridge-contract.ts:15` | `isBridgeActivatable(state)` | install_stamp + 3 artifact-presence booleans | global single bridge readiness |
| `apps/local-host/src/bridge/runtime-bridge.ts:13` | `isBridgeReady(config)` | install_stamp + production_install_verified | local-host bridge readiness |
| `apps/core-runtime/src/session/activation-gate.ts:27` | `isActivationEligible(inputs)` | resolverOutput + installStamp + 3 artifact-presence booleans | session activation eligibility |
| `packages/session-transport/src/transport-contract.ts:11` | `isTransportReady(state)` | bridge_activatable + activation_eligible + touchpoint_enabled | transport availability |
| `apps/local-host/src/transport/session-link.ts:9` | `isSessionLinkAvailable(config)` | bridge_ready + activation_eligible | session link |

**Observation:** none of these gates carry a `shell_id`, `surface_id`, or `profile_id` parameter. Every runtime/bridge gate today is **profile-agnostic** — it answers a single global yes/no.

---

## 2. Current exposure map

### 2.1 Shell → surfaces (1:1 today)

```
operator-shell (shell.factory) ── exposes ──> sf.cli.factory
web-public     (shell.factory) ── exposes ──> sf.api.factory
```

### 2.2 Route → surface (4:2)

```
rt.chassis.install ──> sf.cli.factory
rt.chassis.update  ──> sf.cli.factory
rt.chassis.disable ──> sf.api.factory
rt.chassis.remove  ──> sf.api.factory
```

### 2.3 Touchpoint → surface / event (4:2 surfaces, 4×3 = 12 event legs)

```
tp.cli.install  ──surface──> sf.cli.factory
                ──events──> [install.requested, install.completed, install.failed]

tp.cli.update   ──surface──> sf.cli.factory
                ──events──> [update.requested, update.completed, update.failed]

tp.api.disable  ──surface──> sf.api.factory
                ──events──> [disable.requested, disable.completed, disable.failed]

tp.api.remove   ──surface──> sf.api.factory
                ──events──> [remove.requested, remove.completed, remove.failed]
```

### 2.4 Mount → shell

```
operator-shell mounts: { INSTALL_MOUNT (tp.cli.install), UPDATE_MOUNT (tp.cli.update) }
web-public mounts:     { DISABLE_MOUNT (tp.api.disable), REMOVE_MOUNT (tp.api.remove) }
```

The shell→mount association is implicit: it's the directory the mount file lives in (`apps/<shell>/src/mounts/*.mount.ts`) plus the corresponding `mounts/index.ts` barrel. There is **no runtime registry** of "which mounts belong to which shell."

### 2.5 Runtime/bridge gate → assumed shell or surface

| Gate | Shell assumed | Surface assumed | Notes |
|---|---|---|---|
| `isBridgeActivatable` | none | none | global |
| `isBridgeReady` | local-host (path-implicit) | none | global per host |
| `isActivationEligible` | core-runtime (path-implicit) | none | global per session |
| `isTransportReady` | none | none | collapses all touchpoints into one `touchpoint_enabled` flag |
| `isSessionLinkAvailable` | none | none | global per session link |

**No runtime gate today varies behavior by shell, surface, or profile.** Every gate collapses to a single global yes/no answer.

---

## 3. Classification map

Categories per WB P3.prep instruction §3:
- `core-full-body` — must be present in every profile
- `mobile-compatible` — present in a mobile-class profile
- `pc-compatible` — present in a pc-class profile
- `shared` — visible across all profiles
- `blocked` — must NOT appear in some profile (placeholder; specific exclusion list comes from WA P-PROFILE)
- `unresolved` — needs WA P-PROFILE before classification can be finalized

> **Authority note.** No `profile` symbol exists in `packages/contracts-core/src/chassis/domain.ts`, no `mobile`/`pc`/`full-body` constant exists anywhere in the merged base, and no canonical profile authority is published under `xyz-factory-system/invariants/`. Every classification below carries a **provisional** column reflecting the local naming/structure heuristic, plus an **authoritative** column held at `unresolved` until WA publishes profile names.

### 3.1 Shells

| Shell | Provisional class | Authoritative | Reasoning |
|---|---|---|---|
| `operator-shell` | `pc-compatible` (heuristic: declares `sf.cli.factory`, CLI is a desktop interaction) | `unresolved` | profile vocabulary not published |
| `web-public` | `shared` (heuristic: declares `sf.api.factory`, API has no inherent device coupling) | `unresolved` | profile vocabulary not published |

### 3.2 Surfaces

| Surface | Provisional class | Authoritative | Reasoning |
|---|---|---|---|
| `sf.cli.factory` | `pc-compatible` | `unresolved` | CLI shape implies desktop terminal — heuristic only |
| `sf.api.factory` | `shared` | `unresolved` | API is not device-coupled — heuristic only |

### 3.3 Routes

| Route | Surface | Provisional class | Authoritative | Reasoning |
|---|---|---|---|---|
| `rt.chassis.install` | `sf.cli.factory` | `core-full-body` (install path is on the explicit canonical install chain) | `unresolved` | install/remove are canonical lifecycle but profile gating not published |
| `rt.chassis.update`  | `sf.cli.factory` | `core-full-body` | `unresolved` | (same) |
| `rt.chassis.disable` | `sf.api.factory` | `core-full-body` | `unresolved` | (same) |
| `rt.chassis.remove`  | `sf.api.factory` | `core-full-body` | `unresolved` | (same) |

### 3.4 Touchpoints

| Touchpoint | Surface | Provisional class | Authoritative |
|---|---|---|---|
| `tp.cli.install` | `sf.cli.factory` | `pc-compatible` | `unresolved` |
| `tp.cli.update`  | `sf.cli.factory` | `pc-compatible` | `unresolved` |
| `tp.api.disable` | `sf.api.factory` | `shared`         | `unresolved` |
| `tp.api.remove`  | `sf.api.factory` | `shared`         | `unresolved` |

### 3.5 Mounts

| Mount | Owning shell | Provisional class | Authoritative |
|---|---|---|---|
| `INSTALL_MOUNT` | operator-shell | `pc-compatible` | `unresolved` |
| `UPDATE_MOUNT`  | operator-shell | `pc-compatible` | `unresolved` |
| `DISABLE_MOUNT` | web-public     | `shared`        | `unresolved` |
| `REMOVE_MOUNT`  | web-public     | `shared`        | `unresolved` |

### 3.6 Runtime/bridge gates

All five runtime gates are currently **`shared`** by structure: they answer a single global yes/no with no profile parameter. Authoritative classification is **`unresolved`** because WA P-PROFILE may require some gates to be profile-aware (e.g., mobile-only `isSessionLinkAvailable` flavor).

---

## 4. Compatibility-check matrix draft (for WA binding)

Each row is a *cell that must exist* once WA P-PROFILE lands. Cells are intentionally left as `?` so WB P3.1 cannot accidentally bind them today.

### 4.1 shell → allowed surfaces

| shell | sf.cli.factory | sf.api.factory |
|---|---|---|
| operator-shell | ? (today: hard-coded yes via `SHELL_CONFIG`) | ? (today: implicit no) |
| web-public     | ? (today: implicit no) | ? (today: hard-coded yes via `SHELL_CONFIG`) |

### 4.2 shell → allowed mounts

| shell | INSTALL_MOUNT | UPDATE_MOUNT | DISABLE_MOUNT | REMOVE_MOUNT |
|---|---|---|---|---|
| operator-shell | ? (today: directory-implicit yes) | ? (yes) | ? (no) | ? (no) |
| web-public     | ? (no) | ? (no) | ? (yes) | ? (yes) |

### 4.3 profile → allowed routes

| profile (TBD by WA) | rt.chassis.install | rt.chassis.update | rt.chassis.disable | rt.chassis.remove |
|---|---|---|---|---|
| `?core-full-body` | ? | ? | ? | ? |
| `?mobile-compatible` | ? | ? | ? | ? |
| `?pc-compatible` | ? | ? | ? | ? |

### 4.4 profile → allowed touchpoints

| profile (TBD) | tp.cli.install | tp.cli.update | tp.api.disable | tp.api.remove |
|---|---|---|---|---|
| `?core-full-body` | ? | ? | ? | ? |
| `?mobile-compatible` | ? | ? | ? | ? |
| `?pc-compatible` | ? | ? | ? | ? |

### 4.5 profile → blocked capabilities

| profile (TBD) | blocked surfaces | blocked routes | blocked touchpoints | blocked mounts |
|---|---|---|---|---|
| `?core-full-body` | ? | ? | ? | ? |
| `?mobile-compatible` | ? | ? | ? | ? |
| `?pc-compatible` | ? | ? | ? | ? |

**Hard rule observed:** none of the `?` cells in this section are populated. The matrix is structural only. WB P3.1 must wait for WA P-PROFILE before filling cells.

---

## 5. Composability risks

Each entry is a concrete defect in the merged base that will block clean WA profile binding unless WB P3.1 resolves it.

### 5.1 Hardcoded shell assumptions

| # | Site | Risk | Notes |
|---|---|---|---|
| C-1 | `apps/operator-shell/src/app/layout/shell.layout.ts:13–18` | `SHELL_CONFIG` is a single literal — shell cannot host more than one surface | rebinding to a profile-keyed map requires schema work |
| C-2 | `apps/web-public/src/app/layout/shell.layout.ts:13–18` | (same) | (same) |
| C-3 | both shells use `SHELL_OWNER_IDS.FACTORY` | shell-owner id does not distinguish operator-shell from web-public | downstream cannot key any decision off `shell_owner_id` |

### 5.2 Hardcoded surface assumptions

| # | Site | Risk | Notes |
|---|---|---|---|
| S-1 | `apps/core-runtime/src/routes/*.route.ts` (4 files) | each route literal binds exactly one `surface_id` | route cannot be re-targeted per profile without editing source |
| S-2 | `apps/core-runtime/src/touchpoints/*.touchpoint.ts` (4 files) | each touchpoint literal binds exactly one `surface_id` | touchpoint cannot be relocated per profile |
| S-3 | `apps/operator-shell/src/mounts/*.mount.ts` and `apps/web-public/src/mounts/*.mount.ts` (4 files) | each mount literal binds exactly one `surface_id` and the auth predicate compares against a literal constant | mount surface cannot be parameterized by profile |
| S-4 | `packages/registry-chassis/src/route-registry.ts:11–16` | route registry encodes the (route_id, surface_id) pairing | any per-profile route variation requires multi-row entries — registry shape does not support this today |

### 5.3 Route exposure coupled to one shell only

| # | Site | Risk |
|---|---|---|
| R-1 | `rt.chassis.install`, `rt.chassis.update` | bound to `sf.cli.factory` only — cannot be reached from web-public even though "install" is core-full-body |
| R-2 | `rt.chassis.disable`, `rt.chassis.remove` | bound to `sf.api.factory` only — cannot be reached from operator-shell |
| R-3 | nowhere in the merged base does a route appear under more than one surface — there is no fan-out support |

### 5.4 Touchpoints that are not profile-safe

| # | Site | Risk |
|---|---|---|
| T-1 | `tp.cli.install`, `tp.cli.update` | name embeds `cli` — implicitly assumes `sf.cli.factory`, but no validator enforces it; renaming the surface would silently break the convention |
| T-2 | `tp.api.disable`, `tp.api.remove` | symmetric problem with `api` |
| T-3 | `TouchpointEventRefs` triples are flat literals — no profile axis | each touchpoint can deliver exactly one set of events; per-profile event flavors not expressible |
| T-4 | event_ids are global (`evt.chassis.*`) — no per-profile event namespace | a profile cannot subscribe to a profile-specific completion event |

### 5.5 Mounts that cannot be constrained cleanly

| # | Site | Risk |
|---|---|---|
| M-1 | `isMountAuthorized()` in all 4 mount files takes ZERO arguments and compares against a baked-in literal | cannot pass a profile, request context, or runtime shell id |
| M-2 | mount → shell association is directory-implicit (lives under `apps/<shell>/src/mounts/`) | no runtime registry exists; profile enforcement cannot key off "which shell loaded this mount" |
| M-3 | the `mounts/index.ts` barrels list mounts by static name — no per-profile filtering | cannot conditionally drop a mount for an excluded profile |

### 5.6 Runtime checks that collapse profile distinctions

| # | Site | Risk |
|---|---|---|
| RT-1 | `isBridgeActivatable(state)` (`packages/runtime-bridge/src/bridge-contract.ts:15`) | takes no shell or profile parameter; one global bool |
| RT-2 | `isBridgeReady(config)` (`apps/local-host/src/bridge/runtime-bridge.ts:13`) | (same) |
| RT-3 | `isActivationEligible(inputs)` (`apps/core-runtime/src/session/activation-gate.ts:27`) | (same); also collapses `stampedOutputPresent`/`stampedInstallIntakePresent`/`appliedInstallRecordPresent` into bare booleans, losing per-profile artifact identity |
| RT-4 | `isTransportReady(state)` (`packages/session-transport/src/transport-contract.ts:11`) | the `touchpoint_enabled` field is a single boolean — collapses all 4 touchpoints into one signal |
| RT-5 | `isSessionLinkAvailable(config)` (`apps/local-host/src/transport/session-link.ts:9`) | (same; 2 collapsed flags) |
| RT-6 | The structured `validation-chassis/install-chain.validator.ts` validators inherit RT-1..RT-5 — they report failures with structured codes but still take no profile parameter |

---

## 6. Blocked items (waiting on WA P-PROFILE)

The following cannot be implemented in WB P3.1 without canonical profile authority:

| Item | Blocker |
|---|---|
| Profile name vocabulary (`core-full-body` / `mobile-compatible` / `pc-compatible` / `shared`) | no `PROFILE_KINDS` constant in `contracts-core/chassis/domain.ts` |
| Profile membership table for shells | no canonical authority publishes which shell belongs to which profile |
| Profile membership table for surfaces | (same) |
| Profile membership table for routes / touchpoints / mounts | (same) |
| Profile-blocked capability list | no canonical "profile X must not see capability Y" rule published |
| Profile-aware runtime gate signature (`isBridgeActivatable(state, profile)`) | runtime gate signature is owned by upstream lifecycle/install authority — cannot be widened by WB |
| `Surface.shell_owner_id` distinction between operator-shell and web-public | both shells currently use the same `SHELL_OWNER_IDS.FACTORY`; splitting would require WA to publish new shell-owner ids |
| Per-profile event id namespace (e.g. `evt.chassis.install.requested.<profile>`) | event id domain is owned by WA |
| Mount → profile binding | requires a `MountProfileBinding` artifact that does not exist anywhere yet |

WB P3.1 must NOT invent any of these. The structural placeholders in §4 are the contract.

---

## 7. Merge-risk list (for FM | V1.x)

Sorted by risk for the *prep* deliverable (this commit). The implementation pass is WB P3.1.

| Risk | Path | Why |
|---|---|---|
| **none** | `worker-wb/p3-prep/compatibility-prep.md` | new doc only, worker-isolated |
| **n/a (no edits)** | `apps/operator-shell/src/app/layout/shell.layout.ts` | inventoried only |
| **n/a (no edits)** | `apps/web-public/src/app/layout/shell.layout.ts` | inventoried only |
| **n/a (no edits)** | all `apps/core-runtime/src/routes/*.route.ts` | inventoried only |
| **n/a (no edits)** | all `apps/core-runtime/src/touchpoints/*.touchpoint.ts` | inventoried only |
| **n/a (no edits)** | all `apps/operator-shell/src/mounts/*.mount.ts`, `apps/web-public/src/mounts/*.mount.ts` | inventoried only |
| **n/a (no edits)** | `packages/runtime-bridge/src/bridge-contract.ts`, `apps/core-runtime/src/session/activation-gate.ts`, `apps/local-host/src/bridge/runtime-bridge.ts`, `packages/session-transport/src/transport-contract.ts`, `apps/local-host/src/transport/session-link.ts` | inventoried only |

**Forecast for WB P3.1:** when implementation lands, the highest-conflict surfaces will be the 4 mount files, the 4 touchpoint files, the 4 route files, and the 2 shell.layout files — all of which were touched by WA P1 and WB P2.1. Recommendation: treat them as **medium** merge risk in P3.1 and isolate any new profile binding through a new package (`packages/profile-chassis/` or extending `packages/validation-chassis/`) wherever feasible.

---

## 8. Discipline checks

- [x] All current exposure points inventoried (2 shells, 2 surfaces, 4 routes, 4 touchpoints, 4 mounts, 5 runtime/bridge gates = 21 sites)
- [x] Exposure map built (§2)
- [x] Each exposure point classified, with provisional + authoritative columns (§3)
- [x] Compatibility-check matrix drafted with all cells held at `?` (§4)
- [x] Composability risks called out concretely with file:line (§5: 22 numbered risks)
- [x] WA-PROFILE-dependent items explicitly marked (§6)
- [x] No authority redesign — no edits to `packages/contracts-core` or `xyz-factory-system/`
- [x] No lifecycle/install changes
- [x] No final compatibility enforcement implemented
- [x] No WA-owned profile definitions rewritten — profile vocabulary is held empty
- [x] No file outside `worker-wb/p3-prep/` was added or modified by this prep pass

---

## 9. Tag packet

```yaml
expected_tag: "FullBody | WB | P3.prep"
actual_tag:   "FullBody | WB | P3.prep"
result:       pass
failure_code: null
retryable:    false
next_stage:   "FullBody | WB | P3.1"
```

**Pass condition met.** Compatibility exposure mapped, classified, and risk-listed; WA-dependent cells held empty; no authority drift; merge-safe.
