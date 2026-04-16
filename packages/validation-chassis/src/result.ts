// Structured validation result
// DOWNSTREAM STATUS: non-authoritative — shape only, no authority encoded here.
//
// The shape was drafted in worker-wb/p2-prep/validation-prep.md (FullBody | WB | P2.prep)
// and is finalized here for FullBody | WB | P2.1.
//
// Field names are stable. The `failure_code` vocabulary is staged in
// ./failure-codes.ts and remains intentionally narrow until the canonical
// failure-code domain is published by an upstream authority.

/** Outcome of a single validator invocation. Closed set. */
export type ValidationOutcome = "pass" | "fail" | "skipped";

export interface ValidationResult {
  /** Stable id of the validator producing the result. */
  readonly validator_id: string;

  /** What kind of artifact was validated. */
  readonly target_type: string;

  /** Id of the specific artifact validated, when one exists. */
  readonly target_id: string | null;

  /** Outcome. */
  readonly result: ValidationOutcome;

  /** Stable machine code when result === "fail"; null otherwise. */
  readonly failure_code: string | null;

  /** Whether the caller may retry the same validation without remediation. */
  readonly retryable: boolean;

  /** Whether a fail must halt the enclosing operation (vs. warn-only). */
  readonly blocking: boolean;

  /** Free-form operator-readable diagnostic. Never used for control flow. */
  readonly notes: string | null;
}

export interface PassInputs {
  readonly validator_id: string;
  readonly target_type: string;
  readonly target_id: string | null;
  readonly notes?: string | null;
}

export interface FailInputs {
  readonly validator_id: string;
  readonly target_type: string;
  readonly target_id: string | null;
  readonly failure_code: string;
  readonly retryable?: boolean;
  readonly blocking?: boolean;
  readonly notes?: string | null;
}

export interface SkipInputs {
  readonly validator_id: string;
  readonly target_type: string;
  readonly target_id: string | null;
  readonly notes: string;
}

export function pass(inputs: PassInputs): ValidationResult {
  return {
    validator_id: inputs.validator_id,
    target_type: inputs.target_type,
    target_id: inputs.target_id,
    result: "pass",
    failure_code: null,
    retryable: false,
    blocking: false,
    notes: inputs.notes ?? null,
  };
}

export function fail(inputs: FailInputs): ValidationResult {
  return {
    validator_id: inputs.validator_id,
    target_type: inputs.target_type,
    target_id: inputs.target_id,
    result: "fail",
    failure_code: inputs.failure_code,
    retryable: inputs.retryable ?? false,
    blocking: inputs.blocking ?? true,
    notes: inputs.notes ?? null,
  };
}

export function skipped(inputs: SkipInputs): ValidationResult {
  return {
    validator_id: inputs.validator_id,
    target_type: inputs.target_type,
    target_id: inputs.target_id,
    result: "skipped",
    failure_code: null,
    retryable: false,
    blocking: false,
    notes: inputs.notes,
  };
}

/** Predicate sugar for callers that still need a boolean. */
export function isPass(result: ValidationResult): boolean {
  return result.result === "pass";
}

/** Returns the first non-pass result, or null if all pass. */
export function firstFailure(results: readonly ValidationResult[]): ValidationResult | null {
  for (const r of results) {
    if (r.result !== "pass") return r;
  }
  return null;
}

/** True when every result in the batch is a pass. */
export function allPass(results: readonly ValidationResult[]): boolean {
  return firstFailure(results) === null;
}
