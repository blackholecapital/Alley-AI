// Upstream authority: xyz-factory-system/invariants/chassis/registry/route-registry.md
// DOWNSTREAM STATUS: non-authoritative — access/lookup only, no authoritative registration

import type { Route } from "../../contracts-core/src/chassis/route.contract.js";
import {
  ROUTE_IDS,
  SURFACE_IDS,
  REGISTRY_STATES,
} from "../../contracts-core/src/chassis/domain.js";

const entries: readonly Route[] = [
  { route_id: ROUTE_IDS.CHASSIS_INSTALL, surface_id: SURFACE_IDS.CLI_FACTORY, registry_state: REGISTRY_STATES.REGISTERED },
  { route_id: ROUTE_IDS.CHASSIS_UPDATE, surface_id: SURFACE_IDS.CLI_FACTORY, registry_state: REGISTRY_STATES.REGISTERED },
  { route_id: ROUTE_IDS.CHASSIS_DISABLE, surface_id: SURFACE_IDS.API_FACTORY, registry_state: REGISTRY_STATES.REGISTERED },
  { route_id: ROUTE_IDS.CHASSIS_REMOVE, surface_id: SURFACE_IDS.API_FACTORY, registry_state: REGISTRY_STATES.REGISTERED },
] as const;

export function lookupRoute(route_id: string): Route | undefined {
  return entries.find((e) => e.route_id === route_id);
}

export function listRoutes(): readonly Route[] {
  return entries;
}
