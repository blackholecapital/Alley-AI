# Stage 6 Software — Stamped Install Intake
AUTHORITY: derived-execution-artifact (upstream constrained by xyz-factory-system/invariants/chassis/lifecycle/install.md)

## Install Path Position
- install_path_step: 2
- predecessor_artifact: xyz-factory-system/stage-6-software/resolver/resolver-output-and-install-stamp.md (stamped-output)
- successor_artifact: xyz-factory-system/stage-6-software/production/install/applied-install-record.md

## Intake Inputs (from resolver stamped-output)
- resolver_run_id: resolver.stage6.chassis.2026-04-08T00:00:00Z
- resolved_declaration_envelope_id: envelope.chassis.manifest.v1
- install_stamp_law_ref: xyz-factory-system/invariants/chassis/types/InstallStamp.contract.md
- stamp_state: issued
- resolver_state: resolved
- consistency_result: pass

## Intake State
- intake_id: intake.chassis.install.2026-04-08T00:00:00Z
- intake_state: accepted
- intake_source: resolver stamped-output
- stamp_binding_check: pass (resolver_run_id matches stamped-output)
- envelope_binding_check: pass (declaration_envelope_id matches stamped-output)

## No-Bypass Wording
- Intake may only be accepted from the resolver stamped-output.
- No Systems/output claim may bypass this intake step.
- No runtime, package, app, or downstream adapter may synthesize intake state on its own.
- Authority for intake derivation remains at xyz-factory-system/invariants/chassis/lifecycle/install.md.
