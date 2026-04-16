// Schema structured validators
// DOWNSTREAM STATUS: non-authoritative.
//
// These validators compose:
//   1. the existing shape predicate from packages/schema-chassis
//   2. canonical enum-domain membership (from contracts-core/chassis/domain.ts)
//   3. id-domain checks where applicable (from ./id-domain.validator.ts)
//
// Manifest declaration fields (`declaration_kind`, `declaration_state`,
// `declaration_scope`) are intentionally held at string-only validation per
// FullBody | WB | P2.1 instruction #5. This file does not import or reference
// the empty `DECLARATION_*` placeholders from the domain layer.

import {
  isValidRoute,
  isValidSurface,
  isValidTouchpoint,
  isValidEvent,
  isValidTrigger,
  isValidModule,
  isValidInstallStamp,
  isValidResolverOutput,
  isValidDeclarationEnvelope,
  isValidDeclaration,
  isValidManifest,
} from "../../schema-chassis/src/index.js";
import type {
  Route,
  Surface,
  Touchpoint,
  Event,
  Trigger,
  Module,
  InstallStamp,
  ResolverOutput,
  DeclarationEnvelope,
  Declaration,
  Manifest,
} from "../../contracts-core/src/chassis/index.js";
import {
  REGISTRY_STATES,
  LIFECYCLE_STATES,
  STAMP_STATES,
  RESOLVER_STATES,
  CONSISTENCY_RESULTS,
  SHELL_OWNER_IDS,
} from "../../contracts-core/src/chassis/domain.js";
import { fail, pass, type ValidationResult } from "./result.js";
import { FAILURE_CODES } from "./failure-codes.js";
import { validateIdDomain } from "./id-domain.validator.js";

// Helpers ---------------------------------------------------------------------

function isInValueSet<T extends Readonly<Record<string, string>>>(
  set: T,
  value: string,
): boolean {
  for (const k of Object.keys(set) as Array<keyof T>) {
    if (set[k] === value) return true;
  }
  return false;
}

function targetIdOrNull(value: unknown, key: string): string | null {
  if (typeof value === "object" && value !== null) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
  }
  return null;
}

// Route -----------------------------------------------------------------------

export function validateRoute(value: unknown): ValidationResult {
  const validator_id = "validation-chassis.schema.route";
  const target_type = "route";
  const target_id = targetIdOrNull(value, "route_id");

  if (!isValidRoute(value)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.SHAPE_INVALID,
      notes: "route shape is invalid",
    });
  }
  const route = value as Route;
  if (!isInValueSet(REGISTRY_STATES, route.registry_state)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.REGISTRY_STATE_UNKNOWN,
      notes: `registry_state ${route.registry_state} is not in REGISTRY_STATES`,
    });
  }
  const routeIdDomain = validateIdDomain("route", route.route_id);
  if (routeIdDomain.result !== "pass") return routeIdDomain;
  const surfaceIdDomain = validateIdDomain("surface", route.surface_id);
  if (surfaceIdDomain.result !== "pass") return surfaceIdDomain;
  return pass({ validator_id, target_type, target_id });
}

// Surface ---------------------------------------------------------------------

export function validateSurface(value: unknown): ValidationResult {
  const validator_id = "validation-chassis.schema.surface";
  const target_type = "surface";
  const target_id = targetIdOrNull(value, "surface_id");

  if (!isValidSurface(value)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.SHAPE_INVALID,
      notes: "surface shape is invalid",
    });
  }
  const surface = value as Surface;
  if (!isInValueSet(REGISTRY_STATES, surface.registry_state)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.REGISTRY_STATE_UNKNOWN,
      notes: `registry_state ${surface.registry_state} is not in REGISTRY_STATES`,
    });
  }
  if (!isInValueSet(SHELL_OWNER_IDS, surface.shell_owner_id)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.SHELL_OWNER_UNKNOWN,
      notes: `shell_owner_id ${surface.shell_owner_id} is not in SHELL_OWNER_IDS`,
    });
  }
  const idDomain = validateIdDomain("surface", surface.surface_id);
  if (idDomain.result !== "pass") return idDomain;
  return pass({ validator_id, target_type, target_id });
}

