// Shared domain constants — central source of string truth for chassis domains
// Upstream authority: xyz-factory-system/invariants/chassis (canonical)
// DOWNSTREAM STATUS: non-authoritative — refactor-only centralization of existing
// string literals; no new authority paths, no runtime invention.
//
// Every domain below exposes:
//   * an exported constant set (object literal frozen as `as const`)
//   * an exported typed union derived from that constant set
//
// Unmapped domains (see UNMAPPED section at the bottom) remain typed as `string`
// and are flagged for foreman review.

// === Lifecycle states ===
// Used by: Module.lifecycle_state, lifecycle eligibility helpers.
export const LIFECYCLE_STATES = {
  INSTALLED: "installed",
  DISABLED: "disabled",
} as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[keyof typeof LIFECYCLE_STATES];

// === Registry states ===
// Used by: every *.registry_state field.
export const REGISTRY_STATES = {
  REGISTERED: "registered",
} as const;
export type RegistryState = (typeof REGISTRY_STATES)[keyof typeof REGISTRY_STATES];

// === Resolver states ===
// Used by: ResolverOutput.resolver_state and activation/stamp coverage checks.
export const RESOLVER_STATES = {
  RESOLVED: "resolved",
} as const;
export type ResolverState = (typeof RESOLVER_STATES)[keyof typeof RESOLVER_STATES];

// === Consistency results ===
// Used by: ResolverOutput.consistency_result.
export const CONSISTENCY_RESULTS = {
  PASS: "pass",
} as const;
export type ConsistencyResult = (typeof CONSISTENCY_RESULTS)[keyof typeof CONSISTENCY_RESULTS];

// === Install stamp states ===
// Used by: InstallStamp.stamp_state and bridge/runtime activation checks.
export const STAMP_STATES = {
  ISSUED: "issued",
} as const;
export type StampState = (typeof STAMP_STATES)[keyof typeof STAMP_STATES];

// === Surface IDs ===
// Used by: Surface.surface_id, Route.surface_id, Touchpoint.surface_id,
// shell layouts, and surface-bound mounts.
export const SURFACE_IDS = {
  CLI_FACTORY: "sf.cli.factory",
  API_FACTORY: "sf.api.factory",
} as const;
export type SurfaceId = (typeof SURFACE_IDS)[keyof typeof SURFACE_IDS];

// === Route IDs ===
// Used by: Route.route_id and route consumers.
export const ROUTE_IDS = {
  CHASSIS_INSTALL: "rt.chassis.install",
  CHASSIS_UPDATE: "rt.chassis.update",
  CHASSIS_DISABLE: "rt.chassis.disable",
  CHASSIS_REMOVE: "rt.chassis.remove",
} as const;
export type RouteId = (typeof ROUTE_IDS)[keyof typeof ROUTE_IDS];

// === Touchpoint IDs ===
// Used by: Touchpoint.touchpoint_id and mount consumers.
export const TOUCHPOINT_IDS = {
  CLI_INSTALL: "tp.cli.install",
  CLI_UPDATE: "tp.cli.update",
  API_DISABLE: "tp.api.disable",
  API_REMOVE: "tp.api.remove",
} as const;
export type TouchpointId = (typeof TOUCHPOINT_IDS)[keyof typeof TOUCHPOINT_IDS];

// === Trigger IDs ===
// Used by: Trigger.trigger_id.
export const TRIGGER_IDS = {
  CHASSIS_INSTALL: "trg.chassis.install",
  CHASSIS_UPDATE: "trg.chassis.update",
  CHASSIS_DISABLE: "trg.chassis.disable",
  CHASSIS_REMOVE: "trg.chassis.remove",
} as const;
export type TriggerId = (typeof TRIGGER_IDS)[keyof typeof TRIGGER_IDS];

// === Event IDs ===
// Used by: Event.event_id and touchpoint event refs.
export const EVENT_IDS = {
  CHASSIS_INSTALL_REQUESTED: "evt.chassis.install.requested",
  CHASSIS_INSTALL_COMPLETED: "evt.chassis.install.completed",
  CHASSIS_INSTALL_FAILED: "evt.chassis.install.failed",
  CHASSIS_UPDATE_REQUESTED: "evt.chassis.update.requested",
  CHASSIS_UPDATE_COMPLETED: "evt.chassis.update.completed",
  CHASSIS_UPDATE_FAILED: "evt.chassis.update.failed",
  CHASSIS_DISABLE_REQUESTED: "evt.chassis.disable.requested",
  CHASSIS_DISABLE_COMPLETED: "evt.chassis.disable.completed",
  CHASSIS_DISABLE_FAILED: "evt.chassis.disable.failed",
  CHASSIS_REMOVE_REQUESTED: "evt.chassis.remove.requested",
  CHASSIS_REMOVE_COMPLETED: "evt.chassis.remove.completed",
  CHASSIS_REMOVE_FAILED: "evt.chassis.remove.failed",
} as const;
export type EventId = (typeof EVENT_IDS)[keyof typeof EVENT_IDS];

