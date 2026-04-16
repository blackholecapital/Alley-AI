// Upstream authority: xyz-factory-system/invariants/chassis/types/Touchpoint.contract.md
// DOWNSTREAM STATUS: non-authoritative — derived from canonical contract only

import type { TouchpointId, SurfaceId } from "./domain.js";

export interface Touchpoint {
  readonly touchpoint_id: TouchpointId;
  readonly surface_id: SurfaceId;
}
