# DERIVED_FROM
UPSTREAM AUTHORITY ROOT: xyz-factory-system/
DOWNSTREAM STATUS: non-authoritative
ONE-WAY AUTHORITY: upstream only

GOVERNING CANONICAL FILES:
- xyz-factory-system/invariants/chassis/types/InstallStamp.contract.md
- xyz-factory-system/invariants/chassis/lifecycle/install.md
- xyz-factory-system/invariants/chassis/types/Touchpoint.contract.md

EXPLICIT INSTALL PATH (read-only, upstream-derived):
- xyz-factory-system/stage-6-software/resolver/resolver-output-and-install-stamp.md (stamped-output)
- xyz-factory-system/stage-6-software/production/install/stamped-install-intake.md
- xyz-factory-system/stage-6-software/production/install/applied-install-record.md
- runtime activation (gated, non-authoritative)

NOTES:
- Session transport is non-authoritative and creates no authority.
- Session logic is separate from resolver authority; transport never synthesizes install path artifacts.
- Transport requires the full explicit install path to be bound and runtime activation to be eligible.
- No Systems/output claim may bypass the explicit install path.
