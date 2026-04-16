// Session transport contract
// DOWNSTREAM STATUS: non-authoritative — session logic separate from resolver authority
// Transport connects sessions to touchpoint-enabled surfaces after activation gates pass

export interface TransportState {
  readonly bridge_activatable: boolean;
  readonly activation_eligible: boolean;
  readonly touchpoint_enabled: boolean;
}

export function isTransportReady(state: TransportState): boolean {
  return (
    state.bridge_activatable &&
    state.activation_eligible &&
    state.touchpoint_enabled
  );
}
