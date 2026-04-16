# Stage 6 Software — Applied Install Record
AUTHORITY: derived-execution-artifact (upstream constrained by xyz-factory-system/invariants/chassis/lifecycle/install.md)

## Install Path Position
- install_path_step: 3
- predecessor_artifact: xyz-factory-system/stage-6-software/production/install/stamped-install-intake.md
- successor_artifact: runtime activation (gated, non-authoritative)

## Apply Inputs (from stamped-install-intake)
- intake_id: intake.chassis.install.2026-04-08T00:00:00Z
- intake_state: accepted
- resolver_run_id: resolver.stage6.chassis.2026-04-08T00:00:00Z
- resolved_declaration_envelope_id: envelope.chassis.manifest.v1
- install_stamp_law_ref: xyz-factory-system/invariants/chassis/types/InstallStamp.contract.md
- stamp_state: issued

## Applied Record
- record_id: record.chassis.install.2026-04-08T00:00:00Z
- record_state: applied
- applied_module_ids:
  - mod.chassis.core
- applied_registry_artifact_ids:
  - module-registry.instance.md
  - route-registry.instance.md
  - surface-registry.instance.md
  - trigger-registry.instance.md
  - event-registry.instance.md
- intake_binding_check: pass (intake_id matches stamped-install-intake)
- stamp_binding_check: pass (resolver_run_id matches stamped-output)
- runtime_activation_gate: eligible

## No-Bypass Wording
- The applied install record may only be produced from the accepted stamped-install-intake.
- No Systems/output claim may bypass this apply step.
- Runtime activation may only read this record; it may not create or amend it.
- No runtime, package, app, or downstream adapter creates authority here.
- Authority for apply derivation remains at xyz-factory-system/invariants/chassis/lifecycle/install.md.
