// Touchpoint consumer: update
// DOWNSTREAM STATUS: non-authoritative — consumes declared contracts only

import type { Touchpoint } from "../../../../packages/contracts-core/src/chassis/touchpoint.contract.js";
import type { TouchpointEventRefs } from "./install.touchpoint.js";
import {
  TOUCHPOINT_IDS,
  SURFACE_IDS,
  EVENT_IDS,
} from "../../../../packages/contracts-core/src/chassis/domain.js";

export const UPDATE_TOUCHPOINT: Touchpoint = {
  touchpoint_id: TOUCHPOINT_IDS.CLI_UPDATE,
  surface_id: SURFACE_IDS.CLI_FACTORY,
};

export const UPDATE_EVENTS: TouchpointEventRefs = {
  request_event_id: EVENT_IDS.CHASSIS_UPDATE_REQUESTED,
  completion_event_id: EVENT_IDS.CHASSIS_UPDATE_COMPLETED,
  failure_event_id: EVENT_IDS.CHASSIS_UPDATE_FAILED,
};
