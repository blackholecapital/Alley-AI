// Upstream authority: xyz-factory-system/invariants/policies/adapter-policy.md
// DOWNSTREAM STATUS: non-authoritative — mirror only, no reinterpretation
// Downstream adapters are implementation-only and may only exist when they
// map to a canonical adapter class declared under the upstream authority root.

export const ADAPTER_POLICY = {
  authority_root: "xyz-factory-system/invariants/policies/adapter-policy.md",
  downstream_status: "non-authoritative",
  adapter_class_approval: "canonical only",
  runtime_adapter_creation: "not permitted without canonical family",
  downstream_adapter_kind: "implementation-only",
  canonical_adapter_class_mapping_required: true,
} as const;
