# Stage 6 Software — Resolver Stamped-Output
AUTHORITY: derived-execution-artifact (upstream constrained by xyz-factory-system/invariants/chassis/lifecycle/install.md)

## Install Path Position
- install_path_step: 1
- artifact_kind: resolver stamped-output
- successor_artifact: xyz-factory-system/stage-6-software/production/install/stamped-install-intake.md
- full_install_path: resolver stamped-output → production/install/stamped-install-intake.md → production/install/applied-install-record.md → runtime activation

## Resolver Output (stamped-output body)
- resolver_run_id: resolver.stage6.chassis.2026-04-08T00:00:00Z
- resolved_declaration_envelope_id: envelope.chassis.manifest.v1
- resolved_registry_artifact_ids:
  - module-registry.instance.md
  - route-registry.instance.md
  - surface-registry.instance.md
  - trigger-registry.instance.md
  - event-registry.instance.md
- resolver_state: resolved
- consistency_result: pass

## InstallStamp (bound to stamped-output)
- install_stamp_law_ref: xyz-factory-system/invariants/chassis/types/InstallStamp.contract.md
- resolver_run_id: resolver.stage6.chassis.2026-04-08T00:00:00Z
- stamp_state: issued

## No-Bypass Wording
- The stamped-output is the only lawful origin of the install path.
- No Systems/output claim may bypass the explicit install path.
- No runtime, package, app, or downstream adapter may synthesize, amend, or re-derive the stamped-output.
- Downstream artifacts (stamped-install-intake, applied-install-record, runtime activation) derive from this stamped-output only; they never create authority of their own.
- Registry authority remains exclusively under xyz-factory-system/invariants/chassis/registry/*.
- Lifecycle authority remains exclusively under xyz-factory-system/invariants/chassis/lifecycle/*.
