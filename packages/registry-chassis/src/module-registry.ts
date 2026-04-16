// Upstream authority: xyz-factory-system/invariants/chassis/registry/module-registry.md
// DOWNSTREAM STATUS: non-authoritative — access/lookup only, no authoritative registration

import type { Module } from "../../contracts-core/src/chassis/module.contract.js";
import {
  MODULE_IDS,
  LIFECYCLE_STATES,
  REGISTRY_STATES,
} from "../../contracts-core/src/chassis/domain.js";

const entries: readonly Module[] = [
  { module_id: MODULE_IDS.CHASSIS_CORE, lifecycle_state: LIFECYCLE_STATES.INSTALLED, registry_state: REGISTRY_STATES.REGISTERED },
] as const;

export function lookupModule(module_id: string): Module | undefined {
  return entries.find((e) => e.module_id === module_id);
}

export function listModules(): readonly Module[] {
  return entries;
}
