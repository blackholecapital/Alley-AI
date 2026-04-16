// Upstream authority: xyz-factory-system
// DOWNSTREAM STATUS: non-authoritative — canonical consumption-point map.
//
// WA P4.0 — declares which proof adapters feed which layers of the
// current Full Body stack. This file is documentation as data: it is
// not imported by any gate; it exists so operator tooling and future
// passes can discover the integration targets without scraping source.
//
// The map describes intent only. It does not wire anything up. Stage
// WA P4.1 wires the install-chain adapter into a single non-authoritative
// call site; stage WA P4.2 wires the compatibility adapter. Until
// those stages land, the adapters are import-only.

import {
  CONSUMPTION_POINTS,
  PROOF_KINDS,
  type ConsumptionPoint,
  type ProofKind,
} from "./result-domain.js";

export interface ConsumptionBinding {
  readonly consumption_point: ConsumptionPoint;
  readonly proof_kinds: readonly ProofKind[];
  /**
   * Non-authoritative references to existing files that WILL be the
   * read sites for the corresponding adapter. No imports cross this
   * boundary today. These paths are informational.
   */
  readonly target_files: readonly string[];
  /**
   * Whether the binding is wired into runtime code yet. WA P4.0 is
   * import-only, so every binding starts with `wired: false`.
   */
  readonly wired: boolean;
}

export const CONSUMPTION_MAP: readonly ConsumptionBinding[] = [
  {
    consumption_point: CONSUMPTION_POINTS.ROUTE_LAYER,
    proof_kinds: [PROOF_KINDS.VALIDATION, PROOF_KINDS.COMPATIBILITY],
    target_files: [
      "apps/core-runtime/src/routes/install.route.ts",
      "apps/core-runtime/src/routes/update.route.ts",
      "apps/core-runtime/src/routes/disable.route.ts",
      "apps/core-runtime/src/routes/remove.route.ts",
      "packages/registry-chassis/src/route-registry.ts",
    ],
    wired: false,
  },
  {
    consumption_point: CONSUMPTION_POINTS.TOUCHPOINT_LAYER,
    proof_kinds: [PROOF_KINDS.VALIDATION, PROOF_KINDS.COMPATIBILITY],
    target_files: [
      "apps/core-runtime/src/touchpoints/install.touchpoint.ts",
      "apps/core-runtime/src/touchpoints/update.touchpoint.ts",
      "apps/core-runtime/src/touchpoints/disable.touchpoint.ts",
      "apps/core-runtime/src/touchpoints/remove.touchpoint.ts",
      "apps/operator-shell/src/mounts/install.mount.ts",
      "apps/operator-shell/src/mounts/update.mount.ts",
      "apps/web-public/src/mounts/disable.mount.ts",
      "apps/web-public/src/mounts/remove.mount.ts",
    ],
    wired: false,
  },
  {
    consumption_point: CONSUMPTION_POINTS.BRIDGE_GATE_LAYER,
    proof_kinds: [PROOF_KINDS.INSTALL_CHAIN],
    target_files: [
      "packages/lifecycle-chassis/src/install.lifecycle.ts",
      "packages/runtime-bridge/src/bridge-contract.ts",
      "apps/core-runtime/src/session/activation-gate.ts",
      "apps/local-host/src/bridge/runtime-bridge.ts",
    ],
    wired: false,
  },
  {
    consumption_point: CONSUMPTION_POINTS.SHELL_OPERATOR_PATH,
    proof_kinds: [PROOF_KINDS.AGGREGATE],
    target_files: [
      "apps/operator-shell/src/app/layout/shell.layout.ts",
      "apps/web-public/src/app/layout/shell.layout.ts",
    ],
    wired: false,
  },
];
