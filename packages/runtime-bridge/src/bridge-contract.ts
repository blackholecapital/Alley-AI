// Runtime bridge contract
// DOWNSTREAM STATUS: non-authoritative — consumes declared contracts only
// No resolver authority — bridge is a pass-through only

import type { InstallStamp } from "../../contracts-core/src/chassis/install-stamp.contract.js";
import { STAMP_STATES } from "../../contracts-core/src/chassis/domain.js";

export interface RuntimeBridgeState {
  readonly install_stamp: InstallStamp;
  readonly stamped_output_present: boolean;
  readonly stamped_install_intake_present: boolean;
  readonly applied_install_record_present: boolean;
}

export function isBridgeActivatable(state: RuntimeBridgeState): boolean {
  return (
    state.install_stamp.stamp_state === STAMP_STATES.ISSUED &&
    state.stamped_output_present &&
    state.stamped_install_intake_present &&
    state.applied_install_record_present
  );
}
