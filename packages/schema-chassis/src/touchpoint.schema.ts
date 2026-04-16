// Upstream authority: xyz-factory-system/invariants/chassis/schemas/touchpoint.schema.md
// DOWNSTREAM STATUS: non-authoritative — no package-local schema authority

import type { Touchpoint } from "../../contracts-core/src/chassis/touchpoint.contract.js";

export function isValidTouchpoint(value: unknown): value is Touchpoint {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.touchpoint_id !== "string") return false;
  if (typeof v.surface_id !== "string") return false;
  // touchpoint_id and surface_id id-domain membership is enforced by the
  // structured validator in packages/validation-chassis/schema.validator.ts.
  // The shape predicate intentionally does not narrow id values so that
  // unknown ids fail with a structured id_domain_violation rather than a
  // generic shape_invalid.
  return true;
}
