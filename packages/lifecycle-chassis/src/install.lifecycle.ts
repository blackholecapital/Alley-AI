// Upstream authority: xyz-factory-system/invariants/chassis/lifecycle/install.md
// DOWNSTREAM STATUS: non-authoritative — lifecycle helpers only, no approval authority

import type { InstallStamp, ResolverOutput } from "../../contracts-core/src/chassis/install-stamp.contract.js";
import {
  RESOLVER_STATES,
  CONSISTENCY_RESULTS,
  STAMP_STATES,
} from "../../contracts-core/src/chassis/domain.js";

export interface InstallCoverageInputs {
  readonly resolverOutput: ResolverOutput;
  readonly installStamp: InstallStamp;
}

export function hasStampCoverage(inputs: InstallCoverageInputs): boolean {
  return (
    inputs.resolverOutput.resolver_state === RESOLVER_STATES.RESOLVED &&
    inputs.resolverOutput.consistency_result === CONSISTENCY_RESULTS.PASS &&
    inputs.installStamp.stamp_state === STAMP_STATES.ISSUED &&
    inputs.installStamp.resolver_run_id === inputs.resolverOutput.resolver_run_id
  );
}
