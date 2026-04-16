// Session activation gate
// DOWNSTREAM STATUS: non-authoritative
// Explicit install path (upstream-derived, read-only):
//   xyz-factory-system/stage-6-software/resolver/resolver-output-and-install-stamp.md (stamped-output)
//     -> xyz-factory-system/stage-6-software/production/install/stamped-install-intake.md
//     -> xyz-factory-system/stage-6-software/production/install/applied-install-record.md
//     -> runtime activation
// No activation path without all three artifacts present and bound
// No resolver authority inside runtime; runtime creates no authority
// No Systems/output claim may bypass the explicit install path

import type { InstallStamp, ResolverOutput } from "../../../../packages/contracts-core/src/chassis/install-stamp.contract.js";
import {
  RESOLVER_STATES,
  CONSISTENCY_RESULTS,
  STAMP_STATES,
} from "../../../../packages/contracts-core/src/chassis/domain.js";

export interface ActivationGateInputs {
  readonly resolverOutput: ResolverOutput;
  readonly installStamp: InstallStamp;
  readonly stampedOutputPresent: boolean;
  readonly stampedInstallIntakePresent: boolean;
  readonly appliedInstallRecordPresent: boolean;
}

export function isActivationEligible(inputs: ActivationGateInputs): boolean {
  return (
    inputs.stampedOutputPresent &&
    inputs.stampedInstallIntakePresent &&
    inputs.appliedInstallRecordPresent &&
    inputs.resolverOutput.resolver_state === RESOLVER_STATES.RESOLVED &&
    inputs.resolverOutput.consistency_result === CONSISTENCY_RESULTS.PASS &&
    inputs.installStamp.stamp_state === STAMP_STATES.ISSUED &&
    inputs.installStamp.resolver_run_id === inputs.resolverOutput.resolver_run_id
  );
}
