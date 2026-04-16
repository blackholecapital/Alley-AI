// Upstream authority: xyz-factory-system/invariants/chassis/types/Surface.contract.md
// DOWNSTREAM STATUS: non-authoritative — derived from canonical contract only

import type { SurfaceId, ShellOwnerId, RegistryState } from "./domain.js";

export interface Surface {
  readonly surface_id: SurfaceId;
  readonly shell_owner_id: ShellOwnerId;
  readonly registry_state: RegistryState;
}
