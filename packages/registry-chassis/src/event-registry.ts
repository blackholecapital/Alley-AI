// Upstream authority: xyz-factory-system/invariants/chassis/registry/event-registry.md
// DOWNSTREAM STATUS: non-authoritative — access/lookup only, no authoritative registration

import type { Event } from "../../contracts-core/src/chassis/event.contract.js";
import {
  EVENT_IDS,
  REGISTRY_STATES,
} from "../../contracts-core/src/chassis/domain.js";

const entries: readonly Event[] = [
  { event_id: EVENT_IDS.CHASSIS_INSTALL_REQUESTED, registry_state: REGISTRY_STATES.REGISTERED },
  { event_id: EVENT_IDS.CHASSIS_INSTALL_COMPLETED, registry_state: REGISTRY_STATES.REGISTERED },
  { event_id: EVENT_IDS.CHASSIS_INSTALL_FAILED, registry_state: REGISTRY_STATES.REGISTERED },
  { event_id: EVENT_IDS.CHASSIS_UPDATE_REQUESTED, registry_state: REGISTRY_STATES.REGISTERED },
  { event_id: EVENT_IDS.CHASSIS_UPDATE_COMPLETED, registry_state: REGISTRY_STATES.REGISTERED },
  { event_id: EVENT_IDS.CHASSIS_UPDATE_FAILED, registry_state: REGISTRY_STATES.REGISTERED },
  { event_id: EVENT_IDS.CHASSIS_DISABLE_REQUESTED, registry_state: REGISTRY_STATES.REGISTERED },
  { event_id: EVENT_IDS.CHASSIS_DISABLE_COMPLETED, registry_state: REGISTRY_STATES.REGISTERED },
  { event_id: EVENT_IDS.CHASSIS_DISABLE_FAILED, registry_state: REGISTRY_STATES.REGISTERED },
  { event_id: EVENT_IDS.CHASSIS_REMOVE_REQUESTED, registry_state: REGISTRY_STATES.REGISTERED },
  { event_id: EVENT_IDS.CHASSIS_REMOVE_COMPLETED, registry_state: REGISTRY_STATES.REGISTERED },
  { event_id: EVENT_IDS.CHASSIS_REMOVE_FAILED, registry_state: REGISTRY_STATES.REGISTERED },
] as const;

export function lookupEvent(event_id: string): Event | undefined {
  return entries.find((e) => e.event_id === event_id);
}

export function listEvents(): readonly Event[] {
  return entries;
}
