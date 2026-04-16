# Stage 6 Software — Manifest Declaration Envelope Instance
AUTHORITY: derived-execution-artifact (upstream constrained by xyz-factory-system/invariants/chassis/schemas/manifest.schema.md)

## Declaration Envelope
- declaration_envelope_id: envelope.chassis.manifest.v1
- manifest_law_ref: xyz-factory-system/invariants/chassis/types/Manifest.contract.md
- declaration_scope: stage-6-software

## Declarations
- declaration_id: dec.manifest.chassis.module.v1
  declaration_kind: module
  subject_id: mod.chassis.core
  declaration_state: declared

- declaration_id: dec.manifest.chassis.composition.v1
  declaration_kind: composition
  subject_id: comp.factory.chassis.v1
  declared_member_module_ids:
    - mod.chassis.core
  declaration_state: declared
