// Upstream authority: xyz-factory-system/invariants/chassis/types/Route.contract.md
// DOWNSTREAM STATUS: non-authoritative — derived from canonical contract only

import type { RouteId, SurfaceId, RegistryState } from "./domain.js";

export interface Route {
  readonly route_id: RouteId;
  readonly surface_id: SurfaceId;
  readonly registry_state: RegistryState;
}
