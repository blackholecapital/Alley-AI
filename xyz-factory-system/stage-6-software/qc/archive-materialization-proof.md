# Stage 6 Software — Archive Materialization Proof
AUTHORITY: derived-execution-artifact (upstream constrained by xyz-factory-system/invariants/policies)

- archive_root: /workspace/In_xyz_we_trust
- packaging_scope: repository-root
- path_nesting_check: pass (all required files resolve from archive root using canonical paths)
- inspectable_body_check: pass (all required files non-empty and readable)
- stale_copy_check: pass (active Stage 6 copies match corrected canonicalized versions)
- failure_path_inspection_check: pass (install/update/disable/remove each expose declared failure event ids)
- install_path_explicitness_check: pass (resolver stamped-output → production/install/stamped-install-intake.md → production/install/applied-install-record.md → runtime activation)

## Required Inspectable Files (confirmed)
- xyz-factory-system/stage-6-software/manifests/module-composition.manifest.instance.md
- xyz-factory-system/stage-6-software/registries/module-registry.instance.md
- xyz-factory-system/stage-6-software/registries/route-registry.instance.md
- xyz-factory-system/stage-6-software/registries/surface-registry.instance.md
- xyz-factory-system/stage-6-software/registries/trigger-registry.instance.md
- xyz-factory-system/stage-6-software/registries/event-registry.instance.md
- xyz-factory-system/stage-6-software/resolver/resolver-output-and-install-stamp.md
- xyz-factory-system/stage-6-software/production/install/stamped-install-intake.md
- xyz-factory-system/stage-6-software/production/install/applied-install-record.md
- xyz-factory-system/stage-6-software/bindings/structure-bindings.instance.md
