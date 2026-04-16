// Barrel export — packages/proof-chassis
// DOWNSTREAM STATUS: non-authoritative — proof path binding layer only

export {
  PROOF_KINDS,
  CONSUMPTION_POINTS,
  FAILURE_CODES,
  RETRYABILITY,
} from "./result-domain.js";
export type {
  ProofKind,
  ConsumptionPoint,
  FailureCode,
  Retryability,
  DiagnosticTagPacket,
  ProofResult,
  AggregateProofResult,
} from "./result-domain.js";

export { adaptValidationResult } from "./validation.adapter.js";
export type { ValidationAdapterInputs } from "./validation.adapter.js";

export {
  COMPATIBILITY_BUCKETS,
  COMPATIBILITY_KINDS,
  classifyCompatibility,
  adaptCompatibilityResult,
} from "./compatibility.adapter.js";
export type {
  CompatibilityBucket,
  CompatibilityKind,
  CompatibilityAdapterInputs,
} from "./compatibility.adapter.js";

export {
  INSTALL_CHAIN_GATES,
  adaptInstallChainResult,
} from "./install-chain.adapter.js";
export type {
  InstallChainGateName,
  InstallChainGateOutcome,
  InstallChainAdapterInputs,
} from "./install-chain.adapter.js";

export { aggregateOperatorSummary } from "./operator-summary.adapter.js";
export type { OperatorSummaryInputs } from "./operator-summary.adapter.js";

export { CONSUMPTION_MAP } from "./consumption-map.js";
export type { ConsumptionBinding } from "./consumption-map.js";
