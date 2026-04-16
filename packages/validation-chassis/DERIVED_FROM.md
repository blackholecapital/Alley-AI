# validation-chassis — DERIVED_FROM

DOWNSTREAM STATUS: non-authoritative — validation helpers only.

This package contains structured validators that:
- consume contract types and typed domains from `packages/contracts-core` (WA-owned)
- consume the existing shape predicates from `packages/schema-chassis`
- consume the read-only registry lookups from `packages/registry-chassis`
- consume the lifecycle eligibility helpers from `packages/lifecycle-chassis`
- consume the install-chain readiness helpers from `packages/runtime-bridge`,
  `apps/core-runtime/src/session`, `apps/local-host/src/bridge`,
  `packages/session-transport`, `apps/local-host/src/transport`

It introduces NO new authority and binds NO unresolved manifest fields
(`declaration_kind`, `declaration_state`, `declaration_scope`). It does not
narrow placeholders from `contracts-core/chassis/domain.ts` whose value sets
are empty (`DECLARATION_KINDS`, `DECLARATION_STATES`, `DECLARATION_SCOPES`).

Upstream authority for validation rules:
- xyz-factory-system/invariants/chassis/registry/*
- xyz-factory-system/invariants/chassis/lifecycle/*
- xyz-factory-system/stage-6-software/resolver/*
- xyz-factory-system/stage-6-software/production/install/*

Created at FullBody | WB | P2.1 (validation hardening, first implementation pass).
