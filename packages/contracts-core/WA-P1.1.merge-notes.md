# WA P1.1 — merge-safe notes for WB P2

UPSTREAM AUTHORITY ROOT: xyz-factory-system/
DOWNSTREAM STATUS: non-authoritative
SCOPE: refactor-only — no behavior change, no new authority paths

## Shared domain exports added (WA scope)

The shared typed-domain layer now lives at:

  packages/contracts-core/src/chassis/domain.ts

Re-exported through:

  packages/contracts-core/src/chassis/index.ts
  packages/contracts-core/src/index.ts

Exported constant sets (with derived typed unions):

  LIFECYCLE_STATES        / LifecycleState
  REGISTRY_STATES         / RegistryState
  RESOLVER_STATES         / ResolverState
  CONSISTENCY_RESULTS     / ConsistencyResult
  STAMP_STATES            / StampState
  SURFACE_IDS             / SurfaceId
  ROUTE_IDS               / RouteId
  TOUCHPOINT_IDS          / TouchpointId
  TRIGGER_IDS             / TriggerId
  EVENT_IDS               / EventId
  MODULE_IDS              / ModuleId
  SHELL_OWNER_IDS         / ShellOwnerId

Unresolved manifest stubs (empty `as const`, type resolves to `never`):

  DECLARATION_KINDS       / DeclarationKind
  DECLARATION_STATES      / DeclarationState
  DECLARATION_SCOPES      / DeclarationScope

## Imports WB should prefer

When WB P2 needs to reference any chassis state/id string, import from the
shared domain rather than re-inlining the literal:

  import {
    REGISTRY_STATES,
    EVENT_IDS,
    SURFACE_IDS,
    // ...etc
    type EventId,
    type SurfaceId,
  } from "<rel>/packages/contracts-core/src/chassis/domain.js";

Or via the package barrel:

  import {
    REGISTRY_STATES,
    type EventId,
  } from "<rel>/packages/contracts-core/src/index.js";

The barrel and the chassis index are kept symmetric — either is acceptable.
Prefer the chassis-level import inside `packages/*` to mirror the existing
relative-path convention; prefer the package-level barrel from `apps/*`.

## Files most likely to collide with WB P2

WB P2 is expected to harden validation logic in `packages/schema-chassis`.
WA P1.1 deliberately did not touch any schema-chassis file; the structural
`typeof === "string"` checks there remain untouched. If WB tightens those
checks to use the typed unions, the natural import path is the same shared
domain file added by WA.

Highest-risk shared artifacts (single point of authority — both stages may
want to extend them):

  packages/contracts-core/src/chassis/domain.ts        # central — extension
                                                       # adds new constants only;
                                                       # WB should APPEND, not
                                                       # rewrite existing entries
  packages/contracts-core/src/chassis/index.ts         # barrel re-exports
  packages/contracts-core/src/index.ts                 # package barrel

Lower-risk shared artifacts (touched by WA, may be touched by WB):

  packages/contracts-core/src/chassis/event.contract.ts
  packages/contracts-core/src/chassis/install-stamp.contract.ts
  packages/contracts-core/src/chassis/module.contract.ts
  packages/contracts-core/src/chassis/route.contract.ts
  packages/contracts-core/src/chassis/surface.contract.ts
  packages/contracts-core/src/chassis/touchpoint.contract.ts
  packages/contracts-core/src/chassis/trigger.contract.ts
  packages/registry-chassis/src/*-registry.ts
  packages/lifecycle-chassis/src/*.lifecycle.ts
  packages/runtime-bridge/src/bridge-contract.ts
  apps/core-runtime/src/session/activation-gate.ts
  apps/core-runtime/src/routes/*.route.ts
  apps/core-runtime/src/touchpoints/*.touchpoint.ts
  apps/operator-shell/src/app/layout/shell.layout.ts
  apps/operator-shell/src/mounts/*.mount.ts
  apps/web-public/src/app/layout/shell.layout.ts
  apps/web-public/src/mounts/*.mount.ts
  apps/local-host/src/bridge/runtime-bridge.ts

If WB needs to edit any of these, prefer adding to the import list rather
than rewriting existing import blocks — this minimizes line-level conflict.

## Unresolved manifest fields — DO NOT BIND

The following fields remain `string` on the contract surface and will stay
that way until canonical authority publishes value sets:

  Declaration.declaration_kind
  Declaration.declaration_state
  DeclarationEnvelope.declaration_scope

The placeholder constant sets (DECLARATION_KINDS, DECLARATION_STATES,
DECLARATION_SCOPES) are intentionally empty. Their derived types resolve to
`never`. WB P2 must NOT:

  * narrow Declaration / DeclarationEnvelope contract field types
  * import the placeholder constant sets for runtime equality checks
  * invent default values to make schema validation tighter

If WB needs to validate these fields, restrict validation to
`typeof v.declaration_* === "string"` (the existing pattern in
schema-chassis/manifest.schema.ts) until foreman review unblocks the domain.

## Behavior guarantees from WA P1.1

  * No runtime equality check changed shape — every `=== "literal"` was
    replaced with `=== CONSTANT.MEMBER` whose value is the same literal.
  * No registry entry changed identity — every entry value is still the
    same string at runtime.
  * No new exports were added beyond the shared domain layer.
  * No file outside the WA scope was touched.
  * The empty `DECLARATION_*` placeholders are not consumed anywhere.

## Merge note

Merge at end of stage if no shared artifact conflict.
If conflict appears in `packages/contracts-core/src/chassis/domain.ts` or
either barrel, foreman decides file ownership before merge.
