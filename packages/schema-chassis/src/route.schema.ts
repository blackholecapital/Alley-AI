// Upstream authority: xyz-factory-system/invariants/chassis/schemas/route.schema.md
// DOWNSTREAM STATUS: non-authoritative — no package-local schema authority

import type { Route } from "../../contracts-core/src/chassis/route.contract.js";
import { REGISTRY_STATES } from "../../contracts-core/src/chassis/domain.js";

export function isValidRoute(value: unknown): value is Route {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.route_id !== "string") return false;
  if (typeof v.surface_id !== "string") return false;
  if (typeof v.registry_state !== "string") return false;
  // Bind to landed REGISTRY_STATES domain.
  if (v.registry_state !== REGISTRY_STATES.REGISTERED) return false;
  return true;
}
