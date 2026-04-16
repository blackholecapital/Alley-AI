# DERIVED_FROM
UPSTREAM AUTHORITY ROOT: xyz-factory-system/
DOWNSTREAM STATUS: non-authoritative
ONE-WAY AUTHORITY: upstream only

GOVERNING CANONICAL FILES:
- xyz-factory-system/invariants/chassis/registry/module-registry.md
- xyz-factory-system/invariants/chassis/registry/event-registry.md
- xyz-factory-system/invariants/chassis/registry/route-registry.md
- xyz-factory-system/invariants/chassis/registry/trigger-registry.md
- xyz-factory-system/invariants/chassis/registry/surface-registry.md

NOTES:
- Registry authority is held only under xyz-factory-system/invariants/chassis/registry/*.
- This package provides access/lookup only; it does not register, approve, or create registry authority.
- Package code creates no authority and may not bypass the explicit install path.