// Touchpoint ------------------------------------------------------------------

export function validateTouchpoint(value: unknown): ValidationResult {
  const validator_id = "validation-chassis.schema.touchpoint";
  const target_type = "touchpoint";
  const target_id = targetIdOrNull(value, "touchpoint_id");

  if (!isValidTouchpoint(value)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.SHAPE_INVALID,
      notes: "touchpoint shape is invalid",
    });
  }
  const tp = value as Touchpoint;
  const tpIdDomain = validateIdDomain("touchpoint", tp.touchpoint_id);
  if (tpIdDomain.result !== "pass") return tpIdDomain;
  const surfaceIdDomain = validateIdDomain("surface", tp.surface_id);
  if (surfaceIdDomain.result !== "pass") return surfaceIdDomain;
  return pass({ validator_id, target_type, target_id });
}

// Event -----------------------------------------------------------------------

export function validateEvent(value: unknown): ValidationResult {
  const validator_id = "validation-chassis.schema.event";
  const target_type = "event";
  const target_id = targetIdOrNull(value, "event_id");

  if (!isValidEvent(value)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.SHAPE_INVALID,
      notes: "event shape is invalid",
    });
  }
  const ev = value as Event;
  if (!isInValueSet(REGISTRY_STATES, ev.registry_state)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.REGISTRY_STATE_UNKNOWN,
      notes: `registry_state ${ev.registry_state} is not in REGISTRY_STATES`,
    });
  }
  const idDomain = validateIdDomain("event", ev.event_id);
  if (idDomain.result !== "pass") return idDomain;
  return pass({ validator_id, target_type, target_id });
}

// Trigger ---------------------------------------------------------------------

export function validateTrigger(value: unknown): ValidationResult {
  const validator_id = "validation-chassis.schema.trigger";
  const target_type = "trigger";
  const target_id = targetIdOrNull(value, "trigger_id");

  if (!isValidTrigger(value)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.SHAPE_INVALID,
      notes: "trigger shape is invalid",
    });
  }
  const trg = value as Trigger;
  if (!isInValueSet(REGISTRY_STATES, trg.registry_state)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.REGISTRY_STATE_UNKNOWN,
      notes: `registry_state ${trg.registry_state} is not in REGISTRY_STATES`,
    });
  }
  const idDomain = validateIdDomain("trigger", trg.trigger_id);
  if (idDomain.result !== "pass") return idDomain;
  return pass({ validator_id, target_type, target_id });
}

// Module ----------------------------------------------------------------------

export function validateModule(value: unknown): ValidationResult {
  const validator_id = "validation-chassis.schema.module";
  const target_type = "module";
  const target_id = targetIdOrNull(value, "module_id");

  if (!isValidModule(value)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.SHAPE_INVALID,
      notes: "module shape is invalid",
    });
  }
  const m = value as Module;
  if (!isInValueSet(REGISTRY_STATES, m.registry_state)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.REGISTRY_STATE_UNKNOWN,
      notes: `registry_state ${m.registry_state} is not in REGISTRY_STATES`,
    });
  }
  if (!isInValueSet(LIFECYCLE_STATES, m.lifecycle_state)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.LIFECYCLE_STATE_UNKNOWN,
      notes: `lifecycle_state ${m.lifecycle_state} is not in LIFECYCLE_STATES`,
    });
  }
  const idDomain = validateIdDomain("module", m.module_id);
  if (idDomain.result !== "pass") return idDomain;
  return pass({ validator_id, target_type, target_id });
}

// InstallStamp ----------------------------------------------------------------

