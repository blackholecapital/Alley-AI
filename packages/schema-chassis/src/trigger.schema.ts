// Upstream authority: xyz-factory-system/invariants/chassis/schemas/trigger.schema.md
// DOWNSTREAM STATUS: non-authoritative — no package-local schema authority

import type { Trigger } from "../../contracts-core/src/chassis/trigger.contract.js";
import { REGISTRY_STATES } from "../../contracts-core/src/chassis/domain.js";

export function isValidTrigger(value: unknown): value is Trigger {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.trigger_id !== "string") return false;
  if (typeof v.registry_state !== "string") return false;
  if (v.registry_state !== REGISTRY_STATES.REGISTERED) return false;
  return true;
}
