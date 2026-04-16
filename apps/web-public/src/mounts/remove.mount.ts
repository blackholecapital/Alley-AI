// Mount: remove touchpoint on sf.api.factory
// DOWNSTREAM STATUS: non-authoritative — no undeclared surface mounting

import type { Touchpoint } from "../../../../packages/contracts-core/src/chassis/touchpoint.contract.js";
import {
  TOUCHPOINT_IDS,
  SURFACE_IDS,
} from "../../../../packages/contracts-core/src/chassis/domain.js";

export const REMOVE_MOUNT: Touchpoint = {
  touchpoint_id: TOUCHPOINT_IDS.API_REMOVE,
  surface_id: SURFACE_IDS.API_FACTORY,
};

export function isMountAuthorized(): boolean {
  return REMOVE_MOUNT.surface_id === SURFACE_IDS.API_FACTORY;
}