export function validateInstallStamp(value: unknown): ValidationResult {
  const validator_id = "validation-chassis.schema.install-stamp";
  const target_type = "install_stamp";
  const target_id = targetIdOrNull(value, "install_stamp_law_ref");

  if (!isValidInstallStamp(value)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.SHAPE_INVALID,
      notes: "install stamp shape is invalid",
    });
  }
  const stamp = value as InstallStamp;
  if (!isInValueSet(STAMP_STATES, stamp.stamp_state)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.STAMP_STATE_UNKNOWN,
      notes: `stamp_state ${stamp.stamp_state} is not in STAMP_STATES`,
    });
  }
  return pass({ validator_id, target_type, target_id });
}

// ResolverOutput --------------------------------------------------------------

export function validateResolverOutput(value: unknown): ValidationResult {
  const validator_id = "validation-chassis.schema.resolver-output";
  const target_type = "resolver_output";
  const target_id = targetIdOrNull(value, "resolver_run_id");

  if (!isValidResolverOutput(value)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.SHAPE_INVALID,
      notes: "resolver output shape is invalid",
    });
  }
  const ro = value as ResolverOutput;
  if (!isInValueSet(RESOLVER_STATES, ro.resolver_state)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.RESOLVER_STATE_UNKNOWN,
      notes: `resolver_state ${ro.resolver_state} is not in RESOLVER_STATES`,
    });
  }
  if (!isInValueSet(CONSISTENCY_RESULTS, ro.consistency_result)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.CONSISTENCY_RESULT_UNKNOWN,
      notes: `consistency_result ${ro.consistency_result} is not in CONSISTENCY_RESULTS`,
    });
  }
  return pass({ validator_id, target_type, target_id });
}

// Manifest --------------------------------------------------------------------
//
// HOLD: declaration_kind / declaration_state / declaration_scope are validated
// at string shape only per FullBody | WB | P2.1 instruction #5.
// Do NOT bind to DECLARATION_KINDS / DECLARATION_STATES / DECLARATION_SCOPES;
// those placeholder sets are empty.

export function validateDeclarationEnvelope(value: unknown): ValidationResult {
  const validator_id = "validation-chassis.schema.declaration-envelope";
  const target_type = "declaration_envelope";
  const target_id = targetIdOrNull(value, "declaration_envelope_id");

  if (!isValidDeclarationEnvelope(value)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.SHAPE_INVALID,
      notes: "declaration envelope shape is invalid",
    });
  }
  // declaration_scope intentionally NOT enum-checked: empty placeholder.
  const _envelope = value as DeclarationEnvelope;
  void _envelope;
  return pass({
    validator_id,
    target_type,
    target_id,
    notes: "declaration_scope held at string-only (DECLARATION_SCOPES placeholder is empty)",
  });
}

export function validateDeclaration(value: unknown): ValidationResult {
  const validator_id = "validation-chassis.schema.declaration";
  const target_type = "declaration";
  const target_id = targetIdOrNull(value, "declaration_id");

  if (!isValidDeclaration(value)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.SHAPE_INVALID,
      notes: "declaration shape is invalid",
    });
  }
  // declaration_kind, declaration_state intentionally NOT enum-checked: empty placeholders.
  const _decl = value as Declaration;
  void _decl;
  return pass({
    validator_id,
    target_type,
    target_id,
    notes: "declaration_kind/declaration_state held at string-only (DECLARATION_KINDS/DECLARATION_STATES placeholders are empty)",
  });
}

export function validateManifest(value: unknown): ValidationResult {
  const validator_id = "validation-chassis.schema.manifest";
  const target_type = "manifest";
  const target_id = targetIdOrNull(value, "envelope.declaration_envelope_id");

  if (!isValidManifest(value)) {
    return fail({
      validator_id,
      target_type,
      target_id,
      failure_code: FAILURE_CODES.SHAPE_INVALID,
      notes: "manifest shape is invalid",
    });
  }
  const m = value as Manifest;
  // Compose: validate envelope structurally, validate every declaration structurally.
  const envelopeResult = validateDeclarationEnvelope(m.envelope);
  if (envelopeResult.result !== "pass") return envelopeResult;
  for (const d of m.declarations) {
    const dResult = validateDeclaration(d);
    if (dResult.result !== "pass") return dResult;
  }
  return pass({ validator_id, target_type, target_id });
}
