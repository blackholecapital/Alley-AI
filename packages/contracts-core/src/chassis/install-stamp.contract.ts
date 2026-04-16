// Upstream authority: xyz-factory-system/invariants/chassis/types/InstallStamp.contract.md
// DOWNSTREAM STATUS: non-authoritative — derived from canonical contract only

import type { StampState, ResolverState, ConsistencyResult } from "./domain.js";

export interface InstallStamp {
  readonly install_stamp_law_ref: string;
  readonly resolver_run_id: string;
  readonly stamp_state: StampState;
}

export interface ResolverOutput {
  readonly resolver_run_id: string;
  readonly resolved_declaration_envelope_id: string;
  readonly resolved_registry_artifact_ids: readonly string[];
  readonly resolver_state: ResolverState;
  readonly consistency_result: ConsistencyResult;
}
