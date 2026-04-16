// Proof sibling: routes
// DOWNSTREAM STATUS: non-authoritative — wraps already-computed route
// validation and compatibility facts into structured ProofResults for the
// proof-chassis consumption path.
//
// FullBody | WB | P4.1 — step 1 (route layer attachment).
//
// Scope (per WB P4.prep.2 decision):
//   * additive sibling file only
//   * wraps existing route validation and compatibility facts only
//   * no route mutation
//   * no registry expansion
//   * no closed-set expansion (PROOF_KINDS / CONSUMPTION_POINTS /
//     FAILURE_CODES / RETRYABILITY / INSTALL_CHAIN_GATES are all used as-is)
//   * FULL_BODY_PROFILE is the only profile consulted; Mobile / PC remain
//     unresolved and are not touched here
//
// Rollback: `git rm apps/core-runtime/src/routes/proof.ts`.

import {
  adaptValidationResult,
  adaptCompatibilityResult,
  COMPATIBILITY_KINDS,
  CONSUMPTION_POINTS,
  type ProofResult,
} from "../../../../packages/proof-chassis/src/index.js";
import { isValidRoute } from "../../../../packages/schema-chassis/src/index.js";
import { FULL_BODY_PROFILE } from "../../../../packages/contracts-core/src/index.js";
import type { Route } from "../../../../packages/contracts-core/src/chassis/route.contract.js";
import { INSTALL_ROUTE } from "./install.route.js";
import { UPDATE_ROUTE } from "./update.route.js";
import { DISABLE_ROUTE } from "./disable.route.js";
import { REMOVE_ROUTE } from "./remove.route.js";

const ROUTES: readonly Route[] = [
  INSTALL_ROUTE,
  UPDATE_ROUTE,
  DISABLE_ROUTE,
  REMOVE_ROUTE,
];

function routeValidationProof(route: Route): ProofResult {
  return adaptValidationResult({
    target_name: `Route::${route.route_id}`,
    passed: isValidRoute(route),
    consumption_point: CONSUMPTION_POINTS.ROUTE_LAYER,
  });
}

function routeCompatibilityProof(route: Route): ProofResult {
  return adaptCompatibilityResult({
    profile: FULL_BODY_PROFILE,
    kind: COMPATIBILITY_KINDS.ROUTE,
    id: route.route_id,
    consumption_point: CONSUMPTION_POINTS.ROUTE_LAYER,
  });
}

/**
 * Emit one ProofResult pair (validation + compatibility) per declared
 * chassis route. The returned array is deterministic and ordered:
 * [INSTALL, UPDATE, DISABLE, REMOVE] × [validation, compatibility].
 */
export function routeProofs(): readonly ProofResult[] {
  const results: ProofResult[] = [];
  for (const r of ROUTES) {
    results.push(routeValidationProof(r));
    results.push(routeCompatibilityProof(r));
  }
  return results;
}