// === Module IDs ===
// Used by: Module.module_id.
export const MODULE_IDS = {
  CHASSIS_CORE: "mod.chassis.core",
} as const;
export type ModuleId = (typeof MODULE_IDS)[keyof typeof MODULE_IDS];

// === Shell owner IDs ===
// Used by: Surface.shell_owner_id and shell layout identity.
export const SHELL_OWNER_IDS = {
  FACTORY: "shell.factory",
} as const;
export type ShellOwnerId = (typeof SHELL_OWNER_IDS)[keyof typeof SHELL_OWNER_IDS];

// =============================================================================
// UNMAPPED MANIFEST FIELDS — unresolved authority domain
// =============================================================================
// The following string-typed fields appear on the manifest contract but no
// canonical values exist in this package set or in the upstream canonical
// stubs (xyz-factory-system/invariants/chassis/types/Manifest.contract.md).
//
// They remain typed as `string` on the contract interface. WA P1.1 does NOT
// invent values, narrow types, or back-fill defaults. These stubs exist only
// so the next stage knows where to look.
//
// FOLLOW-UP STUBS (do not bind until canonical authority publishes values):
//
//   DECLARATION_KINDS    — placeholder for Declaration.declaration_kind
//   DECLARATION_STATES   — placeholder for Declaration.declaration_state
//   DECLARATION_SCOPES   — placeholder for DeclarationEnvelope.declaration_scope
//
// Each placeholder is intentionally an empty `as const` object so the symbol
// is reserved without committing to any value. The corresponding type alias
// resolves to `never` until the set is populated, which prevents accidental
// premature binding by downstream code.
export const DECLARATION_KINDS = {} as const;
export type DeclarationKind = (typeof DECLARATION_KINDS)[keyof typeof DECLARATION_KINDS];

export const DECLARATION_STATES = {} as const;
export type DeclarationState = (typeof DECLARATION_STATES)[keyof typeof DECLARATION_STATES];

export const DECLARATION_SCOPES = {} as const;
export type DeclarationScope = (typeof DECLARATION_SCOPES)[keyof typeof DECLARATION_SCOPES];

// Flag: unmapped — needs foreman review.
// Authority status: unresolved (canonical stubs are empty as of WA P1.1).
// Do not narrow Declaration / DeclarationEnvelope contract fields until the
// canonical authority publishes the value sets.

