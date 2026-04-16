// Barrel export — packages/contracts-core
// DOWNSTREAM STATUS: non-authoritative

export type { Module } from "./module.contract.js";
export type { Event } from "./event.contract.js";
export type { Route } from "./route.contract.js";
export type { Surface } from "./surface.contract.js";
export type { Trigger } from "./trigger.contract.js";
export type { Touchpoint } from "./touchpoint.contract.js";
export type { DeclarationEnvelope, Declaration, Manifest } from "./manifest.contract.js";
export type { InstallStamp, ResolverOutput } from "./install-stamp.contract.js";

export {
  LIFECYCLE_STATES,
  REGISTRY_STATES,
  RESOLVER_STATES,
  CONSISTENCY_RESULTS,
  STAMP_STATES,
  SURFACE_IDS,
  ROUTE_IDS,
  TOUCHPOINT_IDS,
  TRIGGER_IDS,
  EVENT_IDS,
  MODULE_IDS,
  SHELL_OWNER_IDS,
  // Unresolved manifest field stubs — see domain.ts for status.
  DECLARATION_KINDS,
  DECLARATION_STATES,
  DECLARATION_SCOPES,
} from "./domain.js";
export type {
  LifecycleState,
  RegistryState,
  ResolverState,
  ConsistencyResult,
  StampState,
  SurfaceId,
  RouteId,
  TouchpointId,
  TriggerId,
  EventId,
  ModuleId,
  ShellOwnerId,
  // Unresolved manifest field stubs — currently resolve to `never`.
  DeclarationKind,
  DeclarationState,
  DeclarationScope,
} from "./domain.js";
