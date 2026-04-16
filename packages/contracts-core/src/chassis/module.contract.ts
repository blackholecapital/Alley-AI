// Upstream authority: xyz-factory-system/invariants/chassis/types/Module.contract.md
// DOWNSTREAM STATUS: non-authoritative — derived from canonical contract only

import type { ModuleId, LifecycleState, RegistryState } from "./domain.js";

export interface Module {
  readonly module_id: ModuleId;
  readonly lifecycle_state: LifecycleState;
  readonly registry_state: RegistryState;
}