// =============================================================================
// OPERATOR MAPPING NOTES — old literal → new domain constant
// =============================================================================
// This table is the operator-facing record of the WA P1 normalization. It is
// informational only and is not consumed by runtime code. Use it to trace any
// pre-WA-P1 grep hit back to its current constant.
//
// LIFECYCLE STATES                              affected file group
//   "installed"  → LIFECYCLE_STATES.INSTALLED   lifecycle-chassis/*, registry-chassis/module-registry
//   "disabled"   → LIFECYCLE_STATES.DISABLED    lifecycle-chassis/remove.lifecycle
//
// REGISTRY STATES
//   "registered" → REGISTRY_STATES.REGISTERED   registry-chassis/*, core-runtime routes,
//                                               operator-shell+web-public shell.layout
//
// RESOLVER STATES
//   "resolved"   → RESOLVER_STATES.RESOLVED     lifecycle-chassis/install.lifecycle,
//                                               core-runtime/session/activation-gate
//
// CONSISTENCY RESULTS
//   "pass"       → CONSISTENCY_RESULTS.PASS     lifecycle-chassis/install.lifecycle,
//                                               core-runtime/session/activation-gate
//
// STAMP STATES
//   "issued"     → STAMP_STATES.ISSUED          lifecycle-chassis/install.lifecycle,
//                                               runtime-bridge/bridge-contract,
//                                               core-runtime/session/activation-gate,
//                                               local-host/bridge/runtime-bridge
//
// SURFACE IDS
//   "sf.cli.factory" → SURFACE_IDS.CLI_FACTORY  registry-chassis/surface-registry,
//                                               registry-chassis/route-registry,
//                                               core-runtime routes (install/update),
//                                               core-runtime touchpoints (install/update),
//                                               operator-shell shell.layout + mounts
//   "sf.api.factory" → SURFACE_IDS.API_FACTORY  registry-chassis/surface-registry,
//                                               registry-chassis/route-registry,
//                                               core-runtime routes (disable/remove),
//                                               core-runtime touchpoints (disable/remove),
//                                               web-public shell.layout + mounts
//
// ROUTE IDS
//   "rt.chassis.install" → ROUTE_IDS.CHASSIS_INSTALL  registry-chassis/route-registry,
//                                                     core-runtime/routes/install.route
//   "rt.chassis.update"  → ROUTE_IDS.CHASSIS_UPDATE   registry-chassis/route-registry,
//                                                     core-runtime/routes/update.route
//   "rt.chassis.disable" → ROUTE_IDS.CHASSIS_DISABLE  registry-chassis/route-registry,
//                                                     core-runtime/routes/disable.route
//   "rt.chassis.remove"  → ROUTE_IDS.CHASSIS_REMOVE   registry-chassis/route-registry,
//                                                     core-runtime/routes/remove.route
//
// TOUCHPOINT IDS
//   "tp.cli.install"  → TOUCHPOINT_IDS.CLI_INSTALL    core-runtime/touchpoints/install,
//                                                     operator-shell/mounts/install
//   "tp.cli.update"   → TOUCHPOINT_IDS.CLI_UPDATE     core-runtime/touchpoints/update,
//                                                     operator-shell/mounts/update
//   "tp.api.disable"  → TOUCHPOINT_IDS.API_DISABLE    core-runtime/touchpoints/disable,
//                                                     web-public/mounts/disable
//   "tp.api.remove"   → TOUCHPOINT_IDS.API_REMOVE     core-runtime/touchpoints/remove,
//                                                     web-public/mounts/remove
//
// TRIGGER IDS
//   "trg.chassis.install" → TRIGGER_IDS.CHASSIS_INSTALL  registry-chassis/trigger-registry
//   "trg.chassis.update"  → TRIGGER_IDS.CHASSIS_UPDATE   registry-chassis/trigger-registry
//   "trg.chassis.disable" → TRIGGER_IDS.CHASSIS_DISABLE  registry-chassis/trigger-registry
//   "trg.chassis.remove"  → TRIGGER_IDS.CHASSIS_REMOVE   registry-chassis/trigger-registry
//
// EVENT IDS                                                       affected file group
//   "evt.chassis.install.requested" → EVENT_IDS.CHASSIS_INSTALL_REQUESTED   registry-chassis/event-registry,
//                                                                           core-runtime/touchpoints/install
//   "evt.chassis.install.completed" → EVENT_IDS.CHASSIS_INSTALL_COMPLETED   ...same group
//   "evt.chassis.install.failed"    → EVENT_IDS.CHASSIS_INSTALL_FAILED      ...same group
//   "evt.chassis.update.requested"  → EVENT_IDS.CHASSIS_UPDATE_REQUESTED    registry-chassis/event-registry,
//                                                                           core-runtime/touchpoints/update
//   "evt.chassis.update.completed"  → EVENT_IDS.CHASSIS_UPDATE_COMPLETED    ...same group
//   "evt.chassis.update.failed"     → EVENT_IDS.CHASSIS_UPDATE_FAILED       ...same group
//   "evt.chassis.disable.requested" → EVENT_IDS.CHASSIS_DISABLE_REQUESTED   registry-chassis/event-registry,
//                                                                           core-runtime/touchpoints/disable
//   "evt.chassis.disable.completed" → EVENT_IDS.CHASSIS_DISABLE_COMPLETED   ...same group
//   "evt.chassis.disable.failed"    → EVENT_IDS.CHASSIS_DISABLE_FAILED      ...same group
//   "evt.chassis.remove.requested"  → EVENT_IDS.CHASSIS_REMOVE_REQUESTED    registry-chassis/event-registry,
//                                                                           core-runtime/touchpoints/remove
//   "evt.chassis.remove.completed"  → EVENT_IDS.CHASSIS_REMOVE_COMPLETED    ...same group
//   "evt.chassis.remove.failed"     → EVENT_IDS.CHASSIS_REMOVE_FAILED       ...same group
//
// MODULE IDS
//   "mod.chassis.core" → MODULE_IDS.CHASSIS_CORE   registry-chassis/module-registry
//
// SHELL OWNER IDS
//   "shell.factory"    → SHELL_OWNER_IDS.FACTORY   registry-chassis/surface-registry,
//                                                  operator-shell/shell.layout,
//                                                  web-public/shell.layout
