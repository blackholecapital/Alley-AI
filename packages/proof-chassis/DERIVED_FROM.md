# DERIVED_FROM
UPSTREAM AUTHORITY ROOT: xyz-factory-system/
DOWNSTREAM STATUS: non-authoritative
ONE-WAY AUTHORITY: upstream only

GOVERNING CANONICAL FILES:
- xyz-factory-system/invariants/chassis/types/InstallStamp.contract.md
- xyz-factory-system/invariants/chassis/types/Event.contract.md
- xyz-factory-system/invariants/chassis/types/Route.contract.md
- xyz-factory-system/invariants/chassis/types/Surface.contract.md
- xyz-factory-system/invariants/chassis/types/Touchpoint.contract.md
- xyz-factory-system/invariants/chassis/lifecycle/install.md
- xyz-factory-system/invariants/chassis/lifecycle/disable.md
- xyz-factory-system/invariants/chassis/lifecycle/update.md
- xyz-factory-system/invariants/chassis/lifecycle/remove.md

STAGE: WA P4.0 — proof path binding layer (adapters only)

NOTES:
- proof-chassis is a binding layer. It consumes existing boolean gates
  (schema validators, profile compatibility lookups, lifecycle/bridge
  helpers, activation-gate) and translates their results into a single
  structured ProofResult shape for operator/test surfacing.
- No lifecycle fork, no install-law fork, no runtime authority shift.
- No adapter in this package may re-implement a gate, narrow a chassis
  type, or invent a profile value. Adapters only WRAP existing results.
- proof-chassis does not import from schema-chassis. Validation adapters
  accept a predicate result (boolean) from the caller; this avoids
  binding to WB-owned schema logic.
- Mobile / PC profile buckets remain unresolved (WA P3.0). The
  compatibility adapter returns "unresolved" for empty-bucket derived
  profiles — it does NOT infer "blocked".
- Manifest fields declaration_kind / declaration_state / declaration_scope
  remain unresolved (WA P1.1). Validators of those fields must continue
  to rely on `typeof === "string"`; the adapter surfaces an
  unmapped_domain flag when those fields are involved.
