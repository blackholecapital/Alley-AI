// Mount: update touchpoint on sf.cli.factory
// DOWNSTREAM STATUS: non-authoritative — no undeclared surface mounting

import type { Touchpoint } from "../../../../packages/contracts-core/src/chassis/touchpoint.contract.js";
import {
  TOUCHPOINT_IDS,
  SURFACE_IDS,
} from "../../../../packages/contracts-core/src/chassis/domain.js";

export const UPDATE_MOUNT: Touchpoint = {
  touchpoint_id: TOUCHPOINT_IDS.CLI_UPDATE,
  surface_id: SURFACE_IDS.CLI_FACTORY,
};

export function isMountAuthorized(): boolean {
  return UPDATE_MOUNT.surface_id === SURFACE_IDS.CLI_FACTORY;
}
