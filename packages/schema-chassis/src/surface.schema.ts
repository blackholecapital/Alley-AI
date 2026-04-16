// Upstream authority: xyz-factory-system/invariants/chassis/schemas/surface.schema.md
// DOWNSTREAM STATUS: non-authoritative — no package-local schema authority

import type { Surface } from "../../contracts-core/src/chassis/surface.contract.js";
import {
  REGISTRY_STATES,
  SHELL_OWNER_IDS,
} from "../../contracts-core/src/chassis/domain.js";

export function isValidSurface(value: unknown): value is Surface {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.surface_id !== "string") return false;
  if (typeof v.shell_owner_id !== "string") return false;
  if (typeof v.registry_state !== "string") return false;
  if (v.registry_state !== REGISTRY_STATES.REGISTERED) return false;
  if (v.shell_owner_id !== SHELL_OWNER_IDS.FACTORY) return false;
  return true;
}
