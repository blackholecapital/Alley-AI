// Upstream authority: xyz-factory-system
// DOWNSTREAM STATUS: non-authoritative — proof path binding layer only.
//
// WA P4.0 — structured result shape for proof adapters.
//
// This file defines one canonical ProofResult + AggregateProofResult
// shape that every adapter in proof-chassis produces. Nothing in this
// file executes logic against the chassis. It is a types-and-constants
// module only.
//
// Design rules (binding-only):
//   * no lifecycle fork
//   * no install-law fork
//   * no profile authority shift
//   * no Mobile / PC population guess
//   * no destructive app rewrite
//   * no re-implementation of an existing gate

// === Proof kind ===
// Which flavour of gate was evaluated. One kind per adapter module,
// plus one aggregate kind for operator-summary rollups.
export const PROOF_KINDS = {
  VALIDATION: "proof.validation",
  COMPATIBILITY: "proof.compatibility",
  INSTALL_CHAIN: "proof.install_chain",
  AGGREGATE: "proof.aggregate",
} as const;
export type ProofKind = (typeof PROOF_KINDS)[keyof typeof PROOF_KINDS];

// === Consumption point ===
// Where in the stack the result is intended to surface. Adapters tag
// every result with the point they were called from so the operator
// path can route the summary cleanly.
export const CONSUMPTION_POINTS = {
  ROUTE_LAYER: "consume.route",
  TOUCHPOINT_LAYER: "consume.touchpoint",
  BRIDGE_GATE_LAYER: "consume.bridge_gate",
  SHELL_OPERATOR_PATH: "consume.shell_operator",
} as const;
export type ConsumptionPoint =
  (typeof CONSUMPTION_POINTS)[keyof typeof CONSUMPTION_POINTS];

// === Failure codes ===
// Finite closed set. New codes MUST be added here first; adapters may
// not invent free-form failure strings.
export const FAILURE_CODES = {
  NONE: "none",
  SCHEMA_INVALID: "schema_invalid",
  COMPATIBILITY_UNRESOLVED: "compatibility_unresolved",
  COMPATIBILITY_BLOCKED: "compatibility_blocked",
  COMPATIBILITY_OPTIONAL_NOT_YET_ELIGIBLE: "compatibility_optional_not_yet_eligible",
  INSTALL_CHAIN_INCOMPLETE: "install_chain_incomplete",
  UNMAPPED_DOMAIN: "unmapped_domain",
  AGGREGATE_COMPONENT_FAILED: "aggregate_component_failed",
} as const;
export type FailureCode = (typeof FAILURE_CODES)[keyof typeof FAILURE_CODES];

// === Retryability classes ===
// Describes operator recourse for a non-passing result.
//   retryable      — retry may succeed without foreman intervention
//   blocking       — cannot pass until foreman unblocks an authority decision
//   non_retryable  — input is permanently wrong; callsite must be fixed
export const RETRYABILITY = {
  RETRYABLE: "retryable",
  BLOCKING: "blocking",
  NON_RETRYABLE: "non_retryable",
} as const;
export type Retryability = (typeof RETRYABILITY)[keyof typeof RETRYABILITY];

// === Diagnostic tag packet ===
// Carried on every ProofResult. The expected/actual tags mirror the
// foreman stage tag format used throughout WA so the operator shell
// can correlate results with stage work.
export interface DiagnosticTagPacket {
  readonly expected_tag: string;
  readonly actual_tag: string;
  readonly stage: string;
  readonly consumption_point: ConsumptionPoint;
}

// === Proof result ===
// One structured result per gate evaluation. Adapters return this
// shape; they do not log, throw, or call back into the chassis.
export interface ProofResult {
  readonly proof_kind: ProofKind;
  readonly consumption_point: ConsumptionPoint;
  readonly passed: boolean;
  readonly retryability: Retryability;
  readonly failure_code: FailureCode;
  readonly operator_summary: string;
  readonly diagnostic: DiagnosticTagPacket;
}

// === Aggregate proof result ===
// Operator-summary rollup of N component ProofResults. Passes only if
// every component passes. Carries the worst-case retryability of any
// failing component and the first non-NONE failure code encountered
// (deterministic by input order).
export interface AggregateProofResult {
  readonly proof_kind: typeof PROOF_KINDS.AGGREGATE;
  readonly consumption_point: ConsumptionPoint;
  readonly passed: boolean;
  readonly retryability: Retryability;
  readonly failure_code: FailureCode;
  readonly operator_summary: string;
  readonly diagnostic: DiagnosticTagPacket;
  readonly components: readonly ProofResult[];
}

// =============================================================================
// FREEZE-PROOF TARGETS (WA P4.0 note — for later pass, not this one)
// =============================================================================
//
// Required testable gates BEFORE V2 freeze:
//
//   1. validation gate
//        * every registry entry passes its schema-chassis validator
//        * every touchpoint event ref resolves to a registered event
//          (EventId → registry lookup)
//        * diagnostic: schema_invalid on failure
//
//   2. compatibility gate
//        * every Full Body registered id is present in
//          FULL_BODY_PROFILE.allowed (map-vs-registry parity)
//        * every derived profile is still a strict subset of
//          FULL_BODY_PROFILE.allowed (zero non-subset ids)
//        * diagnostic: compatibility_unresolved for empty derived,
//          compatibility_blocked for a non-subset drift
//
//   3. install-chain gate
//        * hasStampCoverage(inputs) == true
//        * isBridgeActivatable(state) == true
//        * isBridgeReady(config) == true
//        * isActivationEligible(inputs) == true
//        * diagnostic: first failing clause as failure_code
//
//   4. operator-summary gate
//        * the aggregate of (1) + (2) + (3) passes
//        * consumption point: SHELL_OPERATOR_PATH
//        * diagnostic: aggregate_component_failed on any failing component
//
// UNRESOLVED items still blocked (must remain blocked through P4.0):
//
//   * Mobile / PC profile bucket population (WA P3.0 unresolved)
//   * declaration_kind / declaration_state / declaration_scope narrowing
//     (WA P1.1 unresolved manifest fields)
//   * any runtime authority migration away from the explicit install path
//   * any non-additive change to schema-chassis (WB territory)
//
// ADDITIVE ADAPTER PATH FOR STAGED ROLLOUT:
//
//   stage 1 (this pass)   — add proof-chassis package, adapters only,
//                           no call sites wired up
//   stage 2 (WB P4.prep)  — WB may inventory existing validators and
//                           expose hooks that feed the validation
//                           adapter boolean input
//   stage 3 (WA P4.1)     — wire the install-chain adapter into the
//                           bridge/runtime gate layer at a SINGLE
//                           non-authoritative call site; do not replace
//                           any existing boolean-returning helper
//   stage 4 (WA P4.2)     — wire the compatibility adapter to read
//                           PROFILE_COMPATIBILITY_MAP; expose through
//                           the operator-summary aggregator
//   stage 5 (FM V2 freeze) — gate the four "required testable gates"
//                           above; reject freeze if any returns
//                           passed=false
