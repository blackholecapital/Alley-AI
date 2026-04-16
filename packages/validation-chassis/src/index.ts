// Barrel export — packages/validation-chassis
// DOWNSTREAM STATUS: non-authoritative

// Result shape + helpers
export type {
  ValidationResult,
  ValidationOutcome,
  PassInputs,
  FailInputs,
  SkipInputs,
} from "./result.js";
export { pass, fail, skipped, isPass, firstFailure, allPass } from "./result.js";

// Failure code vocabulary
export { FAILURE_CODES } from "./failure-codes.js";
export type { FailureCode } from "./failure-codes.js";

// Id-domain
export {
  isKnownRouteId,
  isKnownSurfaceId,
  isKnownTouchpointId,
  isKnownTriggerId,
  isKnownEventId,
  isKnownModuleId,
  isKnownShellOwnerId,
  validateIdDomain,
} from "./id-domain.validator.js";
export type { IdDomainKind } from "./id-domain.validator.js";

// Cross-checks
export { validateRouteSurface } from "./route-surface.validator.js";
export { validateTouchpointSurface } from "./touchpoint-surface.validator.js";
export {
  validateTouchpointEvents,
} from "./touchpoint-event.validator.js";
export type { TouchpointEventRefsShape } from "./touchpoint-event.validator.js";
export { validateTriggerEvent } from "./trigger-event.validator.js";

// Lifecycle transition
export { validateLifecycleTransition } from "./lifecycle-transition.validator.js";
export type {
  LifecycleAction,
  LifecycleTransitionInputs,
} from "./lifecycle-transition.validator.js";

// Install-chain steps
export {
  validateBridgeActivatable,
  validateLocalBridgeReady,
  validateActivationEligible,
  validateTransportReady,
  validateSessionLinkAvailable,
} from "./install-chain.validator.js";
export type {
  BridgeActivationInputs,
  LocalBridgeReadyInputs,
  ActivationEligibilityInputs,
  TransportReadyInputs,
  SessionLinkInputs,
} from "./install-chain.validator.js";

// Mount authorization
export { validateMountAuthorization } from "./mount.validator.js";
export type { MountAuthorizationInputs } from "./mount.validator.js";

// Schema structured validators
export {
  validateRoute,
  validateSurface,
  validateTouchpoint,
  validateEvent,
  validateTrigger,
  validateModule,
  validateInstallStamp,
  validateResolverOutput,
  validateDeclarationEnvelope,
  validateDeclaration,
  validateManifest,
} from "./schema.validator.js";

// Compatibility / profile-membership (WB P3.1)
export {
  classifyExposure,
  validateProfileShell,
  validateProfileSurface,
  validateProfileRoute,
  validateProfileTouchpoint,
  validateProfileMount,
} from "./compatibility.validator.js";
export type { ExposureClass } from "./compatibility.validator.js";

export { validateShellSurface } from "./shell-surface.validator.js";
export type { ShellSurfaceInputs } from "./shell-surface.validator.js";

export { validateShellMount } from "./shell-mount.validator.js";
export type { ShellMountInputs } from "./shell-mount.validator.js";

export { validateMountSurfaceUnderProfile } from "./mount-compatibility.validator.js";
export type { MountSurfaceCompatibilityInputs } from "./mount-compatibility.validator.js";

export {
  validateBridgeActivatableUnderProfile,
  validateLocalBridgeReadyUnderProfile,
  validateActivationEligibleUnderProfile,
  validateTransportReadyUnderProfile,
  validateSessionLinkAvailableUnderProfile,
} from "./profile-runtime-gate.validator.js";
export type {
  ProfileBridgeActivationInputs,
  ProfileLocalBridgeReadyInputs,
  ProfileActivationEligibilityInputs,
  ProfileTransportReadyInputs,
  ProfileSessionLinkInputs,
} from "./profile-runtime-gate.validator.js";
