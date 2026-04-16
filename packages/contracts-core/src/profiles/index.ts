// Barrel export — packages/contracts-core/src/profiles
// DOWNSTREAM STATUS: non-authoritative — profile constraint layer only

export {
  PROFILE_IDS,
  CHASSIS_PROFILE_STATUSES,
  DERIVATION_MODES,
} from "./profile-domain.js";
export type {
  ProfileId,
  ChassisProfileStatus,
  DerivationMode,
  ProfileExposure,
  ProfileConstraint,
} from "./profile-domain.js";

export {
  FULL_BODY_PROFILE,
  MOBILE_OPTIMIZED_PROFILE,
  PC_OPTIMIZED_PROFILE,
  PROFILE_COMPATIBILITY_MAP,
  lookupProfile,
  listProfiles,
} from "./compatibility-map.js";
