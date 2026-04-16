// Shell implementation: web-public
// DOWNSTREAM STATUS: non-authoritative — implements product-shell law only
// Shell owner: shell.factory
// Authorized surface: sf.api.factory

import type { Surface } from "../../../../packages/contracts-core/src/chassis/surface.contract.js";
import {
  SURFACE_IDS,
  SHELL_OWNER_IDS,
  REGISTRY_STATES,
} from "../../../../packages/contracts-core/src/chassis/domain.js";

export const SHELL_CONFIG = {
  shell_id: SHELL_OWNER_IDS.FACTORY,
  surface_id: SURFACE_IDS.API_FACTORY,
  downstream_status: "non-authoritative",
  shell_authority: "canonical only — no module ownership",
} as const;

export function resolveShellSurface(): Surface {
  return {
    surface_id: SURFACE_IDS.API_FACTORY,
    shell_owner_id: SHELL_OWNER_IDS.FACTORY,
    registry_state: REGISTRY_STATES.REGISTERED,
  };
}
