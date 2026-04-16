// Local-host runtime bridge
// DOWNSTREAM STATUS: non-authoritative — bridge only, no resolver authority
// Bridge connects local-host to core-runtime after stamp-bound production install conditions are met

import type { InstallStamp } from "../../../../packages/contracts-core/src/chassis/install-stamp.contract.js";
import { STAMP_STATES } from "../../../../packages/contracts-core/src/chassis/domain.js";

export interface BridgeConfig {
  readonly install_stamp: InstallStamp;
  readonly production_install_verified: boolean;
}

export function isBridgeReady(config: BridgeConfig): boolean {
  return (
    config.install_stamp.stamp_state === STAMP_STATES.ISSUED &&
    config.production_install_verified
  );
}
