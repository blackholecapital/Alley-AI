// Upstream authority: xyz-factory-system/invariants/chassis/lifecycle/update.md
// DOWNSTREAM STATUS: non-authoritative — lifecycle helpers only, no approval authority

import { type LifecycleState, LIFECYCLE_STATES } from "../../contracts-core/src/chassis/domain.js";

export interface UpdateContext {
  readonly module_id: string;
  readonly current_lifecycle_state: LifecycleState;
}

export function isUpdateEligible(ctx: UpdateContext): boolean {
  return ctx.current_lifecycle_state === LIFECYCLE_STATES.INSTALLED;
}
