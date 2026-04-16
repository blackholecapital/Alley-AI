# Stage 6 Software — Structure Bindings Instance (Execution Support)
AUTHORITY: derived-execution-artifact (upstream constrained by xyz-factory-system/invariants/chassis)

## Execution Support Bindings
- binding_id: bind.chassis.install
  touchpoint_id: tp.cli.install
  surface_id: sf.cli.factory
  trigger_id: trg.chassis.install
  route_id: rt.chassis.install
  request_event_id: evt.chassis.install.requested
  completion_event_id: evt.chassis.install.completed
  failure_event_id: evt.chassis.install.failed

- binding_id: bind.chassis.update
  touchpoint_id: tp.cli.update
  surface_id: sf.cli.factory
  trigger_id: trg.chassis.update
  route_id: rt.chassis.update
  request_event_id: evt.chassis.update.requested
  completion_event_id: evt.chassis.update.completed
  failure_event_id: evt.chassis.update.failed

- binding_id: bind.chassis.disable
  touchpoint_id: tp.api.disable
  surface_id: sf.api.factory
  trigger_id: trg.chassis.disable
  route_id: rt.chassis.disable
  request_event_id: evt.chassis.disable.requested
  completion_event_id: evt.chassis.disable.completed
  failure_event_id: evt.chassis.disable.failed

- binding_id: bind.chassis.remove
  touchpoint_id: tp.api.remove
  surface_id: sf.api.factory
  trigger_id: trg.chassis.remove
  route_id: rt.chassis.remove
  request_event_id: evt.chassis.remove.requested
  completion_event_id: evt.chassis.remove.completed
  failure_event_id: evt.chassis.remove.failed

## Failure Event Registry Backing
- binding_id: bind.chassis.install
  failure_event_id: evt.chassis.install.failed
  registry_backing: event-registry.instance.md

- binding_id: bind.chassis.update
  failure_event_id: evt.chassis.update.failed
  registry_backing: event-registry.instance.md

- binding_id: bind.chassis.disable
  failure_event_id: evt.chassis.disable.failed
  registry_backing: event-registry.instance.md

- binding_id: bind.chassis.remove
  failure_event_id: evt.chassis.remove.failed
  registry_backing: event-registry.instance.md

## Canonical Backing Checks
- All manifest claims resolve through: module-composition.manifest.instance.md
- All module claims resolve through: module-registry.instance.md
- All surface claims resolve through: surface-registry.instance.md
- All trigger claims resolve through: trigger-registry.instance.md
- All route claims resolve through: route-registry.instance.md
- All event claims resolve through: event-registry.instance.md
- Installation support claims resolve through the explicit install path only:
  resolver-output-and-install-stamp.md (stamped-output)
    → production/install/stamped-install-intake.md
    → production/install/applied-install-record.md
    → runtime activation
- Registry authority is held only by xyz-factory-system/invariants/chassis/registry/*; instance files are derived-execution-artifacts with no authoritative registration power.
- Interaction claims are registry-mediated only; no direct-coupling semantics.
- No non-registry mediation claims are asserted.

## No-Bypass Wording
- No Systems/output claim may bypass the explicit install path.
- No runtime, package, app, or downstream adapter creates authority; all authority is upstream canonical only.
- Downstream adapters are implementation-only and may only exist when they map to a canonical adapter class declared under xyz-factory-system/invariants/policies/adapter-policy.md.
