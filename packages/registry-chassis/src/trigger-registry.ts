// Upstream authority: xyz-factory-system/invariants/chassis/registry/trigger-registry.md
// DOWNSTREAM STATUS: non-authoritative — access/lookup only, no authoritative registration

import type { Trigger } from "../../contracts-core/src/chassis/trigger.contract.js";
import {
  TRIGGER_IDS,
  REGISTRY_STATES,
} from "../../contracts-core/src/chassis/domain.js";

const entries: readonly Trigger[] = [
  { trigger_id: TRIGGER_IDS.CHASSIS_INSTALL, registry_state: REGISTRY_STATES.REGISTERED },
  { trigger_id: TRIGGER_IDS.CHASSIS_UPDATE, registry_state: REGISTRY_STATES.REGISTERED },
  { trigger_id: TRIGGER_IDS.CHASSIS_DISABLE, registry_state: REGISTRY_STATES.REGISTERED },
  { trigger_id: TRIGGER_IDS.CHASSIS_REMOVE, registry_state: REGISTRY_STATES.REGISTERED },
] as const;

export function lookupTrigger(trigger_id: string): Trigger | undefined {
  return entries.find((e) => e.trigger_id === trigger_id);
}

export function listTriggers(): readonly Trigger[] {
  return entries;
}
