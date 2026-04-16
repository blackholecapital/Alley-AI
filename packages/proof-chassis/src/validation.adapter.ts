// Upstream authority: xyz-factory-system
// DOWNSTREAM STATUS: non-authoritative — validation result adapter only.
//
// WA P4.0 — wraps a schema-chassis validator *result* (boolean) into a
// structured ProofResult. This module deliberately does NOT import from
// schema-chassis: validators are WB territory, and this adapter must
// remain a pure binding layer that takes the already-computed boolean.
//
// Usage pattern (callsite, not implemented here):
//
//   import { isValidEvent } from "<...>/schema-chassis/...";
//   import { adaptValidationResult } from "<...>/proof-chassis/...";
//
//   const ok = isValidEvent(value);
//   const result = adaptValidationResult({
//     target_name: "Event",
//     passed: ok,
//     consumption_point: CONSUMPTION_POINTS.TOUCHPOINT_LAYER,
//   });

import {
  PROOF_KINDS,
  FAILURE_CODES,
  RETRYABILITY,
  type ConsumptionPoint,
  type ProofResult,
} from "./result-domain.js";

const STAGE_TAG = "FullBody | WA | P4.0";

export interface ValidationAdapterInputs {
  readonly target_name: string;
  readonly passed: boolean;
  readonly consumption_point: ConsumptionPoint;
  /**
   * Set to true when the validator targets a field whose domain is
   * still unresolved (e.g. declaration_kind / declaration_state /
   * declaration_scope). When true, a passed=false result is surfaced
   * as unmapped_domain rather than schema_invalid so the operator path
   * can distinguish "wrong value" from "canonical authority has not
   * published values yet".
   */
  readonly unresolved_domain?: boolean;
}

export function adaptValidationResult(
  inputs: ValidationAdapterInputs,
): ProofResult {
  const { target_name, passed, consumption_point, unresolved_domain } = inputs;

  const failure_code = passed
    ? FAILURE_CODES.NONE
    : unresolved_domain === true
      ? FAILURE_CODES.UNMAPPED_DOMAIN
      : FAILURE_CODES.SCHEMA_INVALID;

  const retryability = passed
    ? RETRYABILITY.RETRYABLE
    : unresolved_domain === true
      ? RETRYABILITY.BLOCKING
      : RETRYABILITY.NON_RETRYABLE;

  const operator_summary = passed
    ? `validation[${target_name}] passed`
    : unresolved_domain === true
      ? `validation[${target_name}] unresolved — needs foreman review`
      : `validation[${target_name}] failed schema check`;

  return {
    proof_kind: PROOF_KINDS.VALIDATION,
    consumption_point,
    passed,
    retryability,
    failure_code,
    operator_summary,
    diagnostic: {
      expected_tag: STAGE_TAG,
      actual_tag: STAGE_TAG,
      stage: "P4.0",
      consumption_point,
    },
  };
}
