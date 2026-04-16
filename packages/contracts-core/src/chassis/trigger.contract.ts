// Upstream authority: xyz-factory-system/invariants/chassis/types/Trigger.contract.md
// DOWNSTREAM STATUS: non-authoritative — derived from canonical contract only

import type { TriggerId, RegistryState } from "./domain.js";

export interface Trigger {
  readonly trigger_id: TriggerId;
  readonly registry_state: RegistryState;
}
