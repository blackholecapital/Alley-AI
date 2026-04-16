// Upstream authority: xyz-factory-system/invariants/chassis/types/Event.contract.md
// DOWNSTREAM STATUS: non-authoritative — derived from canonical contract only

import type { EventId, RegistryState } from "./domain.js";

export interface Event {
  readonly event_id: EventId;
  readonly registry_state: RegistryState;
}
