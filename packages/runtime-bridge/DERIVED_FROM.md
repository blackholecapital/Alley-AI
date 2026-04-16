# DERIVED_FROM
UPSTREAM AUTHORITY ROOT: xyz-factory-system/
DOWNSTREAM STATUS: non-authoritative
ONE-WAY AUTHORITY: upstream only

GOVERNING CANONICAL FILES:
- xyz-factory-system/invariants/chassis/types/InstallStamp.contract.md
- xyz-factory-system/invariants/chassis/lifecycle/install.md

EXPLICIT INSTALL PATH (read-only, upstream-derived):
- xyz-factory-system/stage-6-software/resolver/resolver-output-and-install-stamp.md (stamped-output)
- xyz-factory-system/stage-6-software/production/install/stamped-install-intake.md
- xyz-factory-system/stage-6-software/production/install/applied-install-record.md
- runtime activation (gated, non-authoritative)

NOTES:
- Runtime bridge is a pass-through only.
- No resolver authority inside bridge; the bridge does not create, amend, or synthesize any install path artifact.
- Activation requires the explicit install path in full: stamped-output → stamped-install-intake → applied-install-record → runtime activation.
- No Systems/output claim may bypass the explicit install path.
- The bridge creates no authority; all authority remains upstream canonical only.
