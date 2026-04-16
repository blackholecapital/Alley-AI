// Upstream authority: xyz-factory-system
// DOWNSTREAM STATUS: non-authoritative — operator / test summary adapter.
//
// WA P4.0 — aggregates N component ProofResults into one
// AggregateProofResult for the shell/operator reporting path.
//
// Aggregation rules (no logic invented):
//   * passed        = every component.passed
//   * failure_code  = first non-NONE failure_code in input order, or
//                     AGGREGATE_COMPONENT_FAILED if multiple fail and
//                     none of the individual codes dominates
//   * retryability  = worst-case of any failing component
//   * consumption_point = SHELL_OPERATOR_PATH unless caller overrides

import {
  PROOF_KINDS,
  CONSUMPTION_POINTS,
  FAILURE_CODES,
  RETRYABILITY,
  type AggregateProofResult,
  type ConsumptionPoint,
  type FailureCode,
  type ProofResult,
  type Retryability,
} from "./result-domain.js";

const STAGE_TAG = "FullBody | WA | P4.0";

function worstRetryability(components: readonly ProofResult[]): Retryability {
  // non_retryable > blocking > retryable. We walk the failing
  // components and keep the most severe.
  let worst: Retryability = RETRYABILITY.RETRYABLE;
  for (const c of components) {
    if (c.passed) continue;
    if (c.retryability === RETRYABILITY.NON_RETRYABLE) {
      return RETRYABILITY.NON_RETRYABLE;
    }
    if (c.retryability === RETRYABILITY.BLOCKING) {
      worst = RETRYABILITY.BLOCKING;
    }
  }
  return worst;
}

function firstFailureCode(components: readonly ProofResult[]): FailureCode {
  for (const c of components) {
    if (!c.passed && c.failure_code !== FAILURE_CODES.NONE) {
      return c.failure_code;
    }
  }
  return FAILURE_CODES.NONE;
}

export interface OperatorSummaryInputs {
  readonly components: readonly ProofResult[];
  readonly consumption_point?: ConsumptionPoint;
  readonly label?: string;
}

export function aggregateOperatorSummary(
  inputs: OperatorSummaryInputs,
): AggregateProofResult {
  const components = inputs.components;
  const consumption_point =
    inputs.consumption_point ?? CONSUMPTION_POINTS.SHELL_OPERATOR_PATH;
  const label = inputs.label ?? "operator-summary";

  const passCount = components.reduce(
    (n, c) => (c.passed ? n + 1 : n),
    0,
  );
  const passed = passCount === components.length && components.length > 0;

  const failingCount = components.length - passCount;
  const dominantFailure = firstFailureCode(components);

  const failure_code = passed
    ? FAILURE_CODES.NONE
    : failingCount > 1 && dominantFailure === FAILURE_CODES.NONE
      ? FAILURE_CODES.AGGREGATE_COMPONENT_FAILED
      : dominantFailure !== FAILURE_CODES.NONE
        ? dominantFailure
        : FAILURE_CODES.AGGREGATE_COMPONENT_FAILED;

  const retryability = passed
    ? RETRYABILITY.RETRYABLE
    : worstRetryability(components);

  const operator_summary = passed
    ? `${label}: ${passCount}/${components.length} components passed`
    : `${label}: ${passCount}/${components.length} components passed, ${failingCount} failing (first failure: ${failure_code})`;

  return {
    proof_kind: PROOF_KINDS.AGGREGATE,
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
    components,
  };
}
