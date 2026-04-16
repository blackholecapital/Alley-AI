// Upstream authority: xyz-factory-system/invariants/chassis/registry/surface-registry.md
// DOWNSTREAM STATUS: non-authoritative — access/lookup only, no authoritative registration

import type { Surface } from "../../contracts-core/src/chassis/surface.contract.js";
import {
  SURFACE_IDS,
  SHELL_OWNER_IDS,
  REGISTRY_STATES,
} from "../../contracts-core/src/chassis/domain.js";

const entries: readonly Surface[] = [
  { surface_id: SURFACE_IDS.CLI_FACTORY, shell_owner_id: SHELL_OWNER_IDS.FACTORY, registry_state: REGISTRY_STATES.REGISTERED },
  { surface_id: SURFACE_IDS.API_FACTORY, shell_owner_id: SHELL_OWNER_IDS.FACTORY, registry_state: REGISTRY_STATES.REGISTERED },
] as const;

export function lookupSurface(surface_id: string): Surface | undefined {
  return entries.find((e) => e.surface_id === surface_id);
}

export function listSurfaces(): readonly Surface[] {
  return entries;
}
