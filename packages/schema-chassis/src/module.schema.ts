// Upstream authority: xyz-factory-system/invariants/chassis/schemas/module.schema.md
// DOWNSTREAM STATUS: non-authoritative — no package-local schema authority

import type { Module } from "../../contracts-core/src/chassis/module.contract.js";
import {
  REGISTRY_STATES,
  LIFECYCLE_STATES,
} from "../../contracts-core/src/chassis/domain.js";

function isLifecycleStateValue(s: string): boolean {
  for (const k of Object.keys(LIFECYCLE_STATES) as Array<keyof typeof LIFECYCLE_STATES>) {
    if (LIFECYCLE_STATES[k] === s) return true;
  }
  return false;
}

export function isValidModule(value: unknown): value is Module {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.module_id !== "string") return false;
  if (typeof v.lifecycle_state !== "string") return false;
  if (typeof v.registry_state !== "string") return false;
  if (v.registry_state !== REGISTRY_STATES.REGISTERED) return false;
  if (!isLifecycleStateValue(v.lifecycle_state)) return false;
  return true;
}
