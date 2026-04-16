// Id-domain membership validator
// DOWNSTREAM STATUS: non-authoritative — binds to landed canonical id domains
// in packages/contracts-core/src/chassis/domain.ts. Adds no new id values.
//
// Each validator answers: "is this id a member of its canonical domain?"
// All id domains here were published by WA P1 / WA P1.1.

import {
  ROUTE_IDS,
  SURFACE_IDS,
  TOUCHPOINT_IDS,
  TRIGGER_IDS,
  EVENT_IDS,
  MODULE_IDS,
  SHELL_OWNER_IDS,
  type RouteId,
  type SurfaceId,
  type TouchpointId,
  type TriggerId,
  type EventId,
  type ModuleId,
  type ShellOwnerId,
} from "../../contracts-core/src/chassis/domain.js";
import { fail, pass, type ValidationResult } from "./result.js";
import { FAILURE_CODES } from "./failure-codes.js";

function isMember<T extends Readonly<Record<string, string>>>(
  set: T,
  id: string,
): id is T[keyof T] {
  for (const key of Object.keys(set) as Array<keyof T>) {
    if (set[key] === id) return true;
  }
  return false;
}

export function isKnownRouteId(id: string): id is RouteId {
  return isMember(ROUTE_IDS, id);
}
export function isKnownSurfaceId(id: string): id is SurfaceId {
  return isMember(SURFACE_IDS, id);
}
export function isKnownTouchpointId(id: string): id is TouchpointId {
  return isMember(TOUCHPOINT_IDS, id);
}
export function isKnownTriggerId(id: string): id is TriggerId {
  return isMember(TRIGGER_IDS, id);
}
export function isKnownEventId(id: string): id is EventId {
  return isMember(EVENT_IDS, id);
}
export function isKnownModuleId(id: string): id is ModuleId {
  return isMember(MODULE_IDS, id);
}
export function isKnownShellOwnerId(id: string): id is ShellOwnerId {
  return isMember(SHELL_OWNER_IDS, id);
}

export type IdDomainKind =
  | "route"
  | "surface"
  | "touchpoint"
  | "trigger"
  | "event"
  | "module"
  | "shell_owner";

const VALIDATOR_ID_PREFIX = "validation-chassis.id-domain";

export function validateIdDomain(kind: IdDomainKind, id: string): ValidationResult {
  const target_type = kind;
  const target_id = id;
  const validator_id = `${VALIDATOR_ID_PREFIX}.${kind}`;

  let known = false;
  switch (kind) {
    case "route":
      known = isKnownRouteId(id);
      break;
    case "surface":
      known = isKnownSurfaceId(id);
      break;
    case "touchpoint":
      known = isKnownTouchpointId(id);
      break;
    case "trigger":
      known = isKnownTriggerId(id);
      break;
    case "event":
      known = isKnownEventId(id);
      break;
    case "module":
      known = isKnownModuleId(id);
      break;
    case "shell_owner":
      known = isKnownShellOwnerId(id);
      break;
  }

  if (!known) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.ID_DOMAIN_VIOLATION,
      notes: `id ${JSON.stringify(id)} is not a member of the canonical ${kind} id domain`,
    });
  }
  return pass({ validator_id, target_type, target_id });
}
