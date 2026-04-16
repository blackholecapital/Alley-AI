// Upstream authority: xyz-factory-system/invariants/chassis/schemas/event.schema.md
// DOWNSTREAM STATUS: non-authoritative — no package-local schema authority

import type { Event } from "../../contracts-core/src/chassis/event.contract.js";
import { REGISTRY_STATES } from "../../contracts-core/src/chassis/domain.js";

export function isValidEvent(value: unknown): value is Event {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.event_id !== "string") return false;
  if (typeof v.registry_state !== "string") return false;
  if (v.registry_state !== REGISTRY_STATES.REGISTERED) return false;
  return true;
}
