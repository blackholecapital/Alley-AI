// Upstream authority: xyz-factory-system/invariants/policies/chassis-policy.md
// DOWNSTREAM STATUS: non-authoritative — mirror only, no reinterpretation

export const CHASSIS_POLICY = {
  authority_root: "xyz-factory-system/invariants/chassis",
  downstream_status: "non-authoritative",
  one_way_authority: "upstream only",
  registry_ownership: "canonical only",
  lifecycle_approval: "canonical only",
  resolver_boundary: "canonical only",
  shell_authority: "canonical only",
} as const;
