// Local-host session transport link
// DOWNSTREAM STATUS: non-authoritative — transport only, session logic separate from resolver authority

export interface SessionLinkConfig {
  readonly bridge_ready: boolean;
  readonly activation_eligible: boolean;
}

export function isSessionLinkAvailable(config: SessionLinkConfig): boolean {
  return config.bridge_ready && config.activation_eligible;
}
