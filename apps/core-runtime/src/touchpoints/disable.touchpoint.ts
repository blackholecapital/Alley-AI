// Touchpoint consumer: disable
// DOWNSTREAM STATUS: non-authoritative — consumes declared contracts only

import type { Touchpoint } from "../../../../packages/contracts-core/src/chassis/touchpoint.contract.js";
import type { TouchpointEventRefs } from "./install.touchpoint.js";
import {
  TOUCHPOINT_IDS,
  SURFACE_IDS,
  EVENT_IDS,
} from "../../../../packages/contracts-core/src/chassis/domain.js";

export const DISABLE_TOUCHPOINT: Touchpoint = {
  touchpoint_id: TOUCHPOINT_IDS.API_DISABLE,
  surface_id: SURFACE_IDS.API_FACTORY,
};

export const DISABLE_EVENTS: TouchpointEventRefs = {
  request_event_id: EVENT_IDS.CHASSIS_DISABLE_REQUESTED,
  completion_event_id: EVENT_IDS.CHASSIS_DISABLE_COMPLETED,
  failure_event_id: EVENT_IDS.CHASSIS_DISABLE_FAILED,
};
