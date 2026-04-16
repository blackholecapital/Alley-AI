// Route consumer: install
// DOWNSTREAM STATUS: non-authoritative — no route exposure outside canonical authority

import type { Route } from "../../../../packages/contracts-core/src/chassis/route.contract.js";
import {
  ROUTE_IDS,
  SURFACE_IDS,
  REGISTRY_STATES,
} from "../../../../packages/contracts-core/src/chassis/domain.js";

export const INSTALL_ROUTE: Route = {
  route_id: ROUTE_IDS.CHASSIS_INSTALL,
  surface_id: SURFACE_IDS.CLI_FACTORY,
  registry_state: REGISTRY_STATES.REGISTERED,
};
