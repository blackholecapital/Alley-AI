// Upstream authority: xyz-factory-system/invariants/chassis/schemas/install-stamp.schema.md
// DOWNSTREAM STATUS: non-authoritative — no package-local schema authority

import type { InstallStamp, ResolverOutput } from "../../contracts-core/src/chassis/install-stamp.contract.js";
import {
  STAMP_STATES,
  RESOLVER_STATES,
  CONSISTENCY_RESULTS,
} from "../../contracts-core/src/chassis/domain.js";

export function isValidInstallStamp(value: unknown): value is InstallStamp {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.install_stamp_law_ref !== "string") return false;
  if (typeof v.resolver_run_id !== "string") return false;
  if (typeof v.stamp_state !== "string") return false;
  if (v.stamp_state !== STAMP_STATES.ISSUED) return false;
  return true;
}

export function isValidResolverOutput(value: unknown): value is ResolverOutput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.resolver_run_id !== "string") return false;
  if (typeof v.resolved_declaration_envelope_id !== "string") return false;
  if (!Array.isArray(v.resolved_registry_artifact_ids)) return false;
  for (const id of v.resolved_registry_artifact_ids) {
    if (typeof id !== "string") return false;
  }
  if (typeof v.resolver_state !== "string") return false;
  if (typeof v.consistency_result !== "string") return false;
  if (v.resolver_state !== RESOLVER_STATES.RESOLVED) return false;
  if (v.consistency_result !== CONSISTENCY_RESULTS.PASS) return false;
  return true;
}
