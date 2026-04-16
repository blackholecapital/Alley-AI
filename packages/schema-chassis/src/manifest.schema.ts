// Upstream authority: xyz-factory-system/invariants/chassis/schemas/manifest.schema.md
// DOWNSTREAM STATUS: non-authoritative — no package-local schema authority

import type { DeclarationEnvelope, Declaration, Manifest } from "../../contracts-core/src/chassis/manifest.contract.js";

export function isValidDeclarationEnvelope(value: unknown): value is DeclarationEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.declaration_envelope_id === "string" &&
    typeof v.manifest_law_ref === "string" &&
    typeof v.declaration_scope === "string"
  );
}

export function isValidDeclaration(value: unknown): value is Declaration {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.declaration_id === "string" &&
    typeof v.declaration_kind === "string" &&
    typeof v.subject_id === "string" &&
    typeof v.declaration_state === "string"
  );
}

export function isValidManifest(value: unknown): value is Manifest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isValidDeclarationEnvelope(v.envelope) &&
    Array.isArray(v.declarations) &&
    v.declarations.every(isValidDeclaration)
  );
}
