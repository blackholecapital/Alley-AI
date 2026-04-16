// Touchpoint consumer: install
// DOWNSTREAM STATUS: non-authoritative — consumes declared contracts only, no direct module coupling

import type { Touchpoint } from "../../../../packages/contracts-core/src/chassis/touchpoint.contract.js";
import {
  type EventId,
  TOUCHPOINT_IDS,
  SURFACE_IDS,
  EVENT_IDS,
} from "../../../../packages/contracts-core/src/chassis/domain.js";

export const INSTALL_TOUCHPOINT: Touchpoint = {
  touchpoint_id: TOUCHPOINT_IDS.CLI_INSTALL,
  surface_id: SURFACE_IDS.CLI_FACTORY,
};

export interface TouchpointEventRefs {
  readonly request_event_id: EventId;
  readonly completion_event_id: EventId;
  readonly failure_event_id: EventId;
}

export const INSTALL_EVENTS: TouchpointEventRefs = {
  request_event_id: EVENT_IDS.CHASSIS_INSTALL_REQUESTED,
  completion_event_id: EVENT_IDS.CHASSIS_INSTALL_COMPLETED,
  failure_event_id: EVENT_IDS.CHASSIS_INSTALL_FAILED,
};
