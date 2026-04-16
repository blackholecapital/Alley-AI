// Upstream authority: xyz-factory-system/invariants/chassis/types/Manifest.contract.md
// DOWNSTREAM STATUS: non-authoritative — derived from canonical contract only
//
// WA P1.1 NOTE — UNRESOLVED AUTHORITY DOMAIN
// The fields `declaration_scope`, `declaration_kind`, and `declaration_state`
// remain typed as `string` because the canonical authority has not enumerated
// their value sets. Placeholder symbols (`DECLARATION_SCOPES`, `DECLARATION_KINDS`,
// `DECLARATION_STATES`) exist in `./domain.ts` but are intentionally empty.
// Do NOT narrow these fields or import the placeholders for runtime checks
// until the canonical authority publishes values. Flag: needs foreman review.

export interface DeclarationEnvelope {
  readonly declaration_envelope_id: string;
  readonly manifest_law_ref: string;
  // unresolved-domain: declaration_scope (see WA P1.1 note above)
  readonly declaration_scope: string;
}

export interface Declaration {
  readonly declaration_id: string;
  // unresolved-domain: declaration_kind (see WA P1.1 note above)
  readonly declaration_kind: string;
  readonly subject_id: string;
  // unresolved-domain: declaration_state (see WA P1.1 note above)
  readonly declaration_state: string;
  readonly declared_member_module_ids?: readonly string[];
}

export interface Manifest {
  readonly envelope: DeclarationEnvelope;
  readonly declarations: readonly Declaration[];
}
