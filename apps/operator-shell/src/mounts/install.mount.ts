// Mount: install touchpoint on sf.cli.factory
// DOWNSTREAM STATUS: non-authoritative — no undeclared surface mounting

import type { Touchpoint } from "../../../../packages/contracts-core/src/chassis/touchpoint.contract.js";
import {
  TOUCHPOINT_IDS,
  SURFACE_IDS,
} from "../../../../packages/contracts-core/src/chassis/domain.js";

export const INSTALL_MOUNT: Touchpoint = {
  touchpoint_id: TOUCHPOINT_IDS.CLI_INSTALL,
  surface_id: SURFACE_IDS.CLI_FACTORY,
};

export function isMountAuthorized(): boolean {
  return INSTALL_MOUNT.surface_id === SURFACE_IDS.CLI_FACTORY;
}
