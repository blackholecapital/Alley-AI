// Upstream authority: xyz-factory-system/invariants/chassis/lifecycle/remove.md
// DOWNSTREAM STATUS: non-authoritative — lifecycle helpers only, no approval authority

import { type LifecycleState, LIFECYCLE_STATES } from "../../contracts-core/src/chassis/domain.js";

export interface RemoveContext {
  readonly module_id: string;
  readonly current_lifecycle_state: LifecycleState;
}

export function isRemoveEligible(ctx: RemoveContext): boolean {
  return (
    ctx.current_lifecycle_state === LIFECYCLE_STATES.INSTALLED ||
    ctx.current_lifecycle_state === LIFECYCLE_STATES.DISABLED
  );
}
